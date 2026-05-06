const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "src/search/directNameKeywordSearch.js");

if (!fs.existsSync(file)) {
  console.error("File not found:", file);
  process.exit(1);
}

let src = fs.readFileSync(file, "utf8");
const backup = `${file}.bak_paco_rabanne_${Date.now()}`;
fs.writeFileSync(backup, src);

const aliasesToAdd = `
    ["пако рабан", "paco rabanne"], ["пако рабана", "paco rabanne"],
    ["пако рабане", "paco rabanne"], ["пако рабанне", "paco rabanne"],
    ["пако рабани", "paco rabanne"], ["пако рабані", "paco rabanne"],
    ["пакорабан", "paco rabanne"], ["пакорабана", "paco rabanne"],
    ["пакорабане", "paco rabanne"], ["пакорабанн", "paco rabanne"],
    ["пакорабаннe", "paco rabanne"], ["пакорабанне", "paco rabanne"],
    ["пакоraban", "paco rabanne"], ["пакоrabanne", "paco rabanne"],
    ["pako raban", "paco rabanne"], ["pako rabanne", "paco rabanne"],
    ["paco raban", "paco rabanne"], ["paco rabane", "paco rabanne"],
    ["paco rabanne", "paco rabanne"], ["pacorabanne", "paco rabanne"],
    ["pacoraban", "paco rabanne"], ["rabanne", "rabanne"],
    ["рабан", "rabanne"], ["рабана", "rabanne"],
    ["рабане", "rabanne"], ["рабанне", "rabanne"],
`;

if (!src.includes('["пакорабан", "paco rabanne"]')) {
  const marker = '    ["пако карабан", "paco rabanne"],';
  if (src.includes(marker)) {
    src = src.replace(marker, `${aliasesToAdd}\n${marker}`);
  } else {
    const marker2 = '    ["tom ford", "tom ford"]';
    if (src.includes(marker2)) {
      src = src.replace(marker2, `${marker2},\n${aliasesToAdd}`);
    } else {
      console.error("Could not find alias insertion point in directNameKeywordSearch.js");
      process.exit(1);
    }
  }
}

// Strengthen compact matching: "пакорабан" should also match fields with "paco rabanne" via aliases.
if (!src.includes("function buildBrandAliasTermsForCompactFix")) {
  const insert = `
function buildBrandAliasTermsForCompactFix(query) {
  const q = norm(query);
  const c = compact(query);
  const out = [];

  if (
    q.includes("paco rabanne") ||
    q.includes("paco raban") ||
    q.includes("pako raban") ||
    q.includes("пако раб") ||
    q.includes("пакораб") ||
    c.includes("pacorab") ||
    c.includes("pakorab") ||
    c.includes("пакораб")
  ) {
    out.push("paco rabanne", "paco", "rabanne", "рабан", "пако рабан");
  }

  return unique(out);
}
`;
  const before = "function buildPrefilterTerms(query) {";
  if (src.includes(before)) {
    src = src.replace(before, `${insert}\n${before}`);
  }
}

if (src.includes("const terms = unique([cleaned, aliased, ...tokenize(cleaned), ...tokenize(aliased)]).filter((x) => x.length >= 2);")) {
  src = src.replace(
    "const terms = unique([cleaned, aliased, ...tokenize(cleaned), ...tokenize(aliased)]).filter((x) => x.length >= 2);",
    "const terms = unique([cleaned, aliased, ...tokenize(cleaned), ...tokenize(aliased), ...buildBrandAliasTermsForCompactFix(cleaned), ...buildBrandAliasTermsForCompactFix(aliased)]).filter((x) => x.length >= 2);"
  );
}

fs.writeFileSync(file, src);
console.log("backup:", backup);
console.log("patched:", path.relative(process.cwd(), file));
console.log("Run: CATALOG_DB_PATH=./data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkBrandAliasSearch.js");
