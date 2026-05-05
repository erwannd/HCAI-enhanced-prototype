const { OpenAI } = require('openai');
const { zodResponseFormat } = require('openai/helpers/zod');
const { z } = require('zod');

const CanvasState = require('../models/CanvasState');
const Interaction = require('../models/Interaction');
const StudySession = require('../models/StudySession');
const confidenceCalculator = require('./confidenceCalculator');
const retrievalService = require('./retrievalService');
const { formatCanvasForPrompt, projectCanvasStateForPrompt } = require('../utils/canvasSerializer');

const StudyNodeTypeSchema = z.enum(['concept', 'note', 'example', 'question']);
const NonEmptyStringSchema = z.string().trim().min(1);
const NonPlaceholderTitleSchema = NonEmptyStringSchema.refine(
  (value) => !['new concept', 'study note', 'worked example', 'open question'].includes(value.toLowerCase()),
  'Use a specific learner-facing title instead of a placeholder.',
);

const NodePayloadSchema = z.object({
  nodeID: NonEmptyStringSchema,
  nodeType: StudyNodeTypeSchema,
  title: NonPlaceholderTitleSchema,
  text: NonEmptyStringSchema.max(280),
}).strict();

const UpdateNodePatchSchema = z.object({
  title: NonPlaceholderTitleSchema.nullable(),
  text: NonEmptyStringSchema.max(280).nullable(),
  nodeType: StudyNodeTypeSchema.nullable(),
}).strict().refine(
  (patch) => patch.title !== null || patch.text !== null || patch.nodeType !== null,
  'update_node.patch must include at least one change.',
);

const EdgePayloadSchema = z.object({
  edgeID: NonEmptyStringSchema,
  sourceNodeID: NonEmptyStringSchema,
  targetNodeID: NonEmptyStringSchema,
  label: z.string().trim().max(80).nullable(),
}).strict();

const CanvasOperationSchema = z.object({
  type: z.enum(['add_node', 'update_node', 'delete_node', 'add_edge', 'remove_edge']),
  node: NodePayloadSchema.nullable(),
  nodeID: NonEmptyStringSchema.nullable(),
  patch: UpdateNodePatchSchema.nullable(),
  edge: EdgePayloadSchema.nullable(),
  edgeID: NonEmptyStringSchema.nullable(),
}).strict().superRefine((operation, ctx) => {
  if (operation.type === 'add_node') {
    if (!operation.node) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'add_node requires node',
        path: ['node'],
      });
    }
    return;
  }

  if (operation.type === 'update_node') {
    if (!operation.nodeID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'update_node requires nodeID',
        path: ['nodeID'],
      });
    }
    if (!operation.patch) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'update_node requires patch',
        path: ['patch'],
      });
    }
    return;
  }

  if (operation.type === 'delete_node') {
    if (!operation.nodeID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'delete_node requires nodeID',
        path: ['nodeID'],
      });
    }
    return;
  }

  if (operation.type === 'add_edge') {
    if (!operation.edge) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'add_edge requires edge',
        path: ['edge'],
      });
    }
    return;
  }

  if (operation.type === 'remove_edge' && !operation.edgeID) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'remove_edge requires edgeID',
      path: ['edgeID'],
    });
  }
});

const CanvasSuggestionSchema = z.object({
  id: NonEmptyStringSchema,
  title: NonEmptyStringSchema.max(120),
  summary: NonEmptyStringSchema.max(240),
  reason: NonEmptyStringSchema.max(240),
  operations: z.array(CanvasOperationSchema).min(1).max(8),
}).strict();

const CanvasSuggestionResponseSchema = z.object({
  suggestions: z.array(CanvasSuggestionSchema).max(2),
}).strict();

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
      'Return only JSON that matches the requested schema exactly.',
      'Do not answer the learner directly.',
      'Suggest at most 2 compact canvas suggestions.',
      'Each suggestion should be useful, grounded in the conversation, and easy for a learner to accept or reject.',
      'Use semantic canvas operations only: add_node, update_node, delete_node, add_edge, remove_edge.',
      'Prefer adding or lightly updating nodes over deleting existing learner content.',
      'When adding an edge, only connect nodes that already exist on the canvas or are also added in the same suggestion.',
      'For add_node, always provide node.nodeID, node.nodeType, node.title, and node.text.',
      'For add_edge, always provide edge.edgeID, edge.sourceNodeID, edge.targetNodeID, and optionally edge.label.',
      'For update_node, always provide nodeID and patch with one or more of title, text, or nodeType.',
      'Do not use alias field names such as id, label, type, from, or to.',
      'Do not use placeholder titles like "New Concept". Use specific learner-facing titles from the answer content.',
      'If no high-quality suggestion is appropriate, return {"suggestions":[]}.',
      'Prefer a small number of precise operations over broad decompositions.',
      'When the canvas is empty, it is acceptable to return a single add_node suggestion.',
    ].join(' ');

    const exampleResponse = {
      suggestions: [
        {
          id: 'add-self-attention',
          title: 'Add Self-Attention',
          summary: 'Capture self-attention as a core Transformer mechanism on the map.',
          reason: 'It is central to the explanation and helps anchor related ideas like multi-head attention.',
          operations: [
            {
              type: 'add_node',
              node: {
                nodeID: 'node-self-attention',
                nodeType: 'concept',
                title: 'Self-Attention',
                text: 'A mechanism that lets each token weigh other tokens in the same sequence to capture context and relationships.',
              },
            },
          ],
        },
      ],
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
        role: 'system',
        content: `Example valid response:\n${JSON.stringify(exampleResponse, null, 2)}`,
      },
      {
        role: 'user',
        content: `Based on the learner's latest question "${userInput}", propose optional canvas suggestions.`,
      },
    ];

    const client = this.getClient();
    let rawContent = '';
    let parsedSuggestions = [];
    let parseError = null;

    try {
      const completion = await client.chat.completions.parse({
        model: this.model,
        messages,
        response_format: zodResponseFormat(
          CanvasSuggestionResponseSchema,
          'canvas_suggestion_response',
        ),
        max_tokens: 500,
      });

      rawContent = completion.choices[0]?.message?.content || '';
      parsedSuggestions = completion.choices[0]?.message?.parsed?.suggestions || [];
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
      this.logCanvasSuggestionDebug('backend-parse-error', {
        sessionID: session.sessionID,
        userInput,
        assistantResponse,
        error: parseError,
      });
    }

    this.logCanvasSuggestionDebug('backend-response', {
      sessionID: session.sessionID,
      userInput,
      assistantResponse,
      rawContent,
      parsedSuggestions,
      parseError,
      returnedSuggestions: parsedSuggestions,
    });

    return {
      suggestions: parsedSuggestions,
    };
  }
}

module.exports = new ChatService();
