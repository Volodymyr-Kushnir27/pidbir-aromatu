process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "local-test-key";
process.env.BOT_TOKEN = process.env.BOT_TOKEN || "local-test-token";

const db = require("../src/db/catalogDb");

const updates = [
  {
    codes: ["155A", "155А"],
    url: "https://strgimgr.b-cdn.net/sized/840/722783-ad669602f1d2f74e19f885e01e50d70e.jpg?height=384&quality=90&width=384",
    label: "155A Giorgio Armani Black Code",
  },
  {
    codes: ["61A", "61А"],
    url: "https://content2.rozetka.com.ua/goods/images/big/10809203.jpg",
    label: "61A Hugo Boss Hugo",
  },
  {
    codes: ["208A", "208А"],
    url: "https://edp.ua/upload/shop_images/big2/big_img-molecule-03-tualetnaya-voda-100-ml-1615458398.webp",
    label: "208A Escentric Molecules Molecule 03",
  },
];

function placeholders(n) {
  return Array.from({ length: n }, () => "?").join(",");
}

for (const item of updates) {
  const stmt = db.prepare(`UPDATE perfumes SET photo = ? WHERE UPPER(number_code) IN (${placeholders(item.codes.length)})`);
  const info = stmt.run(item.url, ...item.codes.map((x) => String(x).toUpperCase()));
  console.log(`${item.label}: updated rows = ${info.changes}`);
}

console.log("\nCurrent values:");
const rows = db.prepare(`
  SELECT id, number_code, name, photo
  FROM perfumes
  WHERE UPPER(number_code) IN ('155A','155А','61A','61А','208A','208А')
  ORDER BY id
`).all();
console.table(rows);
