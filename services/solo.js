// SOLO taxonomy spelling shared by every route that returns solo_level.
//
// Postgres enum labels can't contain spaces, so the DB stores
// 'Extended_Abstract'; the UI uses 'Extended Abstract'. Every other level is
// spelled identically in both places.
const DB_TO_UI = { Extended_Abstract: 'Extended Abstract' };

function soloToUi(level) {
  if (level === null || level === undefined) return null;
  return DB_TO_UI[level] || level;
}

module.exports = { soloToUi };
