const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.CATALOG_DB_PATH || './data/perfumes.sqlite';
const ABS_DB_PATH = path.resolve(DB_PATH);

if (!fs.existsSync(ABS_DB_PATH)) {
  console.error(`DB not found: ${ABS_DB_PATH}`);
  process.exit(1);
}

const perfumes = [
  {
    photo: 'https://www.brocard.ua/media/catalog/product/cache/V13741018/eyJ3IjoxMDAwLCJoIjoxMDAwLCJvIjoiY2F0YWxvZ1wvcHJvZHVjdFwvXC8zXC82XC8zNjE0MjcyNzYxNDQ1XzEuanBnIn0=/valentino-born-in-roma-donna.jpg',
    name: '640A Valentino "Donna Born In Roma" (версія аромату)',
    number_code: '640A',
    number_codes: '640A\n640А',
    type: 'квіткові, східні, деревні',
    for_whom: 'жіночий',
    season: 'всесезонний',
    occasion: 'день, вечір, побачення, подія, щодня',
    age: 'молодіжний, середній вік',
    notes: 'Початкова нота: Бергамот, Чорна смородина\nНота серця: Жасмин\nКінцева нота: Бурбонська ваніль, Гуаякове дерево, Кашмеран',
    keywords: 'квітковий\nванільний\nфруктовий\nжасминовий\nтеплий\nжіночний\nелегантний\nсучасний\nшлейфовий\nстійкий\nлюксовий\nкомпліментарний\nвечірній\nсексуальний',
    version: 'Валентино\nВалентіно\nВалентино Парфюм\nВалентіно Парфум\n\nDonna Born In Roma\nДонна Борн Ін Рома\nДона Борн ин Рома\nДона Борн ін Рома\nВалентино Донна Борн Ин Рома\nВалентіно Донна Борн Ін Рома\n\nBorn In Roma Donna\nBorn in Roma\nValentino Donna\nValentino Donna Born In Roma\nValentino Born In Roma',
    description: 'Яскравий, жіночний і сучасний аромат із соковитою фруктовою кислинкою, білими квітами та теплою ванільно-деревною базою. Пахне дорогою жіночністю, впевненістю та легким вечірнім шлейфом.',
    quote: 'Аромат про стильну, впевнену дівчину, яка любить бути помітною, але залишатися елегантною.',
  },
  {
    photo: 'https://u.makeup.com.ua/g/gh/gh0pzpe2qqbp.jpg',
    name: '417A Jean Paul Gaultier "Le Beau" (версія аромату)',
    number_code: '417A',
    number_codes: '417A\n417А',
    type: 'деревні, фужерні',
    for_whom: 'чоловічий',
    season: 'всесезонний',
    occasion: 'день, вечір, побачення, відпустка, прогулянка, особливі випадки',
    age: 'молодіжний, середній вік',
    notes: 'Початкова нота: Бергамот\nНота серця: Кокос\nКінцева нота: Боби тонка',
    keywords: 'свіжий\nкокосовий\nсолодкий\nтропічний\nцитрусовий\nтеплий\nароматичний\nдеревний\nсексуальний\nчоловічий\nкомпліментарний\nлітній\nстильний\nспокусливий',
    version: 'Жан Поль Готьє\nЖан Поль Готье\nЖан Поль Готьє Парфум\nЖан Поль Готье Парфюм\n\nLe Beau\nЛе Бо\nЛе Бю\nЛє Бо\nЛе Бо Готьє\nЛе Бо Готье\n\nGaultier Le Beau\nJean Paul Gaultier Le Beau\nJPG Le Beau\nЖПГ Ле Бо\nЖан Поль Готьє Ле Бо\nЖан Поль Готье Ле Бо\nЖан Поль Гатьє\nЖан Поль\nЛя блю\nЛе блю жан поль',
    description: 'Свіжий, солодко-кокосовий аромат із теплою бобово-тонковою базою. Пахне тропічною свіжістю, чистою чоловічою сексуальністю та літнім настроєм із легким гурманським відтінком.',
    quote: 'Аромат про впевненого, привабливого чоловіка, який виглядає легко, але запам’ятовується надовго.',
  },
  {
    photo: 'https://edem.dp.ua/content/images/6/536x536l50nn0/48145963493833.jpg',
    name: '626A Louis Vuitton "Symphony" (версія аромату)',
    number_code: '626A',
    number_codes: '626A\n626А',
    type: 'цитрусові, фужерні',
    for_whom: 'унісекс',
    season: 'всесезонний',
    occasion: 'день, подія, відпустка, прогулянка, особливі випадки',
    age: 'молодіжний, середній вік',
    notes: 'Початкова нота: Бергамот, Імбир\nНота серця: Грейпфрут\nКінцева нота: Амбра, Мускус',
    keywords: 'цитрусовий\nяскравий\nіскристий\nімбирний\nсонячний\nчистий\nенергійний\nелегантний\nлюксовий\nстатусний\nунісекс\nшлейфовий\nдорогий\nнішевий',
    version: 'Луї Віттон\nЛуи Виттон\nЛуї Вюіттон\nЛуи Вюиттон\n\nSymphony\nСимфоні\nСимфония\nСімфоні\nСимфонія\nLouis Vuitton Symphony\nLouis Vuitton Symphoni\n\nLV Symphony\nSymphony Louis Vuitton\nЛуї Віттон Симфоні',
    description: 'Яскравий, сяючий і дуже свіжий аромат із соковитим цитрусовим стартом та пряною імбирною іскрою. Пахне дорогою свіжістю, сонячним настроєм і чистою енергією з елегантним люксовим звучанням.',
    quote: 'Аромат-враження — іскристий, статусний і дуже помітний, ніби літній коктейль у люксовому виконанні.',
  },
  {
    photo: 'https://fimgs.net/mdimg/perfume/o.39157.jpg',
    name: '32E Guerlain "La Petite Robe Noire Intense" (версія аромату)',
    number_code: '32E',
    number_codes: '32E\n32Е',
    type: 'гурманські, квіткові, фруктові',
    for_whom: 'жіночий',
    season: 'всесезонний',
    occasion: 'день, вечір, побачення, подія, щодня',
    age: 'молодіжний, середній вік',
    notes: 'Початкова нота: Бергамот, Малина, Цукрова вата, Чорна смородина, Чорниця\nНота серця: Апельсиновий цвіт, Болгарська троянда, Жасмин\nКінцева нота: Білий мускус, Ваніль, Пачулі, Сандал',
    keywords: 'ягідний\nчорничний\nмалиновий\nгурманський\nванільний\nквітковий\nтрояндовий\nжіночний\nкокетливий\nтеплий\nшлейфовий\nстійкий\nлюксовий\nкомпліментарний\nвечірній\nромантичний',
    version: 'Guerlain\nГерлен\nГерлєн\nГерлен Парфюм\nГерлен Парфум\n\nLa Petite Robe Noire Intense\nЛя Петіт Роб Нуар Інтенс\nЛя Петит Роб Нуар Интенс\nЛа Петіт Роб Нуар Інтенс\nМаленька чорна сукня Інтенс\nМаленькое черное платье Интенс\n\nGuerlain La Petite Robe Noire Intense\nLa Petite Robe Noire Intense Guerlain\nLPRN Intense\nГерлен Ля Петіт Роб Нуар Інтенс\nГерлен Маленька чорна сукня',
    description: 'Солодкий, ягідно-гурманський аромат із яскравою чорницею, малиною та ніжною цукровою ватою. У серці звучить жіночна троянда з білими квітами, а база додає тепла, ванільної м’якості та елегантного деревного шлейфу.',
    quote: 'Аромат про кокетливу, стильну та впевнену дівчину, яка любить солодкі компліменти й залишає після себе помітний шлейф.',
  },
];

