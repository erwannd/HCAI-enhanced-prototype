const express = require('express');
const cors = require('cors');
const path = require('path');

const participantsRouter = require('./routes/participants');
const sessionsRouter = require('./routes/sessions');
const canvasRouter = require('./routes/canvas');
const chatRouter = require('./routes/chat');
const documentsRouter = require('./routes/documents');
const eventsRouter = require('./routes/events');

function createApp() {
  const app = express();

  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN || true,
    }),
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Keeping uploads exposed is optional, but it is convenient during development
  // if you want to inspect temporary files locally.
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'hcai-enhanced-prototype-server',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/participants', participantsRouter);
  app.use('/api/sessions', sessionsRouter);
  app.use('/api/sessions', canvasRouter);
  app.use('/api/sessions', chatRouter);
  app.use('/api/sessions', documentsRouter);
  app.use('/api/sessions', eventsRouter);

  app.use((req, res) => {
    res.status(404).json({
      error: 'Route not found',
      path: req.originalUrl,
    });
  });

  // Centralize unexpected server errors so route files can stay focused on logic.
  app.use((error, req, res, next) => {
    console.error('Unhandled server error:', error);

    if (res.headersSent) {
      return next(error);
    }

    res.status(error.statusCode || 500).json({
      error: error.message || 'Internal server error',
    });
  });

  return app;
}

module.exports = { createApp };
