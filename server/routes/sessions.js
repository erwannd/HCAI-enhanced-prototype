const crypto = require('crypto');
const express = require('express');

const CanvasState = require('../models/CanvasState');
const Document = require('../models/Document');
const Interaction = require('../models/Interaction');
const Participant = require('../models/Participant');
const StudySession = require('../models/StudySession');
const { asyncHandler } = require('../middleware/asyncHandler');
const {
  deriveSystemID,
  normalizeSystemID,
  parseOptionalSystemID,
} = require('../utils/systemAssignment');

const router = express.Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const participantID = String(req.body.participantID || '').trim();
    const title = String(req.body.title || '').trim();

    if (!participantID) {
      return res.status(400).json({ error: 'participantID is required' });
    }

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const systemID = parseOptionalSystemID(req.body.systemID) ?? deriveSystemID(participantID);

    await Participant.findOneAndUpdate(
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

    const session = await StudySession.create({
      sessionID: crypto.randomUUID(),
      participantID,
      systemID,
      title,
      followUpQuestions: [],
    });

    // Create an empty canvas document immediately so the frontend has a stable target.
    await CanvasState.create({
      sessionID: session.sessionID,
      participantID,
      systemID,
      revision: 0,
      nodes: [],
      edges: [],
    });

    res.status(201).json({
      session: {
        ...session.toObject(),
        systemID: normalizeSystemID(session.systemID),
      },
    });
  }),
);

router.get(
  '/:sessionID',
  asyncHandler(async (req, res) => {
    const session = await StudySession.findOne({ sessionID: req.params.sessionID }).lean();

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const [documentCount, interactionCount] = await Promise.all([
      Document.countDocuments({ sessionID: session.sessionID }),
      Interaction.countDocuments({ sessionID: session.sessionID }),
    ]);

    res.json({
      session: {
        ...session,
        systemID: normalizeSystemID(session.systemID),
      },
      summary: {
        documentCount,
        interactionCount,
      },
    });
  }),
);

router.patch(
  '/:sessionID',
  asyncHandler(async (req, res) => {
    const title = String(req.body.title || '').trim();

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const session = await StudySession.findOneAndUpdate(
      { sessionID: req.params.sessionID },
      {
        title,
      },
      {
        new: true,
        runValidators: true,
      },
    ).lean();

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      session: {
        ...session,
        systemID: normalizeSystemID(session.systemID),
      },
    });
  }),
);

router.get(
  '/:sessionID/interactions',
  asyncHandler(async (req, res) => {
    const session = await StudySession.findOne({ sessionID: req.params.sessionID }).lean();

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 20;

    const interactions = await Interaction.find({ sessionID: session.sessionID })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    res.json({
      interactions: interactions.reverse(),
    });
  }),
);

module.exports = router;
