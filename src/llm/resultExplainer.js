function uniq(arr = []) {
  return [...new Set((arr || []).filter(Boolean).map((x) => String(x).trim()))];
}

function toUaGender(gender) {
  const g = String(gender || "").toLowerCase();

  if (
    g.includes("male") ||
    g.includes("man") ||
    g.includes("men") ||
    g.includes("чолов") ||
    g.includes("муж")
  ) {
    return "чоловічий";
  }

  if (
    g.includes("female") ||
    g.includes("woman") ||
    g.includes("women") ||
    g.includes("жіноч") ||
    g.includes("жен")
  ) {
    return "жіночий";
  }

  if (g.includes("unisex") || g.includes("унісекс") || g.includes("унисекс")) {
    return "унісекс";
  }

  return "";
}

function seasonToUa(season) {
  const s = String(season || "").toLowerCase();

  if (s === "spring" || s.includes("вес")) return "весну";
  if (s === "summer" || s.includes("літ") || s.includes("лет")) return "літо";
  if (s === "autumn" || s === "fall" || s.includes("осін") || s.includes("осен")) return "осінь";
  if (s === "winter" || s.includes("зим")) return "зиму";

  return season;
}

function buildHumanReasons(item, profile) {
  const reasons = [];

  const matchedNotes = uniq(item?._debug?.matched_notes || []).slice(0, 3);
  const matchedAccords = uniq(item?._debug?.matched_accords || []).slice(0, 3);
  const matchedGender = uniq(item?._debug?.matched_gender || []).slice(0, 2);
  const matchedSeasons = uniq(item?._debug?.matched_seasons || []).slice(0, 2);

  if (matchedNotes.length) {
    reasons.push(`є схожі ноти: ${matchedNotes.join(", ")}`);
  }

  if (matchedAccords.length) {
    reasons.push(`збігається напрям: ${matchedAccords.join(", ")}`);
  }

  if (
    profile?.gender &&
    profile.gender !== "unknown" &&
    (matchedGender.length || toUaGender(item.gender) === toUaGender(profile.gender))
  ) {
    reasons.push(`підходить під запит за статтю: ${toUaGender(profile.gender)}`);
  }

  if (profile?.season?.length && matchedSeasons.length) {
    reasons.push(`підходить на сезон: ${matchedSeasons.map(seasonToUa).join(", ")}`);
  }

  if (!reasons.length && item.notes) {
    const shortNotes = String(item.notes)
      .split(/[;,]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 3);

    if (shortNotes.length) {
      reasons.push(`у профілі є цікаві ноти: ${shortNotes.join(", ")}`);
    }
  }

  if (!reasons.length) {
    reasons.push("загалом близький за звучанням і характером");
  }

  return reasons.slice(0, 3);
}

function attachReasons(items, searchProfile) {
  return (items || []).map((item) => {
    if (Array.isArray(item.why_selected) && item.why_selected.length) {
      return item;
    }

    return {
      ...item,
      why_selected: buildHumanReasons(item, searchProfile),
    };
  });
}

module.exports = { attachReasons };