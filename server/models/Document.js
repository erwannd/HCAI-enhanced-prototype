const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const ChunkSchema = new Schema(
  {
    // Position of the chunk inside the source document.
    chunkIndex: { type: Number, required: true },

    // Raw chunk text used for retrieval.
    text: { type: String, required: true },

    // Embedding used for semantic retrieval.
    embedding: { type: [Number], default: [] },
  },
  { _id: false },
);

const DocumentSchema = new Schema(
  {
    // Session scoping matters in the enhanced system so unrelated topics do not mix during RAG.
    sessionID: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

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

    filename: {
      type: String,
      required: true,
      trim: true,
    },

    // Full extracted text for debugging and offline inspection.
    text: {
      type: String,
      default: '',
    },

    // Retrieval corpus for this document.
    chunks: {
      type: [ChunkSchema],
      default: [],
    },

    processingStatus: {
      type: String,
      default: 'pending',
      enum: ['pending', 'processing', 'completed', 'failed'],
    },

    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

DocumentSchema.index({ sessionID: 1, processingStatus: 1 });
DocumentSchema.index({ participantID: 1, createdAt: -1 });

module.exports = mongoose.model('Document', DocumentSchema);
