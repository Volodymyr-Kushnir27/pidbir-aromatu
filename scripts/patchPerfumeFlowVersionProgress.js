const fs = require("fs");
const path = require("path");

const filePath = path.join(process.cwd(), "src", "flows", "perfumeChatFlow.js");

if (!fs.existsSync(filePath)) {
  console.error("❌ Не знайшов src/flows/perfumeChatFlow.js");
  process.exit(1);
}

let src = fs.readFileSync(filePath, "utf8");

const replacements = [
  ["2/7 Назву і keywords перевірено", "2/7 Назву, версію і keywords перевірено"],
  ["2/7 Шукаю прямі збіги по назві / бренду", "2/7 Шукаю прямі збіги по назві / версії / бренду"],
  ["2/7 Назву / keywords перевірено", "2/7 Назву / версію / keywords перевірено"],
  ["Назву і keywords перевірено", "Назву, версію і keywords перевірено"],
  ["Назву / keywords перевірено", "Назву / версію / keywords перевірено"],
];

let changed = false;

for (const [from, to] of replacements) {
  if (src.includes(from)) {
    src = src.split(from).join(to);
    changed = true;
  }
}

fs.writeFileSync(filePath, src, "utf8");

console.log(
  changed
    ? "✅ Progress text patched: version added."
    : "ℹ️ Exact progress strings not found. No text changed.",
);
