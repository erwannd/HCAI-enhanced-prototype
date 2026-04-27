const { OpenAI } = require('openai');

const CanvasState = require('../models/CanvasState');
const Interaction = require('../models/Interaction');
const confidenceCalculator = require('./confidenceCalculator');
const retrievalService = require('./retrievalService');
const { formatCanvasForPrompt, serializeCanvasState } = require('../utils/canvasSerializer');

class ChatService {
  constructor() {
    this.model = 'gpt-4.1-mini';
    this.openai = null;
  }

  getClient() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is missing. Chat completion is unavailable.');
    }

    if (!this.openai) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }

    return this.openai;
  }

  async getRecentSessionHistory(sessionID, limit = 5) {
    const interactions = await Interaction.find({ sessionID })
      .sort({ timestamp: -1 })
      .limit(limit);

    return interactions.reverse();
  }

  async getCurrentCanvasContext(sessionID) {
    const canvasState = await CanvasState.findOne({ sessionID }).lean();

    if (!canvasState) {
      return {
        revision: 0,
        nodes: [],
        edges: [],
      };
    }

    // Re-serialize the state so only semantic data reaches the prompt.
    return {
      revision: canvasState.revision || 0,
      ...serializeCanvasState(canvasState),
    };
  }

  async createChatTurn(session, userInput, options = {}) {
    const retrievalMethod = options.retrievalMethod || 'semantic';
    const recentHistory = await this.getRecentSessionHistory(session.sessionID, 5);
    const canvasContext = await this.getCurrentCanvasContext(session.sessionID);
    const retrieved = await retrievalService.retrieve(session.sessionID, userInput, {
      method: retrievalMethod,
      topK: 3,
    });

    const retrievedDocuments = retrieved.map((chunk) => ({
      docName: chunk.documentName,
      chunkIndex: chunk.chunkIndex,
      chunkText: chunk.chunkText,
      relevanceScore: chunk.relevanceScore,
    }));

    const evidenceText = retrievedDocuments.length > 0
      ? retrievedDocuments
        .map((document) => `${document.docName} chunk ${document.chunkIndex}: ${document.chunkText}`)
        .join('\n\n')
      : 'No supporting documents were retrieved for this session.';

    const historyMessages = recentHistory.flatMap((interaction) => [
      {
        role: 'user',
        content: interaction.userInput,
      },
      {
        role: 'assistant',
        content: interaction.botResponse,
      },
    ]);

    const messages = [
      {
        role: 'system',
        content: [
          'You are a study assistant for a human-centered AI learning tool.',
          'Use the current session context only.',
          'Prefer grounded answers using the retrieved evidence and the learner canvas.',
          'If the evidence is weak or missing, say so clearly instead of inventing facts.',
        ].join(' '),
      },
      ...historyMessages,
      {
        role: 'system',
        content: `Current canvas context:\n${formatCanvasForPrompt(canvasContext)}`,
      },
      {
        role: 'system',
        content: `Retrieved evidence:\n${evidenceText}`,
      },
      {
        role: 'user',
        content: userInput,
      },
    ];

    const client = this.getClient();
    const completion = await client.chat.completions.create({
      model: this.model,
      messages,
      max_tokens: 300,
    });

    const botResponse = completion.choices[0]?.message?.content?.trim() || '';
    const confidenceMetrics = confidenceCalculator.calculate({
      retrievedDocs: retrieved,
      retrievalMethod,
    });

    const interaction = await Interaction.create({
      participantID: session.participantID,
      systemID: session.systemID,
      sessionID: session.sessionID,
      userInput,
      botResponse,
      retrievalMethod,
      retrievedDocuments,
      confidenceMetrics,
      canvasRevision: canvasContext.revision,
      canvasContextSnapshot: canvasContext,
    });

    return {
      interaction,
      botResponse,
      retrievedDocuments,
      confidenceMetrics,
      canvasContextSnapshot: canvasContext,
    };
  }
}

module.exports = new ChatService();
