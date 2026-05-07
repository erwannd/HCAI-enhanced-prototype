function parseParticipantNumber(participantID) {
  const digits = String(participantID || '').replace(/\D/g, '');

  if (!digits) {
    throw new Error('participantID must contain at least one numeric character');
  }

  return Number.parseInt(digits, 10);
}

function deriveSystemID(participantID) {
  const participantNumber = parseParticipantNumber(participantID);

  // Study condition IDs:
  // 1 = baseline system, 2 = enhanced system.
  // Even-numbered participants go to the enhanced system.
  return participantNumber % 2 === 0 ? 2 : 1;
}

function normalizeSystemID(systemID) {
  // Study condition IDs:
  // 1 = baseline system, 2 = enhanced system.
  if (systemID === 2 || systemID === '2' || systemID === 'enhanced') {
    return 2;
  }

  return 1;
}

function parseOptionalSystemID(systemID) {
  if (
    systemID === 1 ||
    systemID === 2 ||
    systemID === '1' ||
    systemID === '2' ||
    systemID === 'baseline' ||
    systemID === 'enhanced'
  ) {
    return normalizeSystemID(systemID);
  }

  return null;
}

module.exports = {
  deriveSystemID,
  normalizeSystemID,
  parseOptionalSystemID,
  parseParticipantNumber,
};
