const path = require("path");
const fs = require("fs");
const i18n = require("i18n");

const LOCALES_DIR = path.join(__dirname, "../locales");

function getAvailableLocales() {
  if (!fs.existsSync(LOCALES_DIR)) return ["fr", "en"];
  const files = fs.readdirSync(LOCALES_DIR);
  const found = files
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.basename(f, ".json").toLowerCase());

  // Ensure 'fr' and 'en' are prioritized, others sorted alphabetically
  const custom = found.filter((l) => l !== "fr" && l !== "en").sort();
  const result = [];
  if (found.includes("fr") || true) result.push("fr");
  if (found.includes("en") || true) result.push("en");
  for (const c of custom) {
    if (!result.includes(c)) result.push(c);
  }
  return result;
}

function configureI18n() {
  const locales = getAvailableLocales();
  i18n.configure({
    locales,
    defaultLocale: "fr",
    directory: LOCALES_DIR,
    queryParameter: "lang",
    cookie: "fabtrack_lang",
    autoReload: true,
    updateFiles: false,
    syncFiles: false,
    objectNotation: true,
  });
  return locales;
}

configureI18n();

i18n.refreshLocales = configureI18n;
i18n.getAvailableLocales = getAvailableLocales;

module.exports = i18n;
