const fs = require("fs");
const path = require("path");
const i18n = require("../config/i18n");
const { escapeCsvCell } = require("../utilities/securityHelpers");
const { parseCsvText } = require("./csvParserService");

const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const LOCALES_DIR = path.join(__dirname, "../locales");
const DEFAULT_CSV_PATH = path.join(__dirname, "../translations.csv");

const KNOWN_LANGUAGES = {
  fr: { code: "fr", name: "Français", flag: "🇫🇷" },
  en: { code: "en", name: "English", flag: "🇬🇧" },
  es: { code: "es", name: "Español", flag: "🇪🇸" },
  de: { code: "de", name: "Deutsch", flag: "🇩🇪" },
  it: { code: "it", name: "Italiano", flag: "🇮🇹" },
  pt: { code: "pt", name: "Português", flag: "🇵🇹" },
  nl: { code: "nl", name: "Nederlands", flag: "🇳🇱" },
  ca: { code: "ca", name: "Català", flag: "🇦🇩" },
  eu: { code: "eu", name: "Euskara", flag: "🇪🇸" },
  pl: { code: "pl", name: "Polski", flag: "🇵🇱" },
  ro: { code: "ro", name: "Română", flag: "🇷🇴" },
  sv: { code: "sv", name: "Svenska", flag: "🇸🇪" },
  da: { code: "da", name: "Dansk", flag: "🇩🇰" },
  fi: { code: "fi", name: "Suomi", flag: "🇫🇮" },
  no: { code: "no", name: "Norsk", flag: "🇳🇴" },
  el: { code: "el", name: "Ελληνικά", flag: "🇬🇷" },
  tr: { code: "tr", name: "Türkçe", flag: "🇹🇷" },
  ru: { code: "ru", name: "Русский", flag: "🇷🇺" },
  uk: { code: "uk", name: "Українська", flag: "🇺🇦" },
  ar: { code: "ar", name: "العربية", flag: "🇸🇦" },
  zh: { code: "zh", name: "中文", flag: "🇨🇳" },
  ja: { code: "ja", name: "日本語", flag: "🇯🇵" },
  ko: { code: "ko", name: "한국어", flag: "🇰🇷" },
};

const COLUMN_ALIASES = {
  FR: "fr",
  FRANCAIS: "fr",
  FRANÇAIS: "fr",
  FRENCH: "fr",
  EN: "en",
  ANGLAIS: "en",
  ENGLISH: "en",
  ES: "es",
  ESPAGNOL: "es",
  SPANISH: "es",
  DE: "de",
  ALLEMAND: "de",
  GERMAN: "de",
  IT: "it",
  ITALIEN: "it",
  ITALIAN: "it",
  PT: "pt",
  PORTUGAIS: "pt",
  PORTUGUESE: "pt",
  NL: "nl",
  NEERLANDAIS: "nl",
  DUTCH: "nl",
  RU: "ru",
  RUSSE: "ru",
  RUSSIAN: "ru",
  ZH: "zh",
  CHINOIS: "zh",
  CHINESE: "zh",
  JA: "ja",
  JAPONAIS: "ja",
  JAPANESE: "ja",
  AR: "ar",
  ARABE: "ar",
  ARABIC: "ar",
};

// Helper: Flatten a nested object into dot-notated keys
function flattenObject(obj, prefix = "") {
  let result = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, fullPath));
    } else {
      result[fullPath] = value !== null && value !== undefined ? String(value) : "";
    }
  }
  return result;
}

// Helper: Unflatten dot-notated keys into a nested null-prototype object
// Strictly blocks __proto__, constructor, and prototype segments (Prototype Pollution defense)
function unflattenObject(data) {
  const result = Object.create(null);
  if (!data || typeof data !== "object") return result;

  for (const [key, value] of Object.entries(data)) {
    const parts = String(key).split(".");
    if (parts.some((part) => !part || FORBIDDEN_OBJECT_KEYS.has(part))) {
      continue;
    }

    let current = result;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current[part] = value;
      } else {
        const existing = Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined;
        if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
          current[part] = Object.create(null);
        }
        current = current[part];
      }
    }
  }
  return result;
}

// Helper: Escape a value for CSV (RFC 4180 + CSV formula injection defense)
function escapeCsvValue(val) {
  return escapeCsvCell(val, { alwaysQuote: false, delimiter: "," });
}

function normalizeLanguageCode(colName) {
  if (!colName) return null;
  const upper = colName.trim().toUpperCase();
  if (COLUMN_ALIASES[upper]) {
    return COLUMN_ALIASES[upper];
  }
  // Check standard 2-5 letter language code (e.g., 'es', 'de', 'pt-br')
  if (/^[A-Z]{2,3}(-[A-Z]{2,4})?$/.test(upper)) {
    return upper.toLowerCase();
  }
  return null;
}

class I18nService {
  getAvailableLocales() {
    if (!fs.existsSync(LOCALES_DIR)) return ["fr", "en"];
    const files = fs.readdirSync(LOCALES_DIR);
    const found = files
      .filter((f) => f.endsWith(".json"))
      .map((f) => path.basename(f, ".json").toLowerCase());

    const custom = found.filter((l) => l !== "fr" && l !== "en").sort();
    const result = [];
    if (found.includes("fr")) result.push("fr");
    if (found.includes("en")) result.push("en");
    for (const c of custom) {
      if (!result.includes(c)) result.push(c);
    }
    return result.length > 0 ? result : ["fr", "en"];
  }

