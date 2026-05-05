const fs = require("fs");
const path = require("path");

const filePath = path.join(process.cwd(), "src", "flows", "perfumeChatFlow.js");

if (!fs.existsSync(filePath)) {
  console.error("❌ Не знайшов src/flows/perfumeChatFlow.js");
  process.exit(1);
}

let src = fs.readFileSync(filePath, "utf8");

const newText =
  '`Привіт! ✨ Орієнтир — Oriflame Excite by Dima Bilan.\\n\\nЦе чоловічий свіжий водно-фужерний аромат із легким фруктово-зеленим стартом і чистою водною серединою. Він звучить легко, спортивно й повсякденно — без важкої солодкості.\\n\\n🌿 Ноти:\\n• старт: бергамот, диня, айва, полин\\n• серце: чай, морська вода, тархун\\n• база: мускус, кедр, мох\\n\\n👤 Для кого: чоловіків, також можна дивитися унісекс у схожому свіжому напрямі.\\n🍂 Сезон: весна, літо, тепла погода.\\n🕯 Коли носити: день, офіс, повсякденне використання.\\n🌫 Шлейф: середній. Стійкість: середня.\\n\\nЗараз підберу з бази найближчі варіанти за нотами, акордами й загальним характером.`';

const regex =
  /user_friendly_reply:\s*(?:"[^"]*Oriflame Excite by Dima Bilan[^"]*"|'[^']*Oriflame Excite by Dima Bilan[^']*'|`[\s\S]*?Oriflame Excite by Dima Bilan[\s\S]*?`)\s*,/m;

if (regex.test(src)) {
  src = src.replace(regex, `user_friendly_reply: ${newText},`);
  fs.writeFileSync(filePath, src, "utf8");
  console.log("✅ Dima Bilan known reference reply replaced with detailed Ukrainian intro.");
} else {
  console.log("ℹ️ Dima Bilan short reply not found. No changes made.");
}
