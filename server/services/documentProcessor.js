const fs = require('fs').promises;
const pdfParse = require('pdf-parse');

const { cleanText, chunkText } = require('../utils/textUtils');

class DocumentProcessor {
  async processDocument(file, chunkSize = 1000, chunkOverlap = 200) {
    if (!file) {
      throw new Error('No file was provided for processing');
    }

    let rawText = '';

    if (file.mimetype === 'application/pdf') {
      rawText = await this.extractPdfText(file.path);
    } else if (file.mimetype === 'text/plain') {
      rawText = await this.extractTxtText(file.path);
    } else {
      throw new Error(`Unsupported file type: ${file.mimetype}`);
    }

    const fullText = cleanText(rawText);

    if (!fullText) {
      throw new Error('No text content could be extracted from the uploaded document');
    }

    const chunks = chunkText(fullText, chunkSize, chunkOverlap);

    return {
      fullText,
      chunks,
      fileSize: file.size,
      totalChunks: chunks.length,
      chunkSize,
      chunkOverlap,
    };
  }

  async extractPdfText(filePath) {
    const dataBuffer = await fs.readFile(filePath);
    const pdfData = await pdfParse(dataBuffer);
    return pdfData.text;
  }

  async extractTxtText(filePath) {
    return fs.readFile(filePath, 'utf-8');
  }
}

module.exports = new DocumentProcessor();
