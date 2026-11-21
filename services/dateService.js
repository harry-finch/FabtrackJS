const moment = require("moment");
require("moment/locale/fr");
// Keep Moment's global locale neutral ("fr") after initial load; never mutate it per request
moment.locale("fr");

const settingsService = require("./settingsService");

const VALID_FORMATS = [
  { value: "DD/MM/YYYY", label: "JJ/MM/AAAA (ex: 13/09/2026 — Standard français)" },
  { value: "YYYY-MM-DD", label: "AAAA-MM-JJ (ex: 2026-09-13 — Standard ISO)" },
  { value: "MM/DD/YYYY", label: "MM/JJ/AAAA (ex: 09/13/2026 — Format américain)" },
  { value: "DD.MM.YYYY", label: "JJ.MM.AAAA (ex: 13.09.2026 — Format suisse/allemand)" },
  { value: "D MMMM YYYY", label: "Format long (ex: 13 septembre 2026)" },
];

const VALID_FORMAT_VALUES = VALID_FORMATS.map((f) => f.value);
const SAFE_LOCALE_CODE_RE = /^[a-z]{2}(?:-[a-z0-9]{2,4})?$/;
const loadedMomentLocales = new Set(["en", "fr"]);
const unavailableMomentLocales = new Set();

function getDateFormat() {
  const s = settingsService.getCachedSettingsSync();
  const fmt = s && s.date_format;
  return fmt && VALID_FORMAT_VALUES.includes(fmt) ? fmt : "DD/MM/YYYY";
}

function getDefaultLocale() {
  const s = settingsService.getCachedSettingsSync();
  return (s && s.default_language) || "fr";
}

/**
 * Safely loads a Moment.js locale pack on demand (supporting any language added via CSV)
 * WITHOUT letting Moment's `defineLocale` side-effect mutate the global locale.
 *
 * @param {string} rawLocale
 * @returns {string} Resolved Moment locale code (falls back to "fr" if unavailable)
 */
function resolveMomentLocale(rawLocale) {
  const normalized =
    typeof rawLocale === "string"
      ? rawLocale.trim().toLowerCase().replace(/_/g, "-")
      : "";

  if (!normalized || !SAFE_LOCALE_CODE_RE.test(normalized)) {
    return "fr";
  }

  if (loadedMomentLocales.has(normalized)) {
    return normalized;
  }

  const baseCode = normalized.split("-")[0];
  const candidates = normalized === baseCode ? [normalized] : [normalized, baseCode];

  for (const candidate of candidates) {
    if (loadedMomentLocales.has(candidate)) {
      return candidate;
    }
    if (unavailableMomentLocales.has(candidate)) {
      continue;
    }

    const previousGlobalLocale = moment.locale();
    try {
      // Moment's locale modules call moment.defineLocale(), which mutates global locale;
      // restore previousGlobalLocale immediately so concurrent requests are never affected.
      require(`moment/locale/${candidate}`);
      loadedMomentLocales.add(candidate);
      return candidate;
    } catch (_err) {
      unavailableMomentLocales.add(candidate);
    } finally {
      if (moment.locale() !== previousGlobalLocale) {
        moment.locale(previousGlobalLocale);
      }
    }
  }

  return "fr";
}

/**
 * Deprecated no-op kept only for backwards compatibility.
 * Preloads the requested Moment locale pack without mutating global moment.locale().
 */
function setLocale(locale) {
  return resolveMomentLocale(locale);
}

function formatDate(date, customFormat = null, locale = null) {
  if (!date) return "-";
  const resolvedLocale = resolveMomentLocale(locale || getDefaultLocale());
  const d = moment(date).locale(resolvedLocale);
  if (!d.isValid()) return "-";
  return d.format(customFormat || getDateFormat());
}

function formatDateTime(date, customFormat = null, locale = null) {
  if (!date) return "-";
  const resolvedLocale = resolveMomentLocale(locale || getDefaultLocale());
  const d = moment(date).locale(resolvedLocale);
  if (!d.isValid()) return "-";
  const df = customFormat || getDateFormat();
  return d.format(`${df} HH:mm`);
}

function formatTime(time, locale = null) {
  if (!time) return "-";
  const resolvedLocale = resolveMomentLocale(locale || getDefaultLocale());
  const d = moment(time).locale(resolvedLocale);
  if (!d.isValid()) return "-";
  return d.format("HH:mm");
}

/**
 * Returns request-scoped date formatting helpers bound to a specific locale
 * so concurrent requests in different languages never share mutable global state.
 *
 * @param {string} locale
 */
function createRequestDateHelpers(locale) {
  const resolvedLocale = resolveMomentLocale(locale || getDefaultLocale());
  return {
    locale: resolvedLocale,
    formatDate: (date, customFormat = null) => formatDate(date, customFormat, resolvedLocale),
    formatDateTime: (date, customFormat = null) => formatDateTime(date, customFormat, resolvedLocale),
    formatTime: (time) => formatTime(time, resolvedLocale),
  };
}

function formatDuration(startDate, endDate) {
  if (!startDate || !endDate) return "-";
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return "-";
  const diffMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60)));
  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;
  if (hours === 0) return `${diffMinutes} min`;
  return `${hours}h${mins > 0 ? mins.toString().padStart(2, "0") : ""}`;
}

function formatDurationSeconds(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return "-";
  const sec = parseInt(seconds, 10);
  if (sec < 60) return `${sec}s`;
  const totalMinutes = Math.round(sec / 60);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${totalMinutes} min`;
  return `${hours}h${mins > 0 ? mins.toString().padStart(2, "0") : ""}`;
}

module.exports = {
  formatDate,
  formatDateTime,
  formatTime,
  createRequestDateHelpers,
  resolveMomentLocale,
  formatDuration,
  formatDurationSeconds,
  getDateFormat,
  setLocale,
  VALID_FORMATS,
  VALID_FORMAT_VALUES,
};
