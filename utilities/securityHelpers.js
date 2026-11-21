/**
 * Centralized defense helpers for Open Redirects, CSV Formula Injection,
 * and Content-Disposition filename sanitization.
 */

const CSV_FORMULA_PREFIX_REGEX = /^[\s]*[=+\-@\t\r]/;

/**
 * Safely resolves an internal same-origin redirect path from `req.headers.referer`.
 * Rejects cross-origin URLs, protocol-relative URLs (`//evil.com`), non-HTTP schemes,
 * and CR/LF header injection attempts.
 *
 * @param {import("express").Request} req
 * @param {string} [fallback="/"]
 * @returns {string}
 */
function getSafeRedirectPath(req, fallback = "/") {
  const safeFallback =
    typeof fallback === "string" && fallback.startsWith("/") && !fallback.startsWith("//") && !/[\r\n]/.test(fallback)
      ? fallback
      : "/";

  const referer = req && req.headers && req.headers.referer;
  if (!referer || typeof referer !== "string" || /[\r\n\u0000]/.test(referer)) {
    return safeFallback;
  }

  try {
    const host =
      (req && typeof req.get === "function" ? req.get("host") : null) ||
      (req && req.headers && req.headers.host);
    if (!host) {
      return safeFallback;
    }

    const protocol = (req && req.protocol) || "http";
    const parsed = new URL(referer, `${protocol}://${host}`);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.host !== host) {
      return safeFallback;
    }

    const relative = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (!relative.startsWith("/") || relative.startsWith("//") || /[\r\n]/.test(relative)) {
      return safeFallback;
    }

    return relative;
  } catch {
    return safeFallback;
  }
}

/**
 * Resolves a redirect target that may be an explicit internal path or a Referer header.
 *
 * @param {unknown} candidate
 * @param {import("express").Request} req
 * @param {string} [fallback="/fabtrack"]
 * @returns {string}
 */
function resolveSafeRedirectUrl(candidate, req, fallback = "/fabtrack") {
  if (typeof candidate === "string") {
    const trimmed = candidate.trim();
    if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !/[\r\n\u0000]/.test(trimmed)) {
      return trimmed;
    }
    if (trimmed.length > 0 && req) {
      return getSafeRedirectPath({ ...req, headers: { ...(req.headers || {}), referer: trimmed } }, fallback);
    }
  }
  return getSafeRedirectPath(req, fallback);
}

/**
 * Escapes a single CSV cell per RFC 4180 while neutralizing spreadsheet formula injection
 * (`=`, `+`, `-`, `@`, `\t`, `\r`) by prefixing dangerous string values with `'`.
 *
 * @param {unknown} value
 * @param {{ alwaysQuote?: boolean, delimiter?: string }} [options]
 * @returns {string}
 */
function escapeCsvCell(value, { alwaysQuote = true, delimiter = ";" } = {}) {
  if (value === null || value === undefined) {
    return alwaysQuote ? '""' : "";
  }

  let str = String(value);
  const isPureNumber = typeof value === "number" && Number.isFinite(value);

  if (!isPureNumber && CSV_FORMULA_PREFIX_REGEX.test(str)) {
    str = `'${str}`;
  }

  const escaped = str.replace(/"/g, '""');
  const needsQuotes =
    alwaysQuote ||
    escaped.includes(delimiter) ||
    escaped.includes(",") ||
    escaped.includes(";") ||
    escaped.includes('"') ||
    escaped.includes("\n") ||
    escaped.includes("\r");

  return needsQuotes ? `"${escaped}"` : escaped;
}

/**
 * Sanitizes a filename before inserting it into a `Content-Disposition: attachment; filename="..."` header.
 * Prevents HTTP header injection (CR/LF/quotes) and path traversal characters.
 *
 * @param {unknown} rawName
 * @param {string} [fallback="export.csv"]
 * @returns {string}
 */
function sanitizeContentDispositionFilename(rawName, fallback = "export.csv") {
  if (typeof rawName !== "string") return fallback;
  const cleaned = rawName
    .replace(/[\r\n\u0000-\u001F\u007F]/g, "")
    .replace(/\.\.+/g, "_")
    .replace(/[/\\:"*?<>|]+/g, "_")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+/, "")
    .slice(0, 120);

  if (!cleaned || cleaned === "." || cleaned === "..") {
    return fallback;
  }
  return cleaned;
}

module.exports = {
  getSafeRedirectPath,
  resolveSafeRedirectUrl,
  escapeCsvCell,
  sanitizeContentDispositionFilename,
};