  getLanguageMeta(code) {
    const c = String(code || "").toLowerCase();
    if (KNOWN_LANGUAGES[c]) {
      return KNOWN_LANGUAGES[c];
    }
    return {
      code: c,
      name: c.toUpperCase(),
      flag: "🌐",
    };
  }

  getAvailableLanguagesWithMeta() {
    return this.getAvailableLocales().map((code) => this.getLanguageMeta(code));
  }

  // Export all detected locales to a CSV string
  exportToCsvString() {
    const locales = this.getAvailableLocales();
    const flatByLocale = {};
    const allKeysSet = new Set();

    for (const loc of locales) {
      const locPath = path.join(LOCALES_DIR, `${loc}.json`);
      if (fs.existsSync(locPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(locPath, "utf8"));
          const flat = flattenObject(data);
          flatByLocale[loc] = flat;
          Object.keys(flat).forEach((k) => allKeysSet.add(k));
        } catch (e) {
          console.error(`Error reading ${loc}.json:`, e);
          flatByLocale[loc] = {};
        }
      } else {
        flatByLocale[loc] = {};
      }
    }

    const allKeys = Array.from(allKeysSet).sort();

    // Build header with Key + all locales in uppercase
    const headerCols = ["\uFEFFKey", ...locales.map((l) => l.toUpperCase())];
    const lines = [headerCols.join(",")];

    for (const key of allKeys) {
      const row = [escapeCsvValue(key)];
      for (const loc of locales) {
        const val = flatByLocale[loc] && flatByLocale[loc][key] !== undefined ? flatByLocale[loc][key] : "";
        row.push(escapeCsvValue(val));
      }
      lines.push(row.join(","));
    }

    return lines.join("\n");
  }

  // Export to a file on disk
  exportToCsvFile(destPath = DEFAULT_CSV_PATH) {
    const csvContent = this.exportToCsvString();
    fs.writeFileSync(destPath, csvContent, "utf8");
    return destPath;
  }

  // Import CSV text, update existing files and dynamically create new locale files
  importFromCsvString(csvText) {
    const rows = parseCsvText(csvText, { trimFields: false });
    if (!rows || rows.length < 2) {
      throw new Error("Le fichier CSV est vide ou ne contient pas d'en-tête valide.");
    }

    // Detect header columns
    const rawHeaders = rows[0];
    let keyIdx = -1;
    const targetLangs = []; // Array of { colIdx, code }

    for (let i = 0; i < rawHeaders.length; i++) {
      const col = (rawHeaders[i] || "").trim().toUpperCase();
      if (col === "KEY" || col === "CLÉ" || col === "CLE") {
        keyIdx = i;
      } else {
        const langCode = normalizeLanguageCode(col);
        if (langCode && !targetLangs.some((t) => t.code === langCode)) {
          targetLangs.push({ colIdx: i, code: langCode });
        }
      }
    }

    if (keyIdx === -1) {
      throw new Error("Colonne 'Key' introuvable dans le CSV. La première colonne doit être 'Key'.");
    }

    if (targetLangs.length === 0) {
      throw new Error("Aucune colonne de langue reconnue dans le CSV (ex: FR, EN, ES, DE, IT...).");
    }

    // Prepare dictionary for each language
    const flatByLang = {};
    for (const target of targetLangs) {
      flatByLang[target.code] = {};
    }

    let totalKeys = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const key = (row[keyIdx] || "").trim();
      if (!key) continue;
      totalKeys++;

      for (const target of targetLangs) {
        const cellValue = row[target.colIdx] !== undefined ? row[target.colIdx] : "";
        flatByLang[target.code][key] = cellValue;
      }
    }

    // Ensure locales directory exists
    if (!fs.existsSync(LOCALES_DIR)) {
      fs.mkdirSync(LOCALES_DIR, { recursive: true });
    }

    const previousLocales = this.getAvailableLocales();
    const updatedLocales = [];
    const newLocales = [];

    for (const target of targetLangs) {
      const code = target.code;
      const nested = unflattenObject(flatByLang[code]);
      const targetFilePath = path.join(LOCALES_DIR, `${code}.json`);
      fs.writeFileSync(targetFilePath, JSON.stringify(nested, null, 2) + "\n", "utf8");

      updatedLocales.push(code);
      if (!previousLocales.includes(code)) {
        newLocales.push(code);
      }
    }

    // Reconfigure i18n to immediately load the new/updated locales
    if (typeof i18n.refreshLocales === "function") {
      i18n.refreshLocales();
    }

    return {
      totalKeys,
      localesUpdated: updatedLocales,
      newLocales,
    };
  }

  // Import from a file on disk
  importFromCsvFile(srcPath = DEFAULT_CSV_PATH) {
    if (!fs.existsSync(srcPath)) {
      throw new Error(`Fichier introuvable : ${srcPath}`);
    }
    const csvContent = fs.readFileSync(srcPath, "utf8");
    return this.importFromCsvString(csvContent);
  }
}

const i18nService = new I18nService();
i18nService.unflattenObject = unflattenObject;
i18nService.escapeCsvValue = escapeCsvValue;

module.exports = i18nService;
