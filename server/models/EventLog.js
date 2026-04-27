const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const EventLogSchema = new Schema(
  {
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

    sessionID: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    eventType: {
      type: String,
      required: true,
    },

    elementName: {
      type: String,
      required: true,
    },

    // Optional structured event payload for richer study analysis later.
    // Examples: selectedNodeID, selectedEdgeID, uploadFilename, chatTurnID.
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
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

EventLogSchema.index({ participantID: 1, sessionID: 1, timestamp: -1 });

module.exports = mongoose.model('EventLog', EventLogSchema);
