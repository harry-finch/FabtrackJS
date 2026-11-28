/**
 * Centralized timezone utilities driven by `APP_TIMEZONE` (default: "Europe/Paris").
 * Uses native Intl.DateTimeFormat (zero external dependencies) to handle CET/CEST DST
 * transitions and ISO week-years reliably without depending on MariaDB tz tables.
 */

const DEFAULT_APP_TIMEZONE = "Europe/Paris";
const formatterCache = new Map();

function isValidTimeZone(tz) {
  if (typeof tz !== "string" || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz.trim() }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function getAppTimezone(env = process.env) {
  const candidate = env && typeof env.APP_TIMEZONE === "string" ? env.APP_TIMEZONE.trim() : "";
  if (candidate && isValidTimeZone(candidate)) {
    return candidate;
  }
  return DEFAULT_APP_TIMEZONE;
}

function getPartsFormatter(timeZone) {
  if (!formatterCache.has(timeZone)) {
    formatterCache.set(
      timeZone,
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }),
    );
  }
  return formatterCache.get(timeZone);
}

/**
 * Extracts numeric calendar components of `date` in the specified IANA timezone.
 *
 * @param {Date|string|number} date
 * @param {string} [timeZone]
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number, second: number, weekday: number }}
 */
function getZonedDateParts(date, timeZone = getAppTimezone()) {
  const d = date instanceof Date ? date : new Date(date);
  const tz = isValidTimeZone(timeZone) ? timeZone : DEFAULT_APP_TIMEZONE;
  const parts = getPartsFormatter(tz).formatToParts(d);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = Number(part.value);
    }
  }
  const year = map.year;
  const month = map.month;
  const day = map.day;
  const hour = map.hour === 24 ? 0 : map.hour;
  const minute = map.minute;
  const second = map.second;
  // Monday = 0 .. Sunday = 6
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const weekday = (utcDay + 6) % 7;

  return { year, month, day, hour, minute, second, weekday };
}

/**
 * Formats a Date as "YYYY-MM-DD" in APP_TIMEZONE.
 */
function formatDateInTimezone(date, timeZone = getAppTimezone()) {
  const { year, month, day } = getZonedDateParts(date, timeZone);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Converts a wall-clock datetime `(year, month, day, hour, minute, second, ms)` in `timeZone`
 * into the corresponding UTC `Date`, accurately handling CET/CEST DST offsets.
 */
function zonedWallClockToUtcDate(
  { year, month, day, hour = 0, minute = 0, second = 0, ms = 0 },
  timeZone = getAppTimezone(),
) {
  const tz = isValidTimeZone(timeZone) ? timeZone : DEFAULT_APP_TIMEZONE;
  const targetUtcAsWall = Date.UTC(year, month - 1, day, hour, minute, second, ms);

  // Two-pass fixed-point iteration resolves DST transitions cleanly
  let guess = targetUtcAsWall;
  for (let i = 0; i < 3; i++) {
    const parts = getZonedDateParts(new Date(guess), tz);
    const actualAsWall = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      ms,
    );
    const diff = targetUtcAsWall - actualAsWall;
    if (diff === 0) break;
    guess += diff;
  }

  return new Date(guess);
}

/**
 * Parses a "YYYY-MM-DD" calendar string into `{ start: Date, end: Date }` covering
 * `00:00:00.000` to `23:59:59.999` in `timeZone` (returned as UTC Date instances).
 *
 * @param {string} dateStr
 * @param {string} [timeZone]
 * @returns {{ start: Date, end: Date } | null}
 */
