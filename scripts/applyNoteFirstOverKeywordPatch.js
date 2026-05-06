const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}
function write(rel, content) {
  fs.writeFileSync(path.join(ROOT, rel), content);
  console.log('patched:', rel);
}
function backup(rel) {
  const p = path.join(ROOT, rel);
  const b = `${p}.bak_note_first_${Date.now()}`;
  fs.copyFileSync(p, b);
  console.log('backup:', b);
}

function patchPerfumeChatFlow() {
  const rel = 'src/flows/perfumeChatFlow.js';
  let s = read(rel);
  if (s.includes('NOTE_FIRST_BYPASS_DIRECT_SEARCH')) {
    console.log(rel, 'already has note-first bypass');
    return;
  }

  const marker = 'if (findKnownReference(t)) return false;';
  if (!s.includes(marker)) {
    throw new Error(`Cannot find marker in ${rel}: ${marker}`);
  }

  const insert = `${marker}\n\n  // NOTE_FIRST_BYPASS_DIRECT_SEARCH\n  // Якщо користувач явно просить ноту (наприклад: "шлейфовий парфум з вишнею",\n  // "аромат з кавуном", "жасмін", "персик"), direct-search по name/version/keywords\n  // не має перехоплювати запит словом типу "шлейфовий". Спочатку шукаємо точну ноту.\n  try {\n    const { parseLocalQuery } = require(\"../search/queryNormalizer\");\n    const localQuery = parseLocalQuery(t);\n    if (localQuery?.isExplicitNoteQuery || (Array.isArray(localQuery?.explicitNotes) && localQuery.explicitNotes.length)) {\n      return false;\n    }\n  } catch (e) {\n    // Якщо normalizer недоступний, не ламаємо flow.\n  }`;

  s = s.replace(marker, insert);
  backup(rel);
  write(rel, s);
}

function patchQueryNormalizer() {
  const rel = 'src/search/queryNormalizer.js';
  let s = read(rel);

  if (!s.includes('FLEXIBLE_NOTE_FORM_MATCH')) {
    const before = 'function getExplicitRequestedNotes(text) {';
    if (!s.includes(before)) {
      console.log(rel, 'does not contain getExplicitRequestedNotes; skip flexible matcher');
    } else {
      const helpers = `
// FLEXIBLE_NOTE_FORM_MATCH
// Дає змогу ловити відмінки: "вишнею" -> "вишня", "кавуну" -> "кавун", "жасмином" -> "жасмин".
function stemNoteToken(token) {
  let t = norm(token)
    .replace(/[ʼ’‘\`´']/g, " ")
    .replace(/[^a-zа-яіїє0-9]+/gi, " ")
    .trim();

  if (!t || t.length <= 3) return t;

  const endings = [
    "евою", "овою", "євою", "евая", "овая", "євая",
    "ами", "ями", "ого", "ому", "его", "ему", "ими", "ыми",
    "ею", "єю", "ою", "ою", "ом", "ем", "ам", "ям", "ах", "ях",
    "ий", "ій", "ый", "ая", "ое", "ые", "ие",
    "у", "ю", "а", "я", "і", "и", "е", "о"
  ];

  for (const ending of endings) {
    if (t.endsWith(ending) && t.length - ending.length >= 3) {
      return t.slice(0, -ending.length);
    }
  }

  return t;
}

function containsFlexibleNote(text, phrase) {
  if (containsPhrase(text, phrase)) return true;

  const textTokens = tokensOf(text).map(stemNoteToken).filter(Boolean);
  const phraseTokens = tokensOf(phrase).map(stemNoteToken).filter(Boolean);
  if (!phraseTokens.length) return false;

  // Однослівна нота: "вишнею" має збігатися з "вишня".
  if (phraseTokens.length === 1) {
    const p = phraseTokens[0];
    if (p.length < 3) return false;
    return textTokens.some((t) => t === p || (p.length >= 5 && (t.startsWith(p) || p.startsWith(t))));
  }

  // Фразова нота: "рожевим перцем" -> "рожевий перець".
  return phraseTokens.every((p) =>
    textTokens.some((t) => t === p || (p.length >= 5 && (t.startsWith(p) || p.startsWith(t))))
  );
}
`;
      s = s.replace(before, helpers + '\n' + before);
    }
  }

  const fnRe = /function getExplicitRequestedNotes\(text\) \{[\s\S]*?\n\}/;
  const newFn = `function getExplicitRequestedNotes(text) {
  const t = norm(text);
  const found = [];

  for (const [canonical, group] of Object.entries(EXACT_NOTE_GROUPS)) {
    const exactList = Array.isArray(group?.exact) ? group.exact : [];
    const matched = exactList.some((term) =>
      typeof containsFlexibleNote === "function" ? containsFlexibleNote(t, term) : containsPhrase(t, term)
    );
    if (matched) found.push(canonical);
  }

  return [...new Set(found)];
}`;

  if (fnRe.test(s)) {
    s = s.replace(fnRe, newFn);
  } else {
    console.log(rel, 'could not replace getExplicitRequestedNotes; skip');
  }

  // Додаємо часті форми, якщо словник локальний і містить watermelon/cherry.
  s = s.replace('"кавуна", "кавуном"', '"кавуна", "кавуну", "кавуном"');
  s = s.replace('"арбуза", "арбузом"', '"арбуза", "арбузу", "арбузом"');
  s = s.replace('"вишня", "вишні", "вишневий"', '"вишня", "вишні", "вишнею", "вишню", "вишневий"');

  backup(rel);
  write(rel, s);
}

