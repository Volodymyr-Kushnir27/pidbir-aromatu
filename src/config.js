
function must(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing`);
  return v;
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

module.exports = {
  BOT_TOKEN: must("BOT_TOKEN"),

  OPENAI_API_KEY,
  CHAT_MODEL: process.env.CHAT_MODEL || "gpt-4o-mini",

  DB_PATH: process.env.DB_PATH || "./data/perfumes_filtered.sqlite",
  ADMINS_PATH: process.env.ADMINS_PATH || "./data/admins.json",
  USERS_PATH: process.env.USERS_PATH || "./data/users.json",
  EMBED_MODEL: process.env.EMBED_MODEL || "text-embedding-3-small",
    

  ACTIONS: {
    ADD_USER: "ADMIN_ADD_USER",
    DEL_USER: "ADMIN_DEL_USER",
    LIST_USERS: "ADMIN_LIST_USERS",

    ADD_ADMIN: "ADMIN_ADD_ADMIN",
    DEL_ADMIN: "ADMIN_DEL_ADMIN",
    LIST_ADMINS: "ADMIN_LIST_ADMINS",

    USER_PICK: "USER_PICK",
    USER_NOTES: "USER_NOTES",
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
    LIMIT: 5,
  },
};
