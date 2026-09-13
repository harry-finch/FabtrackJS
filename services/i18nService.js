const fs = require("fs");
const path = require("path");
const i18n = require("../config/i18n");

const LOCALES_DIR = path.join(__dirname, "../locales");
const DEFAULT_CSV_PATH = path.join(__dirname, "../translations.csv");

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

// Helper: Unflatten dot-notated keys into a nested object
function unflattenObject(data) {
  const result = {};
  for (const [key, value] of Object.entries(data)) {
    const parts = key.split(".");
    let current = result;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current[part] = value;
      } else {
        if (!current[part] || typeof current[part] !== "object") {
          current[part] = {};
        }
        current = current[part];
      }
    }
  }
  return result;
}

// Helper: Escape a value for CSV (RFC 4180)
function escapeCsvValue(val) {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Helper: Parse CSV text into rows of columns (handles quotes, commas, newlines)
function parseCsv(csvText) {
  // Strip UTF-8 BOM if present
  let cleanText = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;
  cleanText = cleanText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const rows = [];
  let currentRow = [];
  let currentField = "";
  let insideQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (insideQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++; // Skip the escaped quote
        } else {
          insideQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ",") {
        currentRow.push(currentField);
        currentField = "";
      } else if (char === "\n") {
        currentRow.push(currentField);
        if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0].trim().length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = "";
      } else {
        currentField += char;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0].trim().length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

class I18nService {
  // Export locales (fr, en) to a CSV string
  exportToCsvString() {
    const frFile = path.join(LOCALES_DIR, "fr.json");
    const enFile = path.join(LOCALES_DIR, "en.json");

    const frData = fs.existsSync(frFile) ? JSON.parse(fs.readFileSync(frFile, "utf8")) : {};
    const enData = fs.existsSync(enFile) ? JSON.parse(fs.readFileSync(enFile, "utf8")) : {};

    const flatFr = flattenObject(frData);
    const flatEn = flattenObject(enData);

    const allKeys = Array.from(new Set([...Object.keys(flatFr), ...Object.keys(flatEn)])).sort();

    const lines = ["\uFEFFKey,FR,EN"]; // UTF-8 BOM ensures Excel opens accents properly
    for (const key of allKeys) {
      const frVal = flatFr[key] !== undefined ? flatFr[key] : "";
      const enVal = flatEn[key] !== undefined ? flatEn[key] : "";
      lines.push(`${escapeCsvValue(key)},${escapeCsvValue(frVal)},${escapeCsvValue(enVal)}`);
    }

    return lines.join("\n");
  }

  // Export to a file on disk (default translations.csv)
  exportToCsvFile(destPath = DEFAULT_CSV_PATH) {
    const csvContent = this.exportToCsvString();
    fs.writeFileSync(destPath, csvContent, "utf8");
    return destPath;
  }

  // Import CSV text and update fr.json and en.json
  importFromCsvString(csvText) {
    const rows = parseCsv(csvText);
    if (!rows || rows.length < 2) {
      throw new Error("Le fichier CSV est vide ou ne contient pas d'en-tête valide.");
    }

    // Detect header columns
    const header = rows[0].map((h) => h.trim().toUpperCase());
    const keyIdx = header.findIndex((h) => h === "KEY" || h === "CLÉ" || h === "CLE");
    const frIdx = header.findIndex((h) => h === "FR" || h === "FRANCAIS" || h === "FRANÇAIS" || h === "FRENCH");
    const enIdx = header.findIndex((h) => h === "EN" || h === "ANGLAIS" || h === "ENGLISH");

    if (keyIdx === -1 || (frIdx === -1 && enIdx === -1)) {
      throw new Error("En-têtes CSV invalides. Les colonnes requises sont : Key, FR, EN");
    }

    const flatFr = {};
    const flatEn = {};

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const key = (row[keyIdx] || "").trim();
      if (!key) continue;

      if (frIdx !== -1 && row[frIdx] !== undefined) {
        flatFr[key] = row[frIdx];
      }
      if (enIdx !== -1 && row[enIdx] !== undefined) {
        flatEn[key] = row[enIdx];
      }
    }

    // Ensure locales directory exists
    if (!fs.existsSync(LOCALES_DIR)) {
      fs.mkdirSync(LOCALES_DIR, { recursive: true });
    }

    const frNested = unflattenObject(flatFr);
    const enNested = unflattenObject(flatEn);

    fs.writeFileSync(path.join(LOCALES_DIR, "fr.json"), JSON.stringify(frNested, null, 2) + "\n", "utf8");
    fs.writeFileSync(path.join(LOCALES_DIR, "en.json"), JSON.stringify(enNested, null, 2) + "\n", "utf8");

    return {
      totalKeys: Object.keys(flatFr).length,
      localesUpdated: ["fr", "en"],
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

module.exports = new I18nService();
