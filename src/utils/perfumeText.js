const { norm } = require("./text");

function seasonToUa(season) {
  const map = {
    spring: "весна",
    summer: "літо",
    autumn: "осінь",
    winter: "зима",
  };
  return map[norm(season)] || season;
}

function genderToUa(gender) {
  const map = {
    male: "чоловічий",
    female: "жіночий",
    unisex: "унісекс",
    unknown: "невідомо",
  };
  return map[norm(gender)] || gender;
}

function cleanList(arr = [], limit = 5) {
  return [...new Set((arr || []).filter(Boolean).map((x) => String(x).trim()))].slice(0, limit);
}

function buildReasonLines(item, profile) {
  const lines = [];
  const hay = [
    item.notes,
    item.accords,
    item.description,
    item.short_desc,
    item.season,
    item.gender,
    item.category,
  ]
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();

  for (const note of profile.notes_include || []) {
    if (hay.includes(norm(note))) lines.push(`є близька нота: ${note}`);
  }

  for (const accord of profile.accords || []) {
    if (hay.includes(norm(accord))) lines.push(`схожий напрям: ${accord}`);
  }

  for (const season of profile.season || []) {
    if (hay.includes(norm(season))) lines.push(`підходить на ${seasonToUa(season)}`);
  }

  if (
    profile.gender &&
    profile.gender !== "unknown" &&
    hay.includes(norm(profile.gender))
  ) {
    lines.push(`профіль: ${genderToUa(profile.gender)}`);
  }

  if (!lines.length) {
    lines.push("загалом близький за стилем і характером");
  }

  return lines.slice(0, 3);
}

module.exports = {
  seasonToUa,
  genderToUa,
  cleanList,
  buildReasonLines,
};