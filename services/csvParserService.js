/**
 * RFC-4180 CSV parser & delimiter auto-detection shared across services.
 * Supports UTF-8 BOM stripping, `,`, `;`, and `\t` delimiters, quoted fields,
 * escaped quotes (`""`), CRLF/LF line endings, and ignores empty trailing lines.
 */

/**
 * Detects the most likely delimiter (`,`, `;`, or `\t`) from the first line of CSV text,
 * ignoring delimiter characters inside double-quoted header cells.
 *
 * @param {string} csvText
 * @returns {","|";"|"\t"}
 */
function detectDelimiter(csvText) {
  if (!csvText || typeof csvText !== "string") return ",";

  const cleanText = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;

  let commaCount = 0;
  let semicolonCount = 0;
  let tabCount = 0;
  let insideQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (insideQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          i++;
        } else {
          insideQuotes = false;
        }
      }
      continue;
    }

    if (char === '"') {
      insideQuotes = true;
    } else if (char === "\n" || char === "\r") {
      break;
    } else if (char === ",") {
      commaCount++;
    } else if (char === ";") {
      semicolonCount++;
    } else if (char === "\t") {
      tabCount++;
    }
  }

  if (semicolonCount > commaCount && semicolonCount >= tabCount) {
    return ";";
  }
  if (tabCount > commaCount && tabCount > semicolonCount) {
    return "\t";
  }
  return ",";
}

/**
 * Parses RFC-4180 CSV text into a 2D array of strings.
 *
 * @param {string} csvText
 * @param {Object} [options]
 * @param {string} [options.delimiter] - Explicit delimiter override (auto-detected if omitted)
 * @param {boolean} [options.trimFields=true] - Trim whitespace around each field value
 * @returns {string[][]}
 */
function parseCsvText(csvText, options = {}) {
  if (!csvText || typeof csvText !== "string") return [];

  // Strip UTF-8 BOM if present and normalize CRLF/CR to LF
  let cleanText = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;
  cleanText = cleanText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!cleanText.trim()) return [];

  const delimiter = options.delimiter || detectDelimiter(cleanText);
  const trimFields = options.trimFields !== undefined ? Boolean(options.trimFields) : true;

  const formatField = (value) => (trimFields ? value.trim() : value);

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
          i++; // Skip escaped double quote
        } else {
          insideQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else if (char === '"' && currentField.trim().length === 0) {
      if (trimFields) {
        currentField = "";
      }
      insideQuotes = true;
    } else if (char === delimiter) {
      currentRow.push(formatField(currentField));
      currentField = "";
    } else if (char === "\n") {
      currentRow.push(formatField(currentField));
      if (currentRow.some((field) => field.trim().length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = "";
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(formatField(currentField));
    if (currentRow.some((field) => field.trim().length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

module.exports = {
  detectDelimiter,
  parseCsvText,
};
