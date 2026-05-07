const express = require('express');

const Participant = require('../models/Participant');
const StudySession = require('../models/StudySession');
const { asyncHandler } = require('../middleware/asyncHandler');
const { deriveSystemID, normalizeSystemID } = require('../utils/systemAssignment');

const router = express.Router();

router.post(
  '/bootstrap',
  asyncHandler(async (req, res) => {
    const participantID = String(req.body.participantID || '').trim();

    if (!participantID) {
      return res.status(400).json({ error: 'participantID is required' });
    }

    const systemID = deriveSystemID(participantID);

    const participant = await Participant.findOneAndUpdate(
      { participantID },
      {
        participantID,
        systemID,
        assignmentRule: 'participantID-parity-v1',
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );

    const sessions = await StudySession.find({ participantID })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      participant: {
        ...participant.toObject(),
        systemID: normalizeSystemID(participant.systemID),
      },
      sessions: sessions.map((session) => ({
        ...session,
        systemID: normalizeSystemID(session.systemID),
      })),
    });
  }),
);

router.get(
  '/:participantID/sessions',
  asyncHandler(async (req, res) => {
    const participantID = String(req.params.participantID || '').trim();

    const sessions = await StudySession.find({ participantID })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      sessions: sessions.map((session) => ({
        ...session,
        systemID: normalizeSystemID(session.systemID),
      })),
    });
  }),
);

module.exports = router;
