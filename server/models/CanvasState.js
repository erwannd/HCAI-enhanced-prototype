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
      enum: ['concept', 'note', 'example', 'question'],
    },

    title: { type: String, default: '' },
    text: { type: String, default: '' },
  },
  { _id: false },
);

const CanvasEdgeSchema = new Schema(
  {
    edgeID: { type: String, required: true },
    sourceNodeID: { type: String, required: true },
    targetNodeID: { type: String, required: true },
    label: { type: String, default: '' },
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
    // Coordinates, selected state, handle IDs, and styling belong in the frontend layer.
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