function patchExactNoteSearch() {
  const rel = 'src/search/exactNoteSearch.js';
  let s = read(rel);

  if (!s.includes('AUX_STYLE_TERMS_FOR_NOTE_SEARCH')) {
    const marker = 'function genderAllowed(rowGender, requestedGender) {';
    const helpers = `
// AUX_STYLE_TERMS_FOR_NOTE_SEARCH
// Стильові слова використовуються тільки як бонус після точного збігу ноти.
// Вони не можуть витісняти ноту і не повинні запускати direct-search.
const AUX_STYLE_GROUPS = {
  trail: ["шлейфовий", "шлейфова", "шлейфове", "шлейфові", "шлейф", "sillage", "projection", "trail"],
  sweet: ["солодкий", "солодка", "солодке", "солодкі", "сладкий", "sweet", "gourmand"],
  fresh: ["свіжий", "свіжа", "свіже", "свіжі", "свежий", "fresh", "clean"],
  spicy: ["пряний", "пряна", "пряне", "пряні", "spicy", "warm spicy"],
  woody: ["деревний", "деревна", "деревне", "woody", "wood"],
  floral: ["квітковий", "квіткова", "квіткове", "цветочный", "floral"],
};

function getAuxStyleTerms(rawText) {
  const text = norm(rawText || "");
  const out = [];
  for (const terms of Object.values(AUX_STYLE_GROUPS)) {
    const matched = terms.some((term) => containsTerm(text, term));
    if (matched) out.push(...terms);
  }
  return [...new Set(out)];
}

`;
    if (s.includes(marker)) s = s.replace(marker, helpers + marker);
  }

  if (!s.includes('const auxStyleTerms = getAuxStyleTerms(rawText);')) {
    s = s.replace(
      'const fallbackTerms = canonicalNotes.flatMap(getFallbackNoteTerms);',
      'const fallbackTerms = canonicalNotes.flatMap(getFallbackNoteTerms);\n  const auxStyleTerms = getAuxStyleTerms(rawText);'
    );
  }

  if (!s.includes('const auxStyleCount = countTerms(haystack, auxStyleTerms);')) {
    s = s.replace(
      'const fallbackCount = countTerms(haystack, fallbackTerms);',
      'const fallbackCount = countTerms(haystack, fallbackTerms);\n      const auxStyleCount = countTerms(haystack, auxStyleTerms);'
    );
  }

  // Підсилюємо exact note і додаємо style лише як невеликий бонус.
  s = s.replace(
    /match_score:\s*1000 \+ exactCount \* 150 \+ fallbackCount \* 20 \+ unisexBonus/g,
    'match_score: 10000 + exactCount * 900 + fallbackCount * 35 + auxStyleCount * 45 + unisexBonus'
  );

  // Додаємо aux style у debug, якщо є блок exactNoteSearch.
  if (!s.includes('auxStyleTerms: auxStyleTerms.filter')) {
    s = s.replace(
      'fallbackTerms: fallbackTerms.filter((t) => containsTerm(haystack, t)),',
      'fallbackTerms: fallbackTerms.filter((t) => containsTerm(haystack, t)),\n            auxStyleTerms: auxStyleTerms.filter((t) => containsTerm(haystack, t)),'
    );
  }

  if (!s.includes('auxStyleTerms,')) {
    // debug console near bottom may not exist; skip.
  }

  backup(rel);
  write(rel, s);
}

patchPerfumeChatFlow();
patchQueryNormalizer();
patchExactNoteSearch();
console.log('Done. Now run: CATALOG_DB_PATH=/var/data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkNoteFirstCases.js');
