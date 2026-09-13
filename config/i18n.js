const path = require("path");
const i18n = require("i18n");

i18n.configure({
  locales: ["fr", "en"],
  defaultLocale: "fr",
  directory: path.join(__dirname, "../locales"),
  queryParameter: "lang",
  cookie: "fabtrack_lang",
  autoReload: true,
  updateFiles: false,
  syncFiles: false,
  objectNotation: true,
});

module.exports = i18n;
