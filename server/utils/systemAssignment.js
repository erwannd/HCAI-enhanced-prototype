function parseParticipantNumber(participantID) {
  const digits = String(participantID || '').replace(/\D/g, '');

  if (!digits) {
    throw new Error('participantID must contain at least one numeric character');
  }

  return Number.parseInt(digits, 10);
}

function deriveSystemID(participantID) {
  const participantNumber = parseParticipantNumber(participantID);

  // Even-numbered participants go to the enhanced system.
  return participantNumber % 2 === 0 ? 'enhanced' : 'baseline';
}

module.exports = {
  deriveSystemID,
  parseParticipantNumber,
};
