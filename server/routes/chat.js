const express = require('express');

const StudySession = require('../models/StudySession');
const { asyncHandler } = require('../middleware/asyncHandler');
const chatService = require('../services/chatService');

const router = express.Router();

router.post(
  '/:sessionID/chat',
  asyncHandler(async (req, res) => {
    const session = await StudySession.findOne({ sessionID: req.params.sessionID });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const userInput = String(req.body.input || '').trim();

    if (!userInput) {
      return res.status(400).json({ error: 'input is required' });
    }

    const result = await chatService.createChatTurn(session, userInput, {
      retrievalMethod: req.body.retrievalMethod || 'semantic',
    });

    res.json(result);
  }),
);

router.post(
  '/:sessionID/canvas-suggestions',
  asyncHandler(async (req, res) => {
    const session = await StudySession.findOne({ sessionID: req.params.sessionID });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const userInput = String(req.body.userInput || '').trim();
    const assistantResponse = String(req.body.assistantResponse || '').trim();

    if (!userInput) {
      return res.status(400).json({ error: 'userInput is required' });
    }

    if (!assistantResponse) {
      return res.status(400).json({ error: 'assistantResponse is required' });
    }

    const result = await chatService.createCanvasSuggestions(session, {
      userInput,
      assistantResponse,
    });

    res.json(result);
  }),
);

module.exports = router;
