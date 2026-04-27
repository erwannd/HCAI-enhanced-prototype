/**
 * Normalize extracted text before chunking or prompting.
 */
function cleanText(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text.replace(/\s+/g, ' ').trim().normalize('NFKC');
}

/**
 * Split text into overlapping chunks for retrieval.
 * Character-based chunking is a simple baseline that is easy to inspect.
 */
function chunkText(text, chunkSize = 1000, overlap = 200) {
  const cleanedText = cleanText(text);

  if (!cleanedText) {
    return [];
  }

  const chunks = [];
  let startChar = 0;
  let chunkIndex = 0;

  while (startChar < cleanedText.length) {
    const endChar = Math.min(startChar + chunkSize, cleanedText.length);

    chunks.push({
      chunkIndex,
      text: cleanedText.slice(startChar, endChar),
      startChar,
      endChar,
    });

    chunkIndex += 1;
    startChar += overlap >= chunkSize ? chunkSize : chunkSize - overlap;
  }

  return chunks;
}

module.exports = {
  cleanText,
  chunkText,
};
