const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = process.env.CATALOG_DB_PATH || "./data/perfumes.sqlite";
const ABS_DB_PATH = path.resolve(DB_PATH);

if (!fs.existsSync(ABS_DB_PATH)) {
  console.error(`❌ DB not found: ${ABS_DB_PATH}`);
  console.error("Вкажи правильний шлях, наприклад:");
  console.error("  CATALOG_DB_PATH=/var/data/perfumes.sqlite node scripts/addLast4PerfumesV28.js");
  process.exit(1);
}

const nowSafe = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `${ABS_DB_PATH}.bak_v28_add_last4_${nowSafe}`;
fs.copyFileSync(ABS_DB_PATH, backupPath);

const db = new Database(ABS_DB_PATH);
db.pragma("journal_mode = WAL");

function getColumns() {
  return db.prepare("PRAGMA table_info(perfumes)").all().map((c) => c.name);
}

function onlyExistingColumns(row, columns) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (columns.includes(key)) out[key] = value;
  }
  return out;
}

function insertRow(row, columns) {
  const filtered = onlyExistingColumns(row, columns);
  const keys = Object.keys(filtered);

  const sql = `
    INSERT INTO perfumes (${keys.map((k) => `"${k}"`).join(", ")})
    VALUES (${keys.map((k) => `@${k}`).join(", ")})
  `;
  return db.prepare(sql).run(filtered);
}

function updateRow(id, row, columns) {
  const filtered = onlyExistingColumns(row, columns);
  delete filtered.id;

  const keys = Object.keys(filtered);
  const sql = `
    UPDATE perfumes
    SET ${keys.map((k) => `"${k}" = @${k}`).join(", ")}
    WHERE id = @id
  `;
  return db.prepare(sql).run({ ...filtered, id });
}

function findExisting(row) {
  const code = row.number_code;
  const codes = String(row.number_codes || "")
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);

  const candidates = [code, ...codes];

  for (const c of candidates) {
    const found = db
      .prepare(`
        SELECT id, number_code, name
        FROM perfumes
        WHERE number_code = ?
           OR number_codes LIKE ?
           OR name LIKE ?
        LIMIT 1
      `)
      .get(c, `%${c}%`, `%${c}%`);

    if (found) return found;
  }

  return null;
}

