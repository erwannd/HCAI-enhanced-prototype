const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const RetrievedDocumentSchema = new Schema(
  {
    docName: { type: String, default: '' },
    chunkIndex: { type: Number, default: null },
    chunkText: { type: String, default: '' },
    relevanceScore: { type: Number, default: null },
  },
  { _id: false },
);

const ConfidenceMetricsSchema = new Schema(
  {
    overallConfidence: { type: Number, default: null },
    retrievalConfidence: { type: Number, default: null },
    responseConfidence: { type: Number, default: null },
    retrievalMethod: { type: String, default: null },
  },
  { _id: false },
);

const CanvasContextNodeSchema = new Schema(
  {
    // Only semantic canvas data should be stored here.
    // Do not store UI-only information such as x/y coordinates or pixel sizes.
    nodeID: { type: String, required: true },
    nodeType: { type: String, required: true },
    title: { type: String, default: '' },
    text: { type: String, default: '' },
  },
  { _id: false },
);

const CanvasContextEdgeSchema = new Schema(
  {
    edgeID: { type: String, required: true },
    sourceNodeID: { type: String, required: true },
    targetNodeID: { type: String, required: true },
    label: { type: String, default: '' },
  },
  { _id: false },
);

const CanvasContextSnapshotSchema = new Schema(
  {
    // Revision ties the interaction to the exact logical canvas state used for prompting.
    revision: { type: Number, default: 0 },
    nodes: { type: [CanvasContextNodeSchema], default: [] },
    edges: { type: [CanvasContextEdgeSchema], default: [] },
  },
  { _id: false },
);

const InteractionSchema = new Schema(
  {
    participantID: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    // 1 = baseline system, 2 = enhanced system.
    systemID: {
      type: Number,
      required: true,
      enum: [1, 2],
      index: true,
    },

    // Interactions should be session-scoped so multiple study topics do not mix.
    sessionID: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    userInput: {
      type: String,
      required: true,
    },

    botResponse: {
      type: String,
      required: true,
    },

    responseMode: {
      type: String,
      enum: ['quick', 'standard', 'deep_dive', 'example'],
      default: 'standard',
    },

    retrievalMethod: {
      type: String,
      default: null,
    },

    retrievedDocuments: {
      type: [RetrievedDocumentSchema],
      default: [],
    },

    confidenceMetrics: {
      type: ConfidenceMetricsSchema,
      default: null,
    },

    // Store the canvas revision even if you choose not to persist the full snapshot every time.
    canvasRevision: {
      type: Number,
      default: null,
    },

    // Optional stripped canvas snapshot used for this turn.
    // This is useful for debugging prompt construction and reproducing a response later.
    canvasContextSnapshot: {
      type: CanvasContextSnapshotSchema,
      default: null,
    },

    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

InteractionSchema.index({ participantID: 1, sessionID: 1, timestamp: -1 });

module.exports = mongoose.model('Interaction', InteractionSchema);
