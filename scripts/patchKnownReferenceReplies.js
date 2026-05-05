const fs = require("fs");
const path = require("path");

const filePath = path.join(process.cwd(), "src", "flows", "perfumeChatFlow.js");

if (!fs.existsSync(filePath)) {
  console.error("❌ Не знайшов src/flows/perfumeChatFlow.js");
  process.exit(1);
}

let src = fs.readFileSync(filePath, "utf8");

const oldText =
  '\"Зрозумів орієнтир: Oriflame Excite by Dima Bilan. Це чоловічий свіжий водно-фужерний аромат. Підберу чоловічі та унісекс варіанти з бази за нотами й характером.\"';

const newText =
  '`Привіт! ✨ Орієнтир — Oriflame Excite by Dima Bilan.\\n\\nЦе чоловічий свіжий водно-фужерний аромат із легким фруктово-зеленим стартом і чистою водною серединою. Він звучить легко, спортивно й повсякденно — без важкої солодкості.\\n\\n🌿 Ноти:\\n• старт: бергамот, диня, айва, полин\\n• серце: чай, морська вода, тархун\\n• база: мускус, кедр, мох\\n\\n👤 Для кого: чоловіків, також можна дивитися унісекс у схожому свіжому напрямі.\\n🍂 Сезон: весна, літо, тепла погода.\\n🕯 Коли носити: день, офіс, повсякденне використання.\\n🌫 Шлейф: середній. Стійкість: середня.\\n\\nЗараз підберу з бази найближчі варіанти за нотами, акордами й загальним характером.`';

if (src.includes(oldText)) {
  src = src.replace(oldText, newText);
  fs.writeFileSync(filePath, src, "utf8");
  console.log("✅ Dima Bilan known reference reply replaced with detailed intro.");
} else if (src.includes("Зрозумів орієнтир: Oriflame Excite by Dima Bilan")) {
  src = src.replace(
    /user_friendly_reply:\s*["'`][\s\S]*?Oriflame Excite by Dima Bilan[\s\S]*?["'`]\s*,/m,
    `user_friendly_reply: ${newText},`
  );
  fs.writeFileSync(filePath, src, "utf8");
  console.log("✅ Dima Bilan known reference reply replaced by regex.");
} else {
  console.log("ℹ️ Dima Bilan short reply not found. No changes made.");
}
