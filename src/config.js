function must(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing`);
  return v;
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

const DATA_DIR = process.env.DATA_DIR || "/var/data";

const SUPER_ADMIN_TG_ID = Number(process.env.SUPER_ADMIN_TG_ID || 0);

module.exports = {
  SUPER_ADMIN_TG_ID
};

module.exports = {
  BOT_TOKEN: must("BOT_TOKEN"),
  OPENAI_API_KEY,

  CHAT_MODEL: process.env.CHAT_MODEL || "gpt-4o-mini",

  DB_PATH:
    process.env.CATALOG_DB_PATH ||
    process.env.DB_PATH ||
    `${DATA_DIR}/perfumes.sqlite`,

  ADMINS_PATH:
    process.env.ADMINS_PATH ||
    `${DATA_DIR}/admins.json`,

  USERS_PATH:
    process.env.USERS_PATH ||
    `${DATA_DIR}/users.json`,

  ACTIONS: {
    ADD_USER: "ADMIN_ADD_USER",
    DEL_USER: "ADMIN_DEL_USER",
    LIST_USERS: "ADMIN_LIST_USERS",

    ADD_ADMIN: "ADMIN_ADD_ADMIN",
    DEL_ADMIN: "ADMIN_DEL_ADMIN",
    LIST_ADMINS: "ADMIN_LIST_ADMINS",

    USER_PICK: "USER_PICK",
    BACK_HOME: "BACK_HOME",
    EXIT_PICK: "EXIT_PICK",
  },

  STATES: {
    ADD_USER_WAIT: "ADD_USER_WAIT",
    DEL_USER_WAIT: "DEL_USER_WAIT",
    ADD_ADMIN_WAIT: "ADD_ADMIN_WAIT",
    DEL_ADMIN_WAIT: "DEL_ADMIN_WAIT",
  },

  SEARCH: {
    LIMIT_CANDIDATES: 120,
    TOP_K: 3,
    MAX_ROWS_SCAN: 600,
  },
  
};