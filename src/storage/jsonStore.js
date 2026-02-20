const fs = require("fs");
const path = require("path");

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

// atomic write
function writeJsonAtomic(filePath, data) {
  ensureDir(filePath);
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

function ensureJsonFile(filePath, defaultData) {
  ensureDir(filePath);
  if (!fs.existsSync(filePath)) writeJsonAtomic(filePath, defaultData);
}

module.exports = { readJson, writeJsonAtomic, ensureJsonFile };