function rebuildPerfumesFtsSafe() {
  const hasPerfumes = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='perfumes'
  `).get();

  if (!hasPerfumes) throw new Error("no perfumes table");

  db.exec(`
    DROP TRIGGER IF EXISTS perfumes_ai_fts;
    DROP TRIGGER IF EXISTS perfumes_ad_fts;
    DROP TRIGGER IF EXISTS perfumes_au_fts;
    DROP TABLE IF EXISTS perfumes_fts;

    CREATE VIRTUAL TABLE perfumes_fts USING fts5(
      name,
      number_code,
      number_codes,
      type,
      for_whom,
      notes,
      keywords,
      description,
      version,
      season,
      occasion,
      content='perfumes',
      content_rowid='id',
      tokenize='unicode61 remove_diacritics 2'
    );

    INSERT INTO perfumes_fts(
      rowid,
      name,
      number_code,
      number_codes,
      type,
      for_whom,
      notes,
      keywords,
      description,
      version,
      season,
      occasion
    )
    SELECT
      id,
      coalesce(name, ''),
      coalesce(number_code, ''),
      coalesce(number_codes, ''),
      coalesce(type, ''),
      coalesce(for_whom, ''),
      coalesce(notes, ''),
      coalesce(keywords, ''),
      coalesce(description, ''),
      coalesce(version, ''),
      coalesce(season, ''),
      coalesce(occasion, '')
    FROM perfumes;

    CREATE TRIGGER perfumes_ai_fts AFTER INSERT ON perfumes BEGIN
      INSERT INTO perfumes_fts(
        rowid, name, number_code, number_codes, type, for_whom, notes,
        keywords, description, version, season, occasion
      )
      VALUES (
        new.id, coalesce(new.name, ''), coalesce(new.number_code, ''),
        coalesce(new.number_codes, ''), coalesce(new.type, ''),
        coalesce(new.for_whom, ''), coalesce(new.notes, ''),
        coalesce(new.keywords, ''), coalesce(new.description, ''),
        coalesce(new.version, ''), coalesce(new.season, ''),
        coalesce(new.occasion, '')
      );
    END;

    CREATE TRIGGER perfumes_ad_fts AFTER DELETE ON perfumes BEGIN
      INSERT INTO perfumes_fts(perfumes_fts, rowid, name, number_code, number_codes, type, for_whom, notes, keywords, description, version, season, occasion)
      VALUES('delete', old.id, old.name, old.number_code, old.number_codes, old.type, old.for_whom, old.notes, old.keywords, old.description, old.version, old.season, old.occasion);
    END;

    CREATE TRIGGER perfumes_au_fts AFTER UPDATE ON perfumes BEGIN
      INSERT INTO perfumes_fts(perfumes_fts, rowid, name, number_code, number_codes, type, for_whom, notes, keywords, description, version, season, occasion)
      VALUES('delete', old.id, old.name, old.number_code, old.number_codes, old.type, old.for_whom, old.notes, old.keywords, old.description, old.version, old.season, old.occasion);

      INSERT INTO perfumes_fts(
        rowid, name, number_code, number_codes, type, for_whom, notes,
        keywords, description, version, season, occasion
      )
      VALUES (
        new.id, coalesce(new.name, ''), coalesce(new.number_code, ''),
        coalesce(new.number_codes, ''), coalesce(new.type, ''),
        coalesce(new.for_whom, ''), coalesce(new.notes, ''),
        coalesce(new.keywords, ''), coalesce(new.description, ''),
        coalesce(new.version, ''), coalesce(new.season, ''),
        coalesce(new.occasion, '')
      );
    END;
  `);
}

const perfumes = [
  {
    photo: "https://www.brocard.ua/media/catalog/product/cache/V13741018/eyJ3IjoxMDAwLCJoIjoxMDAwLCJvIjoiY2F0YWxvZ1wvcHJvZHVjdFwvXC8zXC82XC8zNjE0MjcyNzYxNDQ1XzEuanBnIn0=/valentino-born-in-roma-donna.jpg",
    number_code: "640A",
    number_codes: "640A\n640А\n640",
    name: '640А Valentino "Donna Born In Roma" (версія аромата)',
    year: "2019",
    type: "квіткові, східні, деревині",
    for_whom: "жіночі",
    season: "всесезонний",
    occasion: "день, вечір, побачення, подія, щодня",
    age: "молодіжний, середній вік",
    notes: "Початкова нота: Бергамот, Чорна смородина\nНота серця: Жасмин\nКінцева нота: Бурбонська ваніль, Гуаякове дерево, Кашмеран",
    description: "Яскравий, жіночний і сучасний аромат із соковитою фруктовою кислинкою, білими квітами та теплою ванільно-деревною базою. Пахне дорогою жіночністю, впевненістю та легким вечірнім шлейфом.",
    quote: "Аромат про стильну, впевнену дівчину, яка любить бути помітною, але залишатися елегантною.",
    keywords: "квітковий\nванільний\nфруктовий\nжасминовий\nтеплий\nжіночний\nелегантний\nсучасний\nшлейфовий\nстійкий\nлюксовий\nкомпліментарний\nвечірній\nсексуальний",
    version: "Валентино\nВалентіно\nВалентино Парфюм\nВалентіно Парфум\nDonna Born In Roma\nДонна Борн Ін Рома\nДона Борн ин Рома\nДона Борн ін Рома\nВалентино Донна Борн Ин Рома\nВалентіно Донна Борн Ін Рома\nBorn In Roma Donna\nBorn in Roma\nValentino Donna\nValentino Donna Born In Roma\nValentino Born In Roma"
  },
  {
    photo: "https://u.makeup.com.ua/g/gh/gh0pzpe2qqbp.jpg",
    number_code: "417A",
    number_codes: "417A\n417А\n417",
    name: '417А Jean Paul Gaultier "Le Beau" (версія аромату)',
    year: "2019",
    type: "деревині, фужерні",
    for_whom: "чоловічі",
    season: "всесезонний",
    occasion: "день, вечір, побачення, відпустка, прогулянка, особливі випадки",
    age: "молодіжний, середній вік",
    notes: "Початкова нота: Бергамот\nНота серця: Кокос\nКінцева нота: Боби тонка",
    description: "Свіжий, солодко-кокосовий аромат із теплою бобово-тонковою базою. Пахне тропічною свіжістю, чистою чоловічою сексуальністю та літнім настроєм із легким гурманським відтінком.",
    quote: "Аромат про впевненого, привабливого чоловіка, який виглядає легко, але запам’ятовується надовго.",
    keywords: "свіжий\nкокосовий\nсолодкий\nтропічний\nцитрусовий\nтеплий\nароматичний\nдеревний\nсексуальний\nчоловічий\nкомпліментарний\nлітній\nстильний\nспокусливий",
    version: "Жан Поль Готьє\nЖан Поль Готье\nЖан Поль Готьє Парфум\nЖан Поль Готье Парфюм\nLe Beau\nЛе Бо\nЛе Бю\nЛє Бо\nЛе Бо Готьє\nЛе Бо Готье\nGaultier Le Beau\nJean Paul Gaultier Le Beau\nJPG Le Beau\nЖПГ Ле Бо\nЖан Поль Готьє Ле Бо\nЖан Поль Готье Ле Бо\nЖан Поль Гатьє\nЖан Поль\nЛя блю\nЛе блю жан поль"
  },
  {
    photo: "https://edem.dp.ua/content/images/6/536x536l50nn0/48145963493833.jpg",
    number_code: "626A",
    number_codes: "626A\n626А\n626",
    name: '626А Louis Vuitton "Symphony" (версія аромату)',
    year: "2021",
    type: "цитрусові, фужерні",
    for_whom: "унісекс, ніша",
    season: "всесезонний",
    occasion: "день, подія, відпустка, прогулянка, особливі випадки",
    age: "молодіжний, середній вік",
    notes: "Початкова нота: Бергамот, Імбир\nНота серця: Грейпфрут\nКінцева нота: Амбра, Мускус",
    description: "Яскравий, сяючий і дуже свіжий аромат із соковитим цитрусовим стартом та пряною імбирною іскрою. Пахне дорогою свіжістю, сонячним настроєм і чистою енергією з елегантним люксовим звучанням.",
    quote: "Аромат-враження — іскристий, статусний і дуже помітний, ніби літній коктейль у люксовому виконанні.",
    keywords: "цитрусовий\nяскравий\nіскристий\nімбирний\nсонячний\nчистий\nенергійний\nелегантний\nлюксовий\nстатусний\nунісекс\nшлейфовий\nдорогий",
    version: "Луї Віттон\nЛуи Виттон\nЛуї Вюіттон\nЛуи Вюиттон\nSymphony\nСимфоні\nСимфония\nСімфоні\nСимфонія\nLouis Vuitton Symphony\nLouis Vuitton Symphoni\nLV Symphony\nSymphony Louis Vuitton\nЛуї Віттон Симфоні"
  },
  {
    photo: "https://fimgs.net/mdimg/perfume/o.39157.jpg",
    number_code: "32E",
    number_codes: "32E\n32Е\n32",
    name: '32Е Guerlain "La Petite Robe Noire Intense" (версія аромату)',
    year: "2016",
    type: "гурманські, квіткові, фруктові",
    for_whom: "жіночі",
    season: "всесезонний",
    occasion: "день, вечір, побачення, подія, щодня",
    age: "молодіжний, середній вік",
    notes: "Початкова нота: Бергамот, Малина, Цукрова вата, Чорна смородина, Чорниця\nНота серця: Апельсиновий цвіт, Болгарська троянда, Жасмин\nКінцева нота: Білий мускус, Ваніль, Пачулі, Сандал",
    description: "Солодкий, ягідно-гурманський аромат із яскравою чорницею, малиною та ніжною цукровою ватою. У серці звучить жіночна троянда з білими квітами, а база додає тепла, ванільної м’якості та елегантного деревного шлейфу.",
    quote: "Аромат про кокетливу, стильну та впевнену дівчину, яка любить солодкі компліменти й залишає після себе помітний шлейф.",
    keywords: "ягідний\nчорничний\nмалиновий\nгурманський\nванільний\nквітковий\nтрояндовий\nжіночний\nкокетливий\nтеплий\nшлейфовий\nстійкий\nлюксовий\nкомпліментарний\nвечірній\nромантичний",
    version: "Guerlain\nГерлен\nГерлєн\nГерлен Парфюм\nГерлен Парфум\nLa Petite Robe Noire Intense\nЛя Петіт Роб Нуар Інтенс\nЛя Петит Роб Нуар Интенс\nЛа Петіт Роб Нуар Інтенс\nМаленька чорна сукня Інтенс\nМаленькое черное платье Интенс\nGuerlain La Petite Robe Noire Intense\nLa Petite Robe Noire Intense Guerlain\nLPRN Intense\nГерлен Ля Петіт Роб Нуар Інтенс\nГерлен Маленька чорна сукня"
  }
];

const columns = getColumns();

if (!columns.includes("perfumes")) {
  // no-op, just avoiding lint ideas
}

console.log(`📦 DB PATH: ${ABS_DB_PATH}`);
console.log(`🧯 Backup: ${backupPath}`);
console.log(`📋 Columns: ${columns.join(", ")}`);

const tx = db.transaction(() => {
  for (const perfume of perfumes) {
    const existing = findExisting(perfume);
    if (existing) {
      updateRow(existing.id, perfume, columns);
      console.log(`🔁 updated: ${perfume.number_code} -> id ${existing.id}`);
    } else {
      const res = insertRow(perfume, columns);
      console.log(`➕ inserted: ${perfume.number_code} -> id ${res.lastInsertRowid}`);
    }
  }

  rebuildPerfumesFtsSafe();
});

try {
  tx();
} catch (e) {
  console.error("❌ Failed:", e);
  console.error(`Backup збережено тут: ${backupPath}`);
  process.exit(1);
}

const checkRows = db.prepare(`
  SELECT id, number_code, number_codes, name, for_whom, photo
  FROM perfumes
  WHERE number_code IN ('640A', '417A', '626A', '32E')
     OR number_codes LIKE '%640%'
     OR number_codes LIKE '%417%'
     OR number_codes LIKE '%626%'
     OR number_codes LIKE '%32%'
  ORDER BY id
`).all();

console.log("\n✅ Check rows:");
console.table(checkRows);

const ftsCount = db.prepare("SELECT COUNT(*) AS count FROM perfumes_fts").get();
const perfumeCount = db.prepare("SELECT COUNT(*) AS count FROM perfumes").get();
console.log(`perfumes rows: ${perfumeCount.count}`);
console.log(`fts rows: ${ftsCount.count}`);

console.log("\n✅ Done. Тепер перезапусти бота / Render service.");
