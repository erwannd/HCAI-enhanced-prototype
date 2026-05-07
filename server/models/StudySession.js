const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const StudySessionSchema = new Schema(
  {
    // Human-facing / application-facing session identifier.
    // A participant can have multiple sessions, so this must be unique per session.
    sessionID: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    // Denormalize participantID and systemID to make study exports easier.
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

    // Topic label shown in the UI, for example "PCA" or "Clustering".
    title: {
      type: String,
      required: true,
      trim: true,
    },

    // The latest backend-generated follow-up prompts shown under the assistant chat.
    // Keeping them on the session allows the UI to restore them after a reload.
    followUpQuestions: {
      type: [String],
      default: [],
    },

    // Soft lifecycle flag for future filtering.
    status: {
      type: String,
      default: 'active',
      enum: ['active', 'archived'],
    },
  },
  {
    timestamps: true,
  },
);

StudySessionSchema.index({ participantID: 1, createdAt: -1 });

module.exports = mongoose.model('StudySession', StudySessionSchema);