function getZonedDayBounds(dateStr, timeZone = getAppTimezone()) {
  if (typeof dateStr !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Verify calendar validity (e.g. reject 2026-02-31)
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  const start = zonedWallClockToUtcDate({ year, month, day, hour: 0, minute: 0, second: 0, ms: 0 }, timeZone);
  const end = zonedWallClockToUtcDate({ year, month, day, hour: 23, minute: 59, second: 59, ms: 999 }, timeZone);
  return { start, end };
}

/**
 * Returns the UTC Date corresponding to `00:00:00.000` on `referenceDate`'s calendar day in `timeZone`.
 */
function getStartOfDayInTimezone(referenceDate = new Date(), timeZone = getAppTimezone()) {
  const { year, month, day } = getZonedDateParts(referenceDate, timeZone);
  return zonedWallClockToUtcDate({ year, month, day, hour: 0, minute: 0, second: 0, ms: 0 }, timeZone);
}

/**
 * Returns the UTC Date bounds `[start, nextYearStart)` covering the full calendar year
 * containing `referenceDate` in `timeZone` (`Jan 1 00:00:00.000` inclusive to
 * next `Jan 1 00:00:00.000` exclusive).
 *
 * @param {Date|string|number} [referenceDate=new Date()]
 * @param {string} [timeZone]
 * @returns {{ year: number, start: Date, nextYearStart: Date }}
 */
function getZonedYearBounds(referenceDate = new Date(), timeZone = getAppTimezone()) {
  const { year } = getZonedDateParts(referenceDate, timeZone);
  const start = zonedWallClockToUtcDate({ year, month: 1, day: 1, hour: 0, minute: 0, second: 0, ms: 0 }, timeZone);
  const nextYearStart = zonedWallClockToUtcDate(
    { year: year + 1, month: 1, day: 1, hour: 0, minute: 0, second: 0, ms: 0 },
    timeZone,
  );
  return { year, start, nextYearStart };
}

/**
 * Returns the UTC Date corresponding to `hour:minute:00.000` on `referenceDate`'s calendar day in `timeZone`.
 */
function getZonedTimeOnSameDay(referenceDate, { hour = 18, minute = 30 } = {}, timeZone = getAppTimezone()) {
  const { year, month, day } = getZonedDateParts(referenceDate, timeZone);
  return zonedWallClockToUtcDate({ year, month, day, hour, minute, second: 0, ms: 0 }, timeZone);
}

/**
 * Computes the true ISO-8601 week-year and week number for a Date in `timeZone`.
 * Correctly handles Dec 29-31 belonging to next year's W01, and Jan 1-3 belonging to previous year's W52/W53.
 *
 * @param {Date|string} date
 * @param {string} [timeZone]
 * @returns {{ isoYear: number, isoWeek: number, key: string, label: string }}
 */
function getIsoWeekYearAndNumber(date, timeZone = getAppTimezone()) {
  const { year, month, day } = getZonedDateParts(date, timeZone);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dayNum = utcDate.getUTCDay() || 7; // Mon=1 .. Sun=7
  // Shift to Thursday of the same ISO week to determine the authoritative ISO week-year
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
  const isoYear = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil(((utcDate - yearStart) / 86400000 + 1) / 7);
  const key = `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
  const label = `Sem. ${isoWeek} (${isoYear})`;
  return { isoYear, isoWeek, key, label };
}

/**
 * Counts how many times each weekday (Monday=0 .. Sunday=6) occurs between two inclusive
 * YYYY-MM-DD dates, bounded to `maxDays` (default 10 years = 3660 days) to prevent runaway loops.
 *
 * @param {string} startDateStr
 * @param {string} endDateStr
 * @param {number} [maxDays=3660]
 * @returns {number[]} Length-7 array [Mon..Sun]
 */
function enumerateWeekdayOccurrences(startDateStr, endDateStr, maxDays = 3660) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  const sMatch = typeof startDateStr === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDateStr) : null;
  const eMatch = typeof endDateStr === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(endDateStr) : null;
  if (!sMatch || !eMatch) return counts;

  const cur = new Date(Date.UTC(Number(sMatch[1]), Number(sMatch[2]) - 1, Number(sMatch[3])));
  const end = new Date(Date.UTC(Number(eMatch[1]), Number(eMatch[2]) - 1, Number(eMatch[3])));

  if (cur.getTime() > end.getTime()) return counts;

  let steps = 0;
  while (cur.getTime() <= end.getTime() && steps < maxDays) {
    const idx = (cur.getUTCDay() + 6) % 7;
    counts[idx]++;
    cur.setUTCDate(cur.getUTCDate() + 1);
    steps++;
  }

  return counts;
}

module.exports = {
  DEFAULT_APP_TIMEZONE,
  isValidTimeZone,
  getAppTimezone,
  getZonedDateParts,
  formatDateInTimezone,
  zonedWallClockToUtcDate,
  getZonedDayBounds,
  getStartOfDayInTimezone,
  getZonedYearBounds,
  getZonedTimeOnSameDay,
  getIsoWeekYearAndNumber,
  enumerateWeekdayOccurrences,
};
