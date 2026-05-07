const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const CanvasOperationSchema = new Schema(
  {
    // Operation shape is intentionally flexible because node/edge edits can vary over time.
    // Examples: add_node, update_node, delete_node, add_edge, remove_edge.
    type: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const CanvasOperationLogSchema = new Schema(
  {
    sessionID: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

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

    // Actor tells you whether the change came from the participant or the assistant.
    actor: {
      type: String,
      required: true,
      enum: ['user', 'assistant'],
    },

    // Optional back-reference to the chat turn that triggered the operation.
    interactionID: {
      type: Schema.Types.ObjectId,
      ref: 'Interaction',
      default: null,
    },

    revision: {
      type: Number,
      required: true,
    },

    operations: {
      type: [CanvasOperationSchema],
      default: [],
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

CanvasOperationLogSchema.index({ sessionID: 1, revision: 1 });

module.exports = mongoose.model('CanvasOperationLog', CanvasOperationLogSchema);
