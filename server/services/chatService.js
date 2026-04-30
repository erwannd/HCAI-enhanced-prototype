const { randomUUID } = require('crypto');
const { OpenAI } = require('openai');

const CanvasState = require('../models/CanvasState');
const Interaction = require('../models/Interaction');
const StudySession = require('../models/StudySession');
const confidenceCalculator = require('./confidenceCalculator');
const retrievalService = require('./retrievalService');
const { formatCanvasForPrompt, projectCanvasStateForPrompt } = require('../utils/canvasSerializer');

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

  isDebugLoggingEnabled() {
    return process.env.NODE_ENV !== 'production';
  }

  logCanvasSuggestionDebug(stage, payload) {
    if (!this.isDebugLoggingEnabled()) {
      return;
    }

    console.log(`[CanvasSuggestions] ${stage}\n${JSON.stringify(payload, null, 2)}`);
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

    // Project the stored layout-rich canvas into a semantic-only prompt view.
    return projectCanvasStateForPrompt(canvasState);
  }

  async buildSessionContext(session, userInput, retrievalMethod = 'semantic') {
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

    const historyTranscript = recentHistory.length > 0
      ? recentHistory
        .map(
          (interaction) =>
            `User: ${interaction.userInput}\nAssistant: ${interaction.botResponse}`,
        )
        .join('\n\n')
      : 'No previous interactions are available for this session yet.';

    return {
      recentHistory,
      historyMessages,
      historyTranscript,
      canvasContext,
      retrieved,
      retrievedDocuments,
      evidenceText,
      retrievalMethod,
    };
  }

  buildAnswerMessages({ historyMessages, canvasContext, evidenceText, userInput }) {
    return [
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
  }

  generateNodeId(title = '') {
    const slug = String(title || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32);

    const randomPart = randomUUID().slice(0, 8);

    return `node-${slug || 'suggested'}-${randomPart}`;
  }

  generateEdgeId() {
    const randomPart = randomUUID().slice(0, 8);

    return `edge-${randomPart}`;
  }

  normalizeNodeType(value) {
    const normalized = String(value || '').toLowerCase();
    return ['concept', 'note', 'example', 'question'].includes(normalized) ? normalized : 'concept';
  }

  normalizeSuggestionOperations(rawSuggestions, canvasContext) {
    if (!Array.isArray(rawSuggestions)) {
      return [];
    }

    const existingNodeIds = new Set((canvasContext.nodes || []).map((node) => node.nodeID));
    const existingEdgeIds = new Set((canvasContext.edges || []).map((edge) => edge.edgeID));

    return rawSuggestions
      .map((rawSuggestion, suggestionIndex) => {
        const localNodeIds = new Set(existingNodeIds);
        const operations = [];

        const rawOperations = Array.isArray(rawSuggestion.operations) ? rawSuggestion.operations : [];

        rawOperations.forEach((operation) => {
          const type = String(operation?.type || '').trim();

          if (type === 'add_node') {
            const rawNode = operation.node || {};
            const nodeTitle = String(rawNode.title || '').trim();
            const nodeText = String(rawNode.text || '').trim();

            if (!nodeTitle && !nodeText) {
              return;
            }

            let nodeID = String(rawNode.nodeID || '').trim();
            if (!nodeID || localNodeIds.has(nodeID)) {
              nodeID = this.generateNodeId(nodeTitle);
            }

            localNodeIds.add(nodeID);

            operations.push({
              type: 'add_node',
              node: {
                nodeID,
                nodeType: this.normalizeNodeType(rawNode.nodeType),
                title: nodeTitle,
                text: nodeText,
              },
            });
            return;
          }

          if (type === 'update_node') {
            const nodeID = String(operation.nodeID || '').trim();
            if (!nodeID || !existingNodeIds.has(nodeID)) {
              return;
            }

            const patch = operation.patch || {};
            const normalizedPatch = {
              title: typeof patch.title === 'string' ? patch.title.trim() : undefined,
              text: typeof patch.text === 'string' ? patch.text.trim() : undefined,
              nodeType: typeof patch.nodeType === 'string' ? this.normalizeNodeType(patch.nodeType) : undefined,
            };

            if (
              normalizedPatch.title === undefined &&
              normalizedPatch.text === undefined &&
              normalizedPatch.nodeType === undefined
            ) {
              return;
            }

            operations.push({
              type: 'update_node',
              nodeID,
              patch: normalizedPatch,
            });
            return;
          }

          if (type === 'delete_node') {
            const nodeID = String(operation.nodeID || '').trim();
            if (!nodeID || !existingNodeIds.has(nodeID)) {
              return;
            }

            operations.push({
              type: 'delete_node',
              nodeID,
            });
            return;
          }

          if (type === 'add_edge') {
            const rawEdge = operation.edge || {};
            const sourceNodeID = String(rawEdge.sourceNodeID || '').trim();
            const targetNodeID = String(rawEdge.targetNodeID || '').trim();

            if (!sourceNodeID || !targetNodeID) {
              return;
            }

            if (!localNodeIds.has(sourceNodeID) || !localNodeIds.has(targetNodeID)) {
              return;
            }

            let edgeID = String(rawEdge.edgeID || '').trim();
            if (!edgeID || existingEdgeIds.has(edgeID)) {
              edgeID = this.generateEdgeId();
            }

            operations.push({
              type: 'add_edge',
              edge: {
                edgeID,
                sourceNodeID,
                targetNodeID,
                label: String(rawEdge.label || '').trim(),
              },
            });
            return;
          }

          if (type === 'remove_edge') {
            const edgeID = String(operation.edgeID || '').trim();
            if (!edgeID || !existingEdgeIds.has(edgeID)) {
              return;
            }

            operations.push({
              type: 'remove_edge',
              edgeID,
            });
          }
        });

        if (operations.length === 0) {
          return null;
        }

        return {
          id: String(rawSuggestion.id || `suggestion-${suggestionIndex + 1}`).trim(),
          title: String(rawSuggestion.title || 'Canvas suggestion').trim(),
          summary: String(rawSuggestion.summary || '').trim(),
          reason: String(rawSuggestion.reason || '').trim(),
          operations,
        };
      })
      .filter(Boolean);
  }

  extractSuggestionPayload(content) {
    if (!content || typeof content !== 'string') {
      return { suggestions: [] };
    }

    const trimmed = content.trim();

    try {
      return JSON.parse(trimmed);
    } catch (error) {
      const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

      if (fencedMatch?.[1]) {
        try {
          return JSON.parse(fencedMatch[1]);
        } catch (fencedError) {
          console.warn('Could not parse fenced JSON suggestion payload:', fencedError);
        }
      }

      console.warn('Could not parse suggestion payload as JSON:', error);
      return { suggestions: [] };
    }
  }

  normalizeFollowUpQuestions(rawQuestions) {
    if (!Array.isArray(rawQuestions)) {
      return [];
    }

    const seen = new Set();

    return rawQuestions
      .map((question) => String(question || '').trim())
      .filter((question) => {
        if (!question) {
          return false;
        }

        const normalized = question.toLowerCase();
        if (seen.has(normalized)) {
          return false;
        }

        seen.add(normalized);
        return true;
      })
      .slice(0, 3);
  }

  extractFollowUpPayload(content) {
    if (!content || typeof content !== 'string') {
      return { followUpQuestions: [] };
    }

    const trimmed = content.trim();

    try {
      return JSON.parse(trimmed);
    } catch (error) {
      const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

      if (fencedMatch?.[1]) {
        try {
          return JSON.parse(fencedMatch[1]);
        } catch (fencedError) {
          console.warn('Could not parse fenced JSON follow-up payload:', fencedError);
        }
      }

      console.warn('Could not parse follow-up payload as JSON:', error);
      return { followUpQuestions: [] };
    }
  }

  async generateFollowUpQuestions({
    historyTranscript,
    canvasContext,
    evidenceText,
    userInput,
    botResponse,
  }) {
    const prompt = [
      'You are generating concise follow-up prompts for a study assistant interface.',
      'Return only JSON that matches the requested schema.',
      'Write at most 3 short learner-facing follow-up questions.',
      'The questions should be concrete, specific to the latest answer, and useful as clickable next-step prompts.',
      'Do not repeat the user question.',
      'Do not mention the canvas, JSON, or system behavior.',
    ].join(' ');

    const responseSchema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        followUpQuestions: {
          type: 'array',
          maxItems: 3,
          items: {
            type: 'string',
          },
        },
      },
      required: ['followUpQuestions'],
    };

    const messages = [
      {
        role: 'system',
        content: prompt,
      },
      {
        role: 'system',
        content: `Recent conversation transcript:\n${historyTranscript}`,
      },
      {
        role: 'system',
        content: `Current semantic canvas:\n${formatCanvasForPrompt(canvasContext)}`,
      },
      {
        role: 'system',
        content: `Retrieved evidence:\n${evidenceText}`,
      },
      {
        role: 'system',
        content: `Latest assistant answer:\n${botResponse}`,
      },
      {
        role: 'user',
        content: `Based on the learner's latest question "${userInput}", suggest the next follow-up questions.`,
      },
    ];

    const client = this.getClient();
    const completion = await client.chat.completions.create({
      model: this.model,
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'follow_up_question_response',
          schema: responseSchema,
          strict: false,
        },
      },
      max_tokens: 180,
    });

    const parsed = this.extractFollowUpPayload(completion.choices[0]?.message?.content || '');
    return this.normalizeFollowUpQuestions(parsed.followUpQuestions);
  }

  buildFallbackSuggestions(userInput, assistantResponse, canvasContext) {
    const lowerFingerprint = `${userInput} ${assistantResponse}`.toLowerCase();
    let title = 'New concept';
    let text = assistantResponse.split(/[.!?]\s/)[0] || assistantResponse;
    let label = 'extends';

    if (lowerFingerprint.includes('covariance')) {
      title = 'Covariance';
      text = 'How two features change together across the dataset.';
      label = 'connects to';
    } else if (lowerFingerprint.includes('variance')) {
      title = 'Explained Variance';
      text = 'How much of the original data spread is captured by a component.';
      label = 'measures';
    } else if (lowerFingerprint.includes('component') || lowerFingerprint.includes('pca')) {
      title = 'Principal Components';
      text = 'New directions ordered by how much variation they explain.';
      label = 'supports';
    } else if (lowerFingerprint.includes('regress')) {
      title = 'Residuals';
      text = 'The difference between the model prediction and the observed value.';
      label = 'evaluates';
    } else if (lowerFingerprint.includes('cluster')) {
      title = 'Cluster Quality';
      text = 'A check on whether clusters are compact inside and distinct from one another.';
      label = 'evaluates';
    }

    const nodeID = this.generateNodeId(title);
    const operations = [
      {
        type: 'add_node',
        node: {
          nodeID,
          nodeType: 'concept',
          title,
          text,
        },
      },
    ];

    const baseNode = (canvasContext.nodes || []).find((node) => node.nodeType === 'concept')
      || canvasContext.nodes?.[0];

    if (baseNode?.nodeID) {
      operations.push({
        type: 'add_edge',
        edge: {
          edgeID: this.generateEdgeId(),
          sourceNodeID: baseNode.nodeID,
          targetNodeID: nodeID,
          label,
        },
      });
    }

    return [
      {
        id: `suggestion-${randomUUID().slice(0, 8)}`,
        title: `Add ${title}`,
        summary: `Capture ${title.toLowerCase()} on the map as a follow-up to this answer.`,
        reason: 'This keeps the learner-facing map aligned with the latest explanation.',
        operations,
      },
    ];
  }

  async createChatTurn(session, userInput, options = {}) {
    const retrievalMethod = options.retrievalMethod || 'semantic';
    const {
      historyMessages,
      historyTranscript,
      canvasContext,
      retrieved,
      retrievedDocuments,
      evidenceText,
    } = await this.buildSessionContext(session, userInput, retrievalMethod);

    const messages = this.buildAnswerMessages({
      historyMessages,
      canvasContext,
      evidenceText,
      userInput,
    });

    const client = this.getClient();
    const completion = await client.chat.completions.create({
      model: this.model,
      messages,
      max_tokens: 300,
    });

    const botResponse = completion.choices[0]?.message?.content?.trim() || '';
    let followUpQuestions = [];

    try {
      followUpQuestions = await this.generateFollowUpQuestions({
        historyTranscript,
        canvasContext,
        evidenceText,
        userInput,
        botResponse,
      });
    } catch (error) {
      console.warn('Could not generate follow-up questions:', error);
      followUpQuestions = [];
    }

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

    await StudySession.updateOne(
      { sessionID: session.sessionID },
      { $set: { followUpQuestions } },
    );

    return {
      interaction,
      botResponse,
      followUpQuestions,
      retrievedDocuments,
      confidenceMetrics,
      canvasContextSnapshot: canvasContext,
    };
  }

  async createCanvasSuggestions(session, params) {
    const userInput = String(params.userInput || '').trim();
    const assistantResponse = String(params.assistantResponse || '').trim();

    if (!userInput || !assistantResponse) {
      return { suggestions: [] };
    }

    const {
      historyTranscript,
      canvasContext,
      evidenceText,
    } = await this.buildSessionContext(session, userInput, 'semantic');

    const prompt = [
      'You are generating structured concept-map suggestions for a human-centered AI learning tool.',
      'Return only JSON that matches the requested schema.',
      'Do not answer the learner directly.',
      'Suggest at most 2 compact canvas suggestions.',
      'Each suggestion should be useful, grounded in the conversation, and easy for a learner to accept or reject.',
      'Use semantic canvas operations only: add_node, update_node, delete_node, add_edge, remove_edge.',
      'Prefer adding or lightly updating nodes over deleting existing learner content.',
      'When adding an edge, only connect nodes that already exist on the canvas or are also added in the same suggestion.',
    ].join(' ');

    const responseSchema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        suggestions: {
          type: 'array',
          maxItems: 2,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              summary: { type: 'string' },
              reason: { type: 'string' },
              operations: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: true,
                  properties: {
                    type: { type: 'string' },
                    node: { type: 'object' },
                    nodeID: { type: 'string' },
                    patch: { type: 'object' },
                    edge: { type: 'object' },
                    edgeID: { type: 'string' },
                  },
                  required: ['type'],
                },
              },
            },
            required: ['title', 'summary', 'reason', 'operations'],
          },
        },
      },
      required: ['suggestions'],
    };

    const messages = [
      {
        role: 'system',
        content: prompt,
      },
      {
        role: 'system',
        content: `Recent conversation transcript:\n${historyTranscript}`,
      },
      {
        role: 'system',
        content: `Current semantic canvas:\n${formatCanvasForPrompt(canvasContext)}`,
      },
      {
        role: 'system',
        content: `Retrieved evidence:\n${evidenceText}`,
      },
      {
        role: 'system',
        content: `Latest assistant answer:\n${assistantResponse}`,
      },
      {
        role: 'user',
        content: `Based on the learner's latest question "${userInput}", propose optional canvas suggestions.`,
      },
    ];

    const client = this.getClient();
    const completion = await client.chat.completions.create({
      model: this.model,
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'canvas_suggestion_response',
          schema: responseSchema,
          strict: false,
        },
      },
      max_tokens: 500,
    });

    const rawContent = completion.choices[0]?.message?.content || '';
    const parsed = this.extractSuggestionPayload(rawContent);
    const normalizedSuggestions = this.normalizeSuggestionOperations(parsed.suggestions, canvasContext);
    const suggestions = normalizedSuggestions.length > 0
      ? normalizedSuggestions
      : this.buildFallbackSuggestions(userInput, assistantResponse, canvasContext);

    this.logCanvasSuggestionDebug('backend-response', {
      sessionID: session.sessionID,
      userInput,
      assistantResponse,
      rawContent,
      parsedSuggestions: parsed.suggestions || [],
      normalizedSuggestions,
      usedFallback: normalizedSuggestions.length === 0,
      returnedSuggestions: suggestions,
    });

    return {
      suggestions,
    };
  }
}

module.exports = new ChatService();
