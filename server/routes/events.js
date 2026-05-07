const express = require('express');

const EventLog = require('../models/EventLog');
const StudySession = require('../models/StudySession');
const { asyncHandler } = require('../middleware/asyncHandler');
const { normalizeSystemID } = require('../utils/systemAssignment');

const router = express.Router();

router.post(
  '/:sessionID/events',
  asyncHandler(async (req, res) => {
    const session = await StudySession.findOne({ sessionID: req.params.sessionID });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const systemID = normalizeSystemID(session.systemID);

    const eventType = String(req.body.eventType || '').trim();
    const elementName = String(req.body.elementName || '').trim();

    if (!eventType || !elementName) {
      return res.status(400).json({ error: 'eventType and elementName are required' });
    }

    const event = await EventLog.create({
      participantID: session.participantID,
      systemID,
      sessionID: session.sessionID,
      eventType,
      elementName,
      metadata: req.body.metadata || {},
      timestamp: req.body.timestamp ? new Date(req.body.timestamp) : new Date(),
    });

    res.status(201).json({ event });
  }),
);

module.exports = router;
