const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const CanvasNodeSchema = new Schema(
  {
    // Stable logical node identifier used by the frontend and operation log.
    nodeID: { type: String, required: true },

    // Semantic node type only. Keep this independent from frontend implementation details.
    nodeType: {
      type: String,
      required: true,
      enum: ['concept', 'note', 'example'],
    },

    title: { type: String, default: '' },
    text: { type: String, default: '' },

    // Layout fields are stored so the exact visual canvas can be restored.
    // These fields are intentionally excluded from LLM prompt construction.
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
  },
  { _id: false },
);

const CanvasEdgeSchema = new Schema(
  {
    edgeID: { type: String, required: true },
    sourceNodeID: { type: String, required: true },
    targetNodeID: { type: String, required: true },
    label: { type: String, default: '' },

    // React Flow stores which handle on a node was used for the connection.
    // Keeping these values lets the app restore which side the edge attaches to.
    sourceHandle: { type: String, default: null },
    targetHandle: { type: String, default: null },
  },
  { _id: false },
);

const CanvasStateSchema = new Schema(
  {
    sessionID: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    participantID: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    systemID: {
      type: String,
      required: true,
      enum: ['baseline', 'enhanced'],
      index: true,
    },

    // Revision increments every time the semantic canvas changes.
    revision: {
      type: Number,
      default: 0,
    },

    // Keep only semantic content here.
    // The backend persists semantic data plus layout fields needed to restore the map.
    // UI-only flags such as selected state or transient hover state should still stay frontend-only.
    nodes: {
      type: [CanvasNodeSchema],
      default: [],
    },

    edges: {
      type: [CanvasEdgeSchema],
      default: [],
    },

    updatedAtCanvas: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('CanvasState', CanvasStateSchema);
