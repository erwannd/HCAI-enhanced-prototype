const natural = require('natural');

const Document = require('../models/Document');
const embeddingService = require('./embeddingService');
const { cosineSimilarity } = require('../utils/vectorUtils');

class RetrievalService {
  constructor() {
    this.tfidfBySession = new Map();
  }

  async rebuildSessionIndex(sessionID) {
    const documents = await Document.find({
      sessionID,
      processingStatus: 'completed',
    });

    const tfidf = new natural.TfIdf();
    const chunkMap = [];

    documents.forEach((document) => {
      (document.chunks || []).forEach((chunk) => {
        tfidf.addDocument(chunk.text);
        chunkMap.push({
          documentId: document._id,
          documentName: document.filename,
          chunkIndex: chunk.chunkIndex,
          chunkText: chunk.text,
        });
      });
    });

    this.tfidfBySession.set(sessionID, {
      tfidf,
      chunkMap,
      isIndexed: chunkMap.length > 0,
    });
  }

  async retrieve(sessionID, query, options = {}) {
    const {
      method = 'semantic',
      topK = 3,
      minScore = method === 'tfidf' ? 0 : 0.3,
    } = options;

    if (!sessionID) {
      throw new Error('sessionID is required for retrieval');
    }

    if (!query || typeof query !== 'string') {
      return [];
    }

    if (method === 'tfidf') {
      return this.retrieveWithTfidf(sessionID, query, topK, minScore);
    }

    if (method === 'semantic') {
      return this.retrieveWithSemanticSimilarity(sessionID, query, topK, minScore);
    }

    throw new Error(`Unknown retrieval method: ${method}`);
  }

  async retrieveWithTfidf(sessionID, query, topK, minScore) {
    const existingIndex = this.tfidfBySession.get(sessionID);

    if (!existingIndex) {
      await this.rebuildSessionIndex(sessionID);
    }

    const index = this.tfidfBySession.get(sessionID);

    if (!index || !index.isIndexed) {
      return [];
    }

    const scores = [];

    index.tfidf.tfidfs(query, (chunkIndex, score) => {
      if (score >= minScore) {
        scores.push({ chunkIndex, score });
      }
    });

    return scores
      .sort((left, right) => right.score - left.score)
      .slice(0, topK)
      .map((entry) => ({
        ...index.chunkMap[entry.chunkIndex],
        score: entry.score,
        relevanceScore: entry.score,
      }));
  }

  async retrieveWithSemanticSimilarity(sessionID, query, topK, minScore) {
    const documents = await Document.find({
      sessionID,
      processingStatus: 'completed',
      'chunks.embedding': { $exists: true, $ne: [] },
    });

    if (documents.length === 0) {
      return [];
    }

    const queryEmbedding = await embeddingService.generateQueryEmbedding(query);
    const matches = [];

    documents.forEach((document) => {
      (document.chunks || []).forEach((chunk) => {
        if (!Array.isArray(chunk.embedding) || chunk.embedding.length === 0) {
          return;
        }

        const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);

        if (similarity >= minScore) {
          matches.push({
            documentId: document._id,
            documentName: document.filename,
            chunkIndex: chunk.chunkIndex,
            chunkText: chunk.text,
            score: similarity,
            relevanceScore: similarity,
          });
        }
      });
    });

    return matches
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
  }
}

module.exports = new RetrievalService();
