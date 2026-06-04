const db = require('../src/db/catalogDb');

function normalizeCode(input) {
  return String(input || '')
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

const updates = [
  {
    code: '155A',
    nameIncludes: ['giorgio armani', 'black code'],
    photo: 'https://birmarket.az/ru/product/722783-giorgio-armani-code-parfum-parfyumernaya-voda-dlya-muzhchin-125-ml',
  },
  {
    code: '61A',
    nameIncludes: ['hugo boss', 'hugo'],
    photo: 'https://content2.rozetka.com.ua/goods/images/big/10809203.jpg',
  },
  {
    code: '208A',
    nameIncludes: ['escentric molecules', 'molecule 03'],
    photo: 'https://edp.ua/upload/shop_images/big2/big_img-molecule-03-tualetnaya-voda-100-ml-1615458398.webp',
  },
];

function norm(value) {
  return String(value || '').toLowerCase().replace(/[“”"«»]/g, ' ').replace(/\s+/g, ' ').trim();
}

const rows = db.prepare('SELECT id, number_code, name, photo FROM perfumes').all();
const updateStmt = db.prepare('UPDATE perfumes SET photo = ? WHERE id = ?');

console.log('DB photo update V23');
console.log('rows:', rows.length);

for (const u of updates) {
  const found = rows.filter((row) => {
    const codeOk = normalizeCode(row.number_code) === normalizeCode(u.code);
    const name = norm(row.name);
    const nameOk = u.nameIncludes.every((part) => name.includes(norm(part)));
    return codeOk || nameOk;
  });

  if (!found.length) {
    console.log(`NOT FOUND: ${u.code} ${u.nameIncludes.join(' / ')}`);
    continue;
  }

  for (const row of found) {
    updateStmt.run(u.photo, row.id);
    console.log(`UPDATED id=${row.id} code=${row.number_code} name=${row.name}`);
    console.log(`  old: ${row.photo || '-'}`);
    console.log(`  new: ${u.photo}`);
  }
}

console.log('\nVERIFY:');
for (const code of updates.map((x) => x.code)) {
  const row = db.prepare('SELECT id, number_code, name, photo FROM perfumes').all().find((r) => normalizeCode(r.number_code) === normalizeCode(code));
  console.log(row || `missing ${code}`);
}
