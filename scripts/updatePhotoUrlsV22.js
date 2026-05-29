require('dotenv').config();

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath =
  process.env.CATALOG_DB_PATH ||
  process.env.DB_PATH ||
  path.join(process.cwd(), 'data/perfumes.sqlite');

if (!fs.existsSync(dbPath)) {
  console.error('❌ DB не знайдено:', dbPath);
  console.error('Вкажи шлях так: CATALOG_DB_PATH=./data/perfumes.sqlite node scripts/updatePhotoUrlsV22.js');
  process.exit(1);
}

const db = new Database(dbPath);

const updates = [
  {
    codeNum: '155',
    nameLike: '%Giorgio Armani%Black Code%',
    photo: 'https://birmarket.az/ru/product/722783-giorgio-armani-code-parfum-parfyumernaya-voda-dlya-muzhchin-125-ml',
    label: '155A Giorgio Armani Black Code',
  },
  {
    codeNum: '61',
    nameLike: '%Hugo Boss%Hugo%',
    photo: 'https://content2.rozetka.com.ua/goods/images/big/10809203.jpg',
    label: '61A Hugo Boss Hugo',
  },
  {
    codeNum: '208',
    nameLike: '%Escentric Molecules%Molecule 03%',
    photo: 'https://edp.ua/upload/shop_images/big2/big_img-molecule-03-tualetnaya-voda-100-ml-1615458398.webp',
    label: '208A Escentric Molecules Molecule 03',
  },
];

function normalizeCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/А/g, 'A')
    .replace(/В/g, 'B')
    .replace(/С/g, 'C')
    .replace(/Е/g, 'E')
    .replace(/К/g, 'K')
    .replace(/М/g, 'M')
    .replace(/Н/g, 'H')
    .replace(/О/g, 'O')
    .replace(/Р/g, 'P')
    .replace(/Т/g, 'T')
    .replace(/Х/g, 'X');
}

function codeStartsWith(row, codeNum) {
  return [row.number_code, row.number_codes]
    .filter(Boolean)
    .some((v) => normalizeCode(v).split(/[;,/|\s]+/).some((c) => c.startsWith(codeNum)));
}

const tx = db.transaction(() => {
  for (const item of updates) {
    const candidates = db.prepare(`
      SELECT id, number_code, number_codes, name, photo
      FROM perfumes
      WHERE name LIKE ?
         OR number_code LIKE ?
         OR number_codes LIKE ?
    `).all(item.nameLike, `%${item.codeNum}%`, `%${item.codeNum}%`);

    const row = candidates.find((r) => codeStartsWith(r, item.codeNum)) || candidates[0];

    if (!row) {
      console.log('⚠️ Не знайдено:', item.label);
      continue;
    }

    db.prepare('UPDATE perfumes SET photo = ? WHERE id = ?').run(item.photo, row.id);
    console.log('✅ Оновлено:', { id: row.id, code: row.number_code, name: row.name, oldPhoto: row.photo, newPhoto: item.photo });
  }
});

tx();

console.log('\nПеревірка:');
for (const item of updates) {
  const rows = db.prepare(`
    SELECT id, number_code, name, photo
    FROM perfumes
    WHERE name LIKE ?
       OR number_code LIKE ?
       OR number_codes LIKE ?
    LIMIT 10
  `).all(item.nameLike, `%${item.codeNum}%`, `%${item.codeNum}%`);

  console.log('\n' + item.label);
  console.table(rows);
}

db.close();
