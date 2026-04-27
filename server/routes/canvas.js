const express = require('express');

const CanvasOperationLog = require('../models/CanvasOperationLog');
const CanvasState = require('../models/CanvasState');
const StudySession = require('../models/StudySession');
const { asyncHandler } = require('../middleware/asyncHandler');
const { serializeCanvasState } = require('../utils/canvasSerializer');

const router = express.Router();

router.get(
  '/:sessionID/canvas',
  asyncHandler(async (req, res) => {
    const session = await StudySession.findOne({ sessionID: req.params.sessionID }).lean();

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    let canvasState = await CanvasState.findOne({ sessionID: session.sessionID }).lean();

    if (!canvasState) {
      canvasState = await CanvasState.create({
        sessionID: session.sessionID,
        participantID: session.participantID,
        systemID: session.systemID,
        revision: 0,
        nodes: [],
        edges: [],
      });
    }

    res.json({ canvas: canvasState });
  }),
);

router.put(
  '/:sessionID/canvas',
  asyncHandler(async (req, res) => {
    const session = await StudySession.findOne({ sessionID: req.params.sessionID });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const actor = ['user', 'assistant'].includes(req.body.actor) ? req.body.actor : 'user';
    const interactionID = req.body.interactionID || null;
    const operations = Array.isArray(req.body.operations) ? req.body.operations : [];
    const semanticCanvas = serializeCanvasState(req.body);

    let canvasState = await CanvasState.findOne({ sessionID: session.sessionID });

    if (!canvasState) {
      canvasState = new CanvasState({
        sessionID: session.sessionID,
        participantID: session.participantID,
        systemID: session.systemID,
        revision: 0,
        nodes: [],
        edges: [],
      });
    }

    canvasState.revision += 1;
    canvasState.nodes = semanticCanvas.nodes;
    canvasState.edges = semanticCanvas.edges;
    canvasState.updatedAtCanvas = new Date();
    await canvasState.save();

    if (operations.length > 0) {
      await CanvasOperationLog.create({
        sessionID: session.sessionID,
        participantID: session.participantID,
        systemID: session.systemID,
        actor,
        interactionID,
        revision: canvasState.revision,
        operations,
      });
    }

    res.json({
      canvas: canvasState,
    });
  }),
);

module.exports = router;
