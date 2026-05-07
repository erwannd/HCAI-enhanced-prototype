const fs = require('fs').promises;
const path = require('path');
const express = require('express');
const multer = require('multer');

const Document = require('../models/Document');
const StudySession = require('../models/StudySession');
const { asyncHandler } = require('../middleware/asyncHandler');
const documentProcessor = require('../services/documentProcessor');
const embeddingService = require('../services/embeddingService');
const retrievalService = require('../services/retrievalService');
const { normalizeSystemID } = require('../utils/systemAssignment');

const upload = multer({
  dest: path.join(__dirname, '..', 'uploads'),
});

const router = express.Router();

router.get(
  '/:sessionID/documents',
  asyncHandler(async (req, res) => {
    const session = await StudySession.findOne({ sessionID: req.params.sessionID }).lean();

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const documents = await Document.find(
      { sessionID: session.sessionID },
      '_id sessionID participantID systemID filename processingStatus processedAt createdAt updatedAt',
    )
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      documents: documents.map((document) => ({
        ...document,
        systemID: normalizeSystemID(document.systemID),
      })),
    });
  }),
);

router.post(
  '/:sessionID/documents',
  upload.single('document'),
  asyncHandler(async (req, res) => {
    const session = await StudySession.findOne({ sessionID: req.params.sessionID });

    if (!session) {
      if (req.file?.path) {
        await fs.unlink(req.file.path).catch(() => {});
      }

      return res.status(404).json({ error: 'Session not found' });
    }

    const systemID = normalizeSystemID(session.systemID);

    if (!req.file) {
      return res.status(400).json({ error: 'document upload is required' });
    }

    try {
      const processed = await documentProcessor.processDocument(req.file);
      const chunks = await embeddingService.generateEmbeddings(processed.chunks);

      const document = await Document.create({
        sessionID: session.sessionID,
        participantID: session.participantID,
        systemID,
        filename: req.file.originalname,
        text: processed.fullText,
        chunks,
        processingStatus: 'completed',
        processedAt: new Date(),
      });

      await retrievalService.rebuildSessionIndex(session.sessionID);

      res.status(201).json({
        document: {
          _id: document._id,
          sessionID: document.sessionID,
          participantID: document.participantID,
          systemID: normalizeSystemID(document.systemID),
          filename: document.filename,
          processingStatus: document.processingStatus,
          processedAt: document.processedAt,
          chunkCount: document.chunks.length,
        },
      });
    } finally {
      await fs.unlink(req.file.path).catch(() => {});
    }
  }),
);

module.exports = router;
