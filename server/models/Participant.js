const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const ParticipantSchema = new Schema(
  {
    // Study-assigned participant identifier. This should match the ID used in Qualtrics.
    participantID: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    // Experimental condition for the participant.
    // Store this explicitly even if it is derivable from participantID parity.
    systemID: {
      type: String,
      required: true,
      enum: ['baseline', 'enhanced'],
      index: true,
    },

    // Optional note of how the assignment was derived.
    // This helps if the assignment rule changes later.
    assignmentRule: {
      type: String,
      default: 'participantID-parity-v1',
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('Participant', ParticipantSchema);
