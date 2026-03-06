const { buildReasonLines } = require("../utils/perfumeText");

function attachReasons(items, searchProfile) {
  return (items || []).map((item) => ({
    ...item,
    why_selected: buildReasonLines(item, searchProfile),
  }));
}

module.exports = { attachReasons };