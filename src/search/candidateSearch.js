const { getAllPerfumes } = require("./catalogRepo");
const { scoreCandidate } = require("../utils/scoring");

function findCandidates(searchProfile, limit = 50) {
  const rows = getAllPerfumes();

  const scored = rows
    .map((row) => ({
      ...row,
      match_score: scoreCandidate(row, searchProfile),
    }))
    .filter((row) => row.match_score > 0)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, limit);

  return scored;
}

module.exports = { findCandidates };