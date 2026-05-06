const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "src", "flows", "perfumeChatFlow.js");
if (!fs.existsSync(file)) {
  console.error("❌ File not found:", file);
  process.exit(1);
}

let src = fs.readFileSync(file, "utf8");
const backup = `${file}.backup-direct-continue-${Date.now()}`;
fs.writeFileSync(backup, src);
console.log("Backup:", backup);

if (!src.includes("../search/queryNormalizer")) {
  const marker = `const { sendPerfumeCard } = require("./sendPerfumeCard");`;
  if (!src.includes(marker)) {
    console.error("❌ Cannot find import marker. Patch manually.");
    process.exit(1);
  }
  src = src.replace(
    marker,
    `const { isExplicitNoteQuery } = require("../search/queryNormalizer");\n${marker}`,
  );
}

const helper = `
function shouldStopOnDirectMatchForName(userText, directItems = []) {
  if (!directItems?.length) return false;

  // If user asks for a concrete note, direct name/keyword hit must NOT stop the flow.
  // Example: "підбери аромат кавуну" may find Zara Cherry Watermelon by name,
  // but the bot must continue and collect all exact watermelon-note perfumes.
  try {
    if (isExplicitNoteQuery(userText)) return false;
  } catch {}

  const first = directItems[0] || {};
  const field = String(first.direct_match_field || "").toLowerCase();
  const type = String(first.direct_match_type || "").toLowerCase();
  const score = Number(first.match_score || 0);

  // Stop only when it is a strong name match.
  // For version/keywords/notes/description hits continue to AI/profile search,
  // because they are useful signals, not enough to say "this is all".
  const isNameField = field.includes("назва") || field === "name";
  const isStrongNameType = ["exact_full", "exact_phrase", "exact_token", "token_overlap"].includes(type);

  return isNameField && isStrongNameType && score >= 8500;
}
`;

if (!src.includes("function shouldStopOnDirectMatchForName(")) {
  const insertBefore = "/* =========================\n   Search helpers";
  if (src.includes(insertBefore)) {
    src = src.replace(insertBefore, `${helper}\n${insertBefore}`);
  } else {
    const exportMarker = "module.exports";
    src = src.replace(exportMarker, `${helper}\n${exportMarker}`);
  }
}

const before = src;
src = src.replace(
  /if\s*\(\s*hasStrongDirectMatch\(([^)]+)\)\s*\)/g,
  `if (hasStrongDirectMatch($1) && shouldStopOnDirectMatchForName((typeof userText !== "undefined" ? userText : (typeof text !== "undefined" ? text : "")), $1))`,
);

if (src === before) {
  console.warn("⚠️ No hasStrongDirectMatch(...) condition was replaced. Check perfumeChatFlow.js manually.");
} else {
  console.log("✅ Patched hasStrongDirectMatch branches to continue after weak direct hits.");
}

fs.writeFileSync(file, src);
console.log("✅ Done:", file);