const db = new Database(ABS_DB_PATH);
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `${ABS_DB_PATH}.bak_v27_${timestamp}`;
fs.copyFileSync(ABS_DB_PATH, backupPath);
console.log(`Backup created: ${backupPath}`);

const findExisting = db.prepare(`
  SELECT id, number_code, name
  FROM perfumes
  WHERE UPPER(number_code) = UPPER(?)
     OR UPPER(COALESCE(number_codes, '')) LIKE UPPER(?)
     OR name = ?
  LIMIT 1
`);

const updateStmt = db.prepare(`
  UPDATE perfumes
  SET photo = ?,
      name = ?,
      number_code = ?,
      number_codes = ?,
      type = ?,
      for_whom = ?,
      season = ?,
      occasion = ?,
      age = ?,
      notes = ?,
      keywords = ?,
      version = ?,
      description = ?,
      quote = ?
  WHERE id = ?
`);

const insertStmt = db.prepare(`
  INSERT INTO perfumes (
    photo, name, number_code, number_codes, type, for_whom,
    season, occasion, age, notes, keywords, version, description, quote
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const tx = db.transaction((items) => {
  for (const item of items) {
    const existing = findExisting.get(item.number_code, `%${item.number_code}%`, item.name);
    const values = [
      item.photo,
      item.name,
      item.number_code,
      item.number_codes,
      item.type,
      item.for_whom,
      item.season,
      item.occasion,
      item.age,
      item.notes,
      item.keywords,
      item.version,
      item.description,
      item.quote,
    ];

    if (existing) {
      updateStmt.run(...values, existing.id);
      console.log(`UPDATED: ${item.number_code} -> id=${existing.id}`);
    } else {
      const info = insertStmt.run(...values);
      console.log(`INSERTED: ${item.number_code} -> id=${info.lastInsertRowid}`);
    }
  }
});

tx(perfumes);

const rows = db.prepare(`
  SELECT id, number_code, name, for_whom, type
  FROM perfumes
  WHERE number_code IN ('640A', '417A', '626A', '32E')
  ORDER BY id
`).all();

console.log('\nInserted/updated perfumes:');
console.table(rows);
console.log(`\nDone. Total rows affected/visible: ${rows.length}`);
