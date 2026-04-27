const { OpenAI } = require('openai');

class EmbeddingService {
  constructor() {
    this.model = 'text-embedding-3-small';
    this.batchSize = 100;
    this.openai = null;
  }

  getClient() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is missing. Embeddings cannot be generated.');
    }

    if (!this.openai) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }

    return this.openai;
  }

  async generateEmbeddings(chunks) {
    if (!Array.isArray(chunks) || chunks.length === 0) {
      return [];
    }

    const client = this.getClient();
    const chunksWithEmbeddings = [];

    for (let start = 0; start < chunks.length; start += this.batchSize) {
      const batch = chunks.slice(start, start + this.batchSize);
      const response = await client.embeddings.create({
        model: this.model,
        input: batch.map((chunk) => chunk.text),
      });

      batch.forEach((chunk, index) => {
        chunksWithEmbeddings.push({
          ...chunk,
          embedding: response.data[index].embedding,
        });
      });

      if (start + this.batchSize < chunks.length) {
        await this.sleep(100);
      }
    }

    return chunksWithEmbeddings;
  }

  async generateQueryEmbedding(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('A non-empty query string is required to generate an embedding');
    }

    const client = this.getClient();
    const response = await client.embeddings.create({
      model: this.model,
      input: text,
    });

    return response.data[0].embedding;
  }

  sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}

module.exports = new EmbeddingService();
