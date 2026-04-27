class ConfidenceCalculator {
  calculate({ retrievedDocs, retrievalMethod, responseLogprobs = null }) {
    if (!Array.isArray(retrievedDocs) || retrievedDocs.length === 0) {
      return {
        overallConfidence: 0,
        retrievalConfidence: 0,
        responseConfidence: null,
        retrievalMethod: retrievalMethod || 'none',
      };
    }

    const retrievalConfidence = this.calculateRetrievalConfidence(retrievedDocs);
    const responseConfidence = responseLogprobs
      ? this.calculateResponseConfidence(responseLogprobs)
      : null;

    const overallConfidence = responseConfidence !== null
      ? retrievalConfidence * 0.6 + responseConfidence * 0.4
      : retrievalConfidence;

    return {
      overallConfidence: Math.min(Math.max(overallConfidence, 0), 1),
      retrievalConfidence: Math.min(Math.max(retrievalConfidence, 0), 1),
      responseConfidence,
      retrievalMethod: retrievalMethod || 'unknown',
    };
  }

  calculateRetrievalConfidence(retrievedDocs) {
    if (retrievedDocs.length === 0) {
      return 0;
    }

    const scores = retrievedDocs.map((document) => document.relevanceScore || document.score || 0);
    const topScore = scores[0] || 0;
    const gap = retrievedDocs.length > 1 ? scores[0] - scores[1] : 0;
    const averageScore = scores.reduce((sum, value) => sum + value, 0) / scores.length;

    return topScore * 0.5 + gap * 0.3 + averageScore * 0.2;
  }

  calculateResponseConfidence(logprobs) {
    if (!Array.isArray(logprobs) || logprobs.length === 0) {
      return null;
    }

    const averageLogprob = logprobs.reduce((sum, token) => sum + token.logprob, 0) / logprobs.length;
    return Math.exp(averageLogprob);
  }
}

module.exports = new ConfidenceCalculator();
