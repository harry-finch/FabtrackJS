/**
 * Centralized XSS & injection defense helpers for EJS templates,
 * HTML email rendering, URL scheme validation, and Font Awesome icon whitelisting.
 */

const HTML_ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

const DEFAULT_WARNING_ICON_CLASS = "fa-solid fa-triangle-exclamation text-warning";

const ALLOWED_FA_STYLE_PREFIXES = new Set([
  "fa",
  "fas",
  "far",
  "fab",
  "fa-solid",
  "fa-regular",
  "fa-brands",
]);

const ALLOWED_ICON_UTILITY_CLASSES = new Set([
  "fa-xs",
  "fa-sm",
  "fa-lg",
  "fa-xl",
  "fa-2xl",
  "fa-fw",
  "me-1",
  "me-2",
  "ms-1",
  "ms-2",
]);

const ALLOWED_COLOR_CLASS_REGEX =
  /^text-(primary|secondary|success|danger|warning|info|dark|light|muted|body|black|white|primary-emphasis|secondary-emphasis|success-emphasis|danger-emphasis|warning-emphasis|info-emphasis)$/;

const ALLOWED_FA_ICON_REGEX = /^fa-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Escapes HTML special characters for safe interpolation inside HTML body or attributes.
 *
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"'`]/g, (ch) => HTML_ESCAPE_MAP[ch] || ch);
}

/**
 * Serializes a value as JSON safe for direct embedding inside `<script>` tags.
 * Escapes `<`, `>`, `&`, `\u2028`, and `\u2029` to prevent `</script>` breakout
 * and JS line-separator injection.
 *
 * @param {unknown} value
 * @returns {string}
 */
function safeJson(value) {
  const serialized = JSON.stringify(value === undefined ? null : value);
  if (typeof serialized !== "string") return "null";
  return serialized
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Validates that a URL uses strictly `http:` or `https:` protocol.
 * Rejects `javascript:`, `data:`, `vbscript:`, protocol-relative URLs, and malformed strings.
 *
 * @param {unknown} value
 * @returns {string | null} Normalized URL string or `null` if invalid/unsafe.
 */
function safeHttpUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Disallow control characters / whitespace tricks like "java\tscript:"
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Sanitizes a Warningtype icon value into a strictly whitelisted Font Awesome class string.
 * Supports both modern class strings (e.g. `"fa-solid fa-ban text-danger"`) and legacy
 * `<i class="fa-solid fa-ban text-danger"></i>` values stored in existing databases,
 * while stripping any HTML tags, event handlers, or unauthorized classes.
 *
 * @param {unknown} rawIcon
 * @param {string} [fallback=DEFAULT_WARNING_ICON_CLASS]
 * @returns {string}
 */
function sanitizeWarningIcon(rawIcon, fallback = DEFAULT_WARNING_ICON_CLASS) {
  if (typeof rawIcon !== "string") return fallback;
  const trimmed = rawIcon.trim();
  if (!trimmed) return fallback;

  let classCandidate = trimmed;

  // Legacy support: ONLY extract class="..." from a pure `<i ...></i>` wrapper
  if (trimmed.includes("<") || trimmed.includes(">")) {
    const legacyMatch = trimmed.match(/^<i\s+class\s*=\s*(?:"([^"]*)"|'([^']*)')\s*>\s*<\/i>$/i);
    if (!legacyMatch) {
      return fallback;
    }
    classCandidate = legacyMatch[1] || legacyMatch[2] || "";
  }

  const tokens = classCandidate.split(/\s+/).filter(Boolean);
  const validStyles = [];
  const validIcons = [];
  const validColors = [];
  const validUtilities = [];

  for (const token of tokens) {
    if (ALLOWED_FA_STYLE_PREFIXES.has(token)) {
      if (!validStyles.includes(token)) validStyles.push(token);
    } else if (ALLOWED_ICON_UTILITY_CLASSES.has(token)) {
      if (!validUtilities.includes(token)) validUtilities.push(token);
    } else if (ALLOWED_COLOR_CLASS_REGEX.test(token)) {
      if (!validColors.includes(token)) validColors.push(token);
    } else if (ALLOWED_FA_ICON_REGEX.test(token)) {
      if (!validIcons.includes(token)) validIcons.push(token);
    }
  }

  if (validIcons.length === 0) {
    return fallback;
  }

  const stylePrefix = validStyles.length > 0 ? validStyles[0] : "fa-solid";
  const parts = [stylePrefix, validIcons[0]];
  if (validColors.length > 0) parts.push(validColors[0]);
  if (validUtilities.length > 0) parts.push(...validUtilities.slice(0, 2));

  return parts.join(" ");
}

module.exports = {
  DEFAULT_WARNING_ICON_CLASS,
  escapeHtml,
  safeJson,
  safeHttpUrl,
  sanitizeWarningIcon,
};
