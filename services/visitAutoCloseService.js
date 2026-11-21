const { prisma: defaultPrisma } = require("../utilities/db");
const defaultSettingsService = require("./settingsService");
const defaultLogger = require("../utilities/simpleLogger");

const DEFAULT_CLOSING_TIME = "18:30";
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_STARTUP_DELAY_MS = 5 * 1000;

/**
 * Parses an `"HH:mm"` closing time string, returning `{ hour, minute }`
 * with fallback to `18:30`.
 *
 * @param {unknown} rawTime
 * @returns {{ hour: number, minute: number }}
 */
function parseClosingTime(rawTime) {
  if (typeof rawTime === "string") {
    const match = rawTime.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      const hour = parseInt(match[1], 10);
      const minute = parseInt(match[2], 10);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        return { hour, minute };
      }
    }
  }
  return { hour: 18, minute: 30 };
}

/**
 * Computes the local start-of-day (00:00:00.000) for a given date.
 *
 * @param {Date} [referenceDate=new Date()]
 * @returns {Date}
 */
function getStartOfDay(referenceDate = new Date()) {
  const start = new Date(referenceDate.getTime());
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * Computes a guaranteed non-negative departure timestamp for an open visit:
 * `max(arrival, closingTimeOnArrivalDay)`.
 *
 * @param {Date|string} arrival
 * @param {{ hour: number, minute: number }} closing
 * @returns {Date}
 */
function computeSafeDeparture(arrival, closing = { hour: 18, minute: 30 }) {
  const arrivalDate = arrival instanceof Date ? new Date(arrival.getTime()) : new Date(arrival);
  const closingDate = new Date(arrivalDate.getTime());
  closingDate.setHours(closing.hour, closing.minute, 0, 0);

  return arrivalDate.getTime() > closingDate.getTime() ? arrivalDate : closingDate;
}

/**
 * Scheduled service responsible for automatically closing forgotten open visits
 * from previous days across ALL workspaces, decoupling DB writes from `GET /fabtrack/`.
 */
class VisitAutoCloseService {
  /**
   * @param {Object} [deps]
   * @param {Object} [deps.prisma]
   * @param {Object} [deps.settingsService]
   * @param {Object} [deps.logger]
   * @param {number} [deps.intervalMs=900000]
   */
  constructor({ prisma, settingsService, logger, intervalMs = DEFAULT_INTERVAL_MS } = {}) {
    this.prisma = prisma || defaultPrisma;
    this.settingsService = settingsService || defaultSettingsService;
    this.logger = logger || defaultLogger;
    this.intervalMs = Number(intervalMs) > 0 ? Number(intervalMs) : DEFAULT_INTERVAL_MS;
    this.intervalTimer = null;
    this.startupTimer = null;
    this.isRunning = false;
  }

  /**
   * Resolves the configured closing time from SystemSetting or environment.
   *
   * @returns {Promise<{ hour: number, minute: number }>}
   */
  async resolveClosingTime() {
    let rawTime = process.env.VISIT_AUTO_CLOSE_TIME || DEFAULT_CLOSING_TIME;
    try {
      const settings = await this.settingsService.getSettings();
      if (settings && typeof settings.visit_auto_close_time === "string" && settings.visit_auto_close_time.trim()) {
        rawTime = settings.visit_auto_close_time.trim();
      }
    } catch {
      // Fallback to env/default if settings cannot be read
    }
    return parseClosingTime(rawTime);
  }

  /**
   * Closes all forgotten visits (`departure === null && arrival < startOfToday`)
   * across all workspaces using batched `updateMany` calls while guaranteeing
   * `departure = max(arrival, closingTime)` (zero negative durations).
   *
   * @param {Date} [now=new Date()]
   * @returns {Promise<{ closedCount: number, skipped?: boolean }>}
   */
  async closeForgottenVisits(now = new Date()) {
    if (this.isRunning) {
      return { closedCount: 0, skipped: true };
    }
    this.isRunning = true;

    try {
      const startOfToday = getStartOfDay(now);
      const closing = await this.resolveClosingTime();

      const forgottenVisits = await this.prisma.history.findMany({
        where: {
          departure: null,
          arrival: { lt: startOfToday },
        },
        select: {
          id: true,
          arrival: true,
        },
      });

      if (!forgottenVisits || forgottenVisits.length === 0) {
        return { closedCount: 0 };
      }

      // Group visit IDs by exact departure timestamp for minimal batched updateMany queries
      const idsByDepartureIso = new Map();
      for (const visit of forgottenVisits) {
        const departureDate = computeSafeDeparture(visit.arrival, closing);
        const iso = departureDate.toISOString();
        if (!idsByDepartureIso.has(iso)) {
          idsByDepartureIso.set(iso, []);
        }
        idsByDepartureIso.get(iso).push(visit.id);
      }

      let closedCount = 0;
      for (const [iso, ids] of idsByDepartureIso.entries()) {
        const result = await this.prisma.history.updateMany({
          where: {
            id: { in: ids },
            departure: null,
          },
          data: {
            departure: new Date(iso),
          },
        });
        closedCount += result && typeof result.count === "number" ? result.count : 0;
      }

      if (closedCount > 0) {
        this.logger.logThat(
          `Clôture automatique de ${closedCount} visite(s) oubliée(s) des jours précédents.`,
        );
      }

      return { closedCount };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Starts periodic auto-close execution (unref'd so it never blocks shutdown/tests).
   *
   * @param {{ startupDelayMs?: number, intervalMs?: number }} [options]
   */
  startScheduler({ startupDelayMs = DEFAULT_STARTUP_DELAY_MS, intervalMs } = {}) {
    if (this.intervalTimer || this.startupTimer) return;
    const period = Number(intervalMs) > 0 ? Number(intervalMs) : this.intervalMs;

    const runSafely = () => {
      this.closeForgottenVisits().catch((err) => {
        console.error("[VisitAutoCloseService] Scheduled run failed:", err.message);
      });
    };

    this.startupTimer = setTimeout(() => {
      this.startupTimer = null;
      runSafely();
    }, startupDelayMs);
    if (typeof this.startupTimer.unref === "function") {
      this.startupTimer.unref();
    }

    this.intervalTimer = setInterval(runSafely, period);
    if (typeof this.intervalTimer.unref === "function") {
      this.intervalTimer.unref();
    }
  }

  /**
   * Stops all scheduled timers cleanly during graceful shutdown.
   */
  stopScheduler() {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }
}

const visitAutoCloseService = new VisitAutoCloseService();
visitAutoCloseService.VisitAutoCloseService = VisitAutoCloseService;
visitAutoCloseService.parseClosingTime = parseClosingTime;
visitAutoCloseService.getStartOfDay = getStartOfDay;
visitAutoCloseService.computeSafeDeparture = computeSafeDeparture;

module.exports = visitAutoCloseService;
