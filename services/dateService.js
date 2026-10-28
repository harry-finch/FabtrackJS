const moment = require("moment");
require("moment/locale/fr");
const settingsService = require("./settingsService");

const VALID_FORMATS = [
  { value: "DD/MM/YYYY", label: "JJ/MM/AAAA (ex: 13/09/2026 — Standard français)" },
  { value: "YYYY-MM-DD", label: "AAAA-MM-JJ (ex: 2026-09-13 — Standard ISO)" },
  { value: "MM/DD/YYYY", label: "MM/JJ/AAAA (ex: 09/13/2026 — Format américain)" },
  { value: "DD.MM.YYYY", label: "JJ.MM.AAAA (ex: 13.09.2026 — Format suisse/allemand)" },
  { value: "D MMMM YYYY", label: "Format long (ex: 13 septembre 2026)" },
];

const VALID_FORMAT_VALUES = VALID_FORMATS.map((f) => f.value);

function getDateFormat() {
  const s = settingsService.getCachedSettingsSync();
  const fmt = s && s.date_format;
  return fmt && VALID_FORMAT_VALUES.includes(fmt) ? fmt : "DD/MM/YYYY";
}

function setLocale(locale) {
  if (locale && (locale === "fr" || locale === "en")) {
    moment.locale(locale);
  }
}

function formatDate(date, customFormat = null) {
  if (!date) return "-";
  const d = moment(date);
  if (!d.isValid()) return "-";
  return d.format(customFormat || getDateFormat());
}

function formatDateTime(date, customFormat = null) {
  if (!date) return "-";
  const d = moment(date);
  if (!d.isValid()) return "-";
  const df = customFormat || getDateFormat();
  return d.format(`${df} HH:mm`);
}

function formatTime(time) {
  if (!time) return "-";
  const d = moment(time);
  if (!d.isValid()) return "-";
  return d.format("HH:mm");
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
  formatDuration,
  formatDurationSeconds,
  getDateFormat,
  setLocale,
  VALID_FORMATS,
  VALID_FORMAT_VALUES,
};
