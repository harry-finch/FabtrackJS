const { Prisma } = require("@prisma/client");
const { prisma: defaultPrisma } = require("../utilities/db.js");
const {
  getAppTimezone,
  formatDateInTimezone,
  getZonedDayBounds,
  getZonedDateParts,
  getIsoWeekYearAndNumber,
  enumerateWeekdayOccurrences,
} = require("../utilities/timezoneHelper.js");

const STATS_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 50;
const DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function formatCalendarDate(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDaysToCalendarDate(year, month, day, deltaDays) {
  const d = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return formatCalendarDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function parseUtcBucket(bucketUtc) {
  if (bucketUtc instanceof Date) {
    return bucketUtc;
  }
  if (typeof bucketUtc === "string") {
    const trimmed = bucketUtc.trim();
    if (!trimmed) return null;
    if (trimmed.includes("T")) {
      return new Date(trimmed.endsWith("Z") ? trimmed : `${trimmed}Z`);
    }
    return new Date(`${trimmed.replace(" ", "T")}Z`);
  }
  return null;
}

/**
 * Resolves a statistics dashboard period preset or custom date range into
 * canonical YYYY-MM-DD strings and UTC Date bounds anchored in `APP_TIMEZONE`.
 *
 * @param {Object} [params]
 * @param {string} [params.period]
 * @param {string} [params.startDate]
 * @param {string} [params.endDate]
 * @param {Date} [params.now=new Date()]
 * @param {string} [params.timeZone]
 * @returns {{
 *   period: string,
 *   filterStartDate: string | null,
 *   filterEndDate: string | null,
 *   startDateObj: Date | null,
 *   endDateObj: Date | null,
 *   timeZone: string
 * }}
 */
function resolvePeriodRange({ period, startDate, endDate, now = new Date(), timeZone } = {}) {
  const tz = timeZone || getAppTimezone();
  const todayStr = formatDateInTimezone(now, tz);
  const parts = getZonedDateParts(now, tz);

  let resolvedPeriod = period;
  if (!resolvedPeriod && !startDate && !endDate) {
    resolvedPeriod = "this_month";
  }

  let calculatedStart = null;
  let calculatedEnd = null;

  if (resolvedPeriod === "7d") {
    calculatedStart = addDaysToCalendarDate(parts.year, parts.month, parts.day, -6);
    calculatedEnd = todayStr;
  } else if (resolvedPeriod === "30d") {
    calculatedStart = addDaysToCalendarDate(parts.year, parts.month, parts.day, -29);
    calculatedEnd = todayStr;
  } else if (resolvedPeriod === "this_month") {
    calculatedStart = formatCalendarDate(parts.year, parts.month, 1);
    calculatedEnd = todayStr;
  } else if (resolvedPeriod === "last_month") {
    const dStart = new Date(Date.UTC(parts.year, parts.month - 2, 1));
    const dEnd = new Date(Date.UTC(parts.year, parts.month - 1, 0));
    calculatedStart = formatCalendarDate(dStart.getUTCFullYear(), dStart.getUTCMonth() + 1, dStart.getUTCDate());
    calculatedEnd = formatCalendarDate(dEnd.getUTCFullYear(), dEnd.getUTCMonth() + 1, dEnd.getUTCDate());
  } else if (resolvedPeriod === "this_year") {
    calculatedStart = formatCalendarDate(parts.year, 1, 1);
    calculatedEnd = todayStr;
  } else if (resolvedPeriod === "academic_year") {
    // Academic year starts September 1st (month 9 in 1-based calendar)
    const startYear = parts.month >= 9 ? parts.year : parts.year - 1;
    calculatedStart = formatCalendarDate(startYear, 9, 1);
    calculatedEnd = todayStr;
  } else if (resolvedPeriod === "all") {
    calculatedStart = null;
    calculatedEnd = null;
  } else {
    calculatedStart = startDate || null;
    calculatedEnd = endDate || null;
  }

  const startBounds = calculatedStart ? getZonedDayBounds(calculatedStart, tz) : null;
  const endBounds = calculatedEnd ? getZonedDayBounds(calculatedEnd, tz) : null;

  return {
    period: resolvedPeriod || "custom",
    filterStartDate: startBounds ? calculatedStart.trim() : null,
    filterEndDate: endBounds ? calculatedEnd.trim() : null,
    startDateObj: startBounds ? startBounds.start : null,
    endDateObj: endBounds ? endBounds.end : null,
    timeZone: tz,
  };
}

/**
 * Converts SQL hourly UTC buckets into timezone-accurate weekday distributions,
 * averages, peak day KPIs, and daily/ISO-weekly timeline series.
 *
 * @param {Object} params
 * @param {Array<{ bucketUtc: string|Date, cnt: number|bigint }>} params.hourlyBuckets
 * @param {string|null} [params.filterStartDate]
 * @param {string|null} [params.filterEndDate]
 * @param {Date|null} [params.startDateObj]
 * @param {Date|null} [params.endDateObj]
 * @param {Date|string|null} [params.minArrival]
 * @param {Date|string|null} [params.maxArrival]
 * @param {Date} [params.now=new Date()]
 * @param {string} [params.timeZone]
 */
function buildTimelineAndWeekdays({
  hourlyBuckets = [],
  filterStartDate = null,
  filterEndDate = null,
  startDateObj = null,
  endDateObj = null,
  minArrival = null,
  maxArrival = null,
  now = new Date(),
  timeZone,
} = {}) {
  const tz = timeZone || getAppTimezone();
  const dayCounts = [0, 0, 0, 0, 0, 0, 0];

  let rangeStartStr = filterStartDate;
  let rangeEndStr = filterEndDate;
  if (!rangeStartStr && minArrival) {
    rangeStartStr = formatDateInTimezone(new Date(minArrival), tz);
  }
  if (!rangeEndStr && maxArrival) {
    rangeEndStr = formatDateInTimezone(new Date(maxArrival), tz);
  }
  if (!rangeStartStr) {
    rangeStartStr = formatDateInTimezone(now, tz);
  }
  if (!rangeEndStr) {
    rangeEndStr = formatDateInTimezone(now, tz);
  }

  const dayOccurrences = enumerateWeekdayOccurrences(rangeStartStr, rangeEndStr);

  // If range is <= 14 days, group timeline by day; otherwise group by ISO week.
  let diffDays = 30;
  if (startDateObj && endDateObj) {
    diffDays = Math.ceil((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24));
  }

  const timelineMap = new Map();

  for (const row of hourlyBuckets) {
    const count = Number(row && row.cnt ? row.cnt : 0);
    if (!count) continue;

    const d = parseUtcBucket(row.bucketUtc);
    if (!d || Number.isNaN(d.getTime())) continue;

    const parts = getZonedDateParts(d, tz);
    dayCounts[parts.weekday] += count;

    let key;
    let label;
    if (diffDays <= 14) {
      key = formatDateInTimezone(d, tz);
      label = `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}`;
    } else {
      const iso = getIsoWeekYearAndNumber(d, tz);
      key = iso.key;
      label = iso.label;
    }

    if (!timelineMap.has(key)) {
      timelineMap.set(key, { key, label, count: 0 });
    }
    timelineMap.get(key).count += count;
  }

  const dayAverages = dayCounts.map((count, idx) => {
    const occ = dayOccurrences[idx] || 1;
    return Number((count / occ).toFixed(1));
  });

  const maxDayAvg = Math.max(...dayAverages);
  const peakDayIndex = dayAverages.indexOf(maxDayAvg);
  const peakDayName = maxDayAvg > 0 ? DAY_NAMES[peakDayIndex] : "N/A";
  const peakDayAvg = maxDayAvg;
  const peakDayTotal = dayCounts[peakDayIndex];
  const peakDayOccurrences = dayOccurrences[peakDayIndex];

  const sortedTimeline = Array.from(timelineMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const timelineLabels = sortedTimeline.map(([, item]) => item.label);
  const timelineValues = sortedTimeline.map(([, item]) => item.count);

  return {
    dayNames: [...DAY_NAMES],
    dayCounts,
    dayOccurrences,
    dayAverages,
    peakDayName,
    peakDayAvg,
    peakDayTotal,
    peakDayOccurrences,
    timelineLabels,
    timelineValues,
  };
}

class StatisticsService {
  /**
   * @param {Object} [deps]
   * @param {Object} [deps.prisma]
   * @param {string} [deps.timeZone]
   * @param {number} [deps.cacheTtlMs]
   * @param {number} [deps.maxCacheEntries]
   */
  constructor({
    prisma,
    timeZone,
    cacheTtlMs = STATS_CACHE_TTL_MS,
    maxCacheEntries = MAX_CACHE_ENTRIES,
  } = {}) {
    this.prisma = prisma || defaultPrisma;
    this.timeZone = timeZone || null;
    this.cacheTtlMs = Number(cacheTtlMs) > 0 ? Number(cacheTtlMs) : STATS_CACHE_TTL_MS;
    this.maxCacheEntries = Number(maxCacheEntries) > 0 ? Number(maxCacheEntries) : MAX_CACHE_ENTRIES;
    this.cache = new Map();
  }

  /**
   * Clears all cached dashboard statistics snapshots.
   */
  invalidateCache() {
    this.cache.clear();
  }

  _getFromCache(cacheKey) {
    const entry = this.cache.get(cacheKey);
    if (!entry) return null;
    if (Date.now() - entry.timestamp >= this.cacheTtlMs) {
      this.cache.delete(cacheKey);
      return null;
    }
    // Refresh LRU recency
    this.cache.delete(cacheKey);
    this.cache.set(cacheKey, entry);
    return entry.data;
  }

  _setInCache(cacheKey, data) {
    if (this.cache.has(cacheKey)) {
      this.cache.delete(cacheKey);
    } else if (this.cache.size >= this.maxCacheEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(cacheKey, { timestamp: Date.now(), data });
  }

  /**
   * Computes all statistics dashboard KPIs, charts, and workspace summaries
   * directly via parallel parameterized SQL aggregations (zero raw History/Activity loads).
   *
   * @param {Object} [params]
   * @param {string|number|null} [params.workspaceId]
   * @param {string} [params.period]
   * @param {string} [params.startDate]
   * @param {string} [params.endDate]
   * @param {Date} [params.now=new Date()]
   */
  async getDashboardStats({ workspaceId, period, startDate, endDate, now = new Date() } = {}) {
    const tz = this.timeZone || getAppTimezone();
    const {
      period: resolvedPeriod,
      filterStartDate,
      filterEndDate,
      startDateObj,
      endDateObj,
    } = resolvePeriodRange({ period, startDate, endDate, now, timeZone: tz });

    const parsedWs =
      workspaceId !== undefined && workspaceId !== null && workspaceId !== "" && workspaceId !== "all"
        ? Number(workspaceId)
        : null;
    const selectedWorkspaceId = Number.isInteger(parsedWs) && parsedWs > 0 ? parsedWs : null;

    const cacheKey = `${selectedWorkspaceId || "all"}|${filterStartDate || ""}|${filterEndDate || ""}|${tz}`;
    const cached = this._getFromCache(cacheKey);
    if (cached) {
      return { ...cached, period: resolvedPeriod };
    }

    // Build parameterized SQL WHERE clauses
    const historyConditions = [];
    if (startDateObj) historyConditions.push(Prisma.sql`h.arrival >= ${startDateObj}`);
    if (endDateObj) historyConditions.push(Prisma.sql`h.arrival <= ${endDateObj}`);
    if (selectedWorkspaceId) historyConditions.push(Prisma.sql`h.workspaceId = ${selectedWorkspaceId}`);

    const historyWhereSql =
      historyConditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(historyConditions, " AND ")}`
        : Prisma.empty;

    const activeProjectsWhereSql = Prisma.sql`WHERE ${Prisma.join(
      [Prisma.sql`p.active = 1`, ...historyConditions],
      " AND ",
    )}`;

    const buildActivityWhereSql = (resourceType) => {
      const conds = [Prisma.sql`a.resourceType = ${resourceType}`];
      if (startDateObj) conds.push(Prisma.sql`a.createdAt >= ${startDateObj}`);
      if (endDateObj) conds.push(Prisma.sql`a.createdAt <= ${endDateObj}`);
      if (selectedWorkspaceId) conds.push(Prisma.sql`h.workspaceId = ${selectedWorkspaceId}`);
      return Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}`;
    };

    const activityHistoryJoinSql = selectedWorkspaceId
      ? Prisma.sql`INNER JOIN History h ON h.id = a.historyId`
      : Prisma.sql`LEFT JOIN History h ON h.id = a.historyId`;

    const [
      workspaces,
      allMachines,
      allConsumables,
      totalActiveProjectsInDb,
      visitKpiRows,
      activeProjectRows,
      machineRows,
      consumableRows,
      hourlyBuckets,
      userTypeRows,
      projectTypeRows,
      workspaceAggRows,
    ] = await Promise.all([
      this.prisma.workspace.findMany({ orderBy: { name: "asc" } }),
      this.prisma.machine.findMany({ include: { machinetype: true, category: true } }),
      this.prisma.consumable.findMany({ include: { category: true } }),
      this.prisma.project.count({ where: { active: true } }),

      // a) Visit KPIs
      this.prisma.$queryRaw(Prisma.sql`
        SELECT
          COUNT(*) AS totalVisits,
          COUNT(DISTINCT h.userId) AS uniqueVisitors,
          COALESCE(
            SUM(
              CASE
                WHEN h.departure IS NOT NULL
                  AND TIMESTAMPDIFF(SECOND, h.arrival, h.departure) > 0
                  AND TIMESTAMPDIFF(SECOND, h.arrival, h.departure) < 86400
                THEN TIMESTAMPDIFF(SECOND, h.arrival, h.departure) / 60.0
                ELSE 0
              END
            ),
            0
          ) AS totalDurationMinutes,
          SUM(
            CASE
              WHEN h.departure IS NOT NULL
                AND TIMESTAMPDIFF(SECOND, h.arrival, h.departure) > 0
                AND TIMESTAMPDIFF(SECOND, h.arrival, h.departure) < 86400
              THEN 1
              ELSE 0
            END
          ) AS completedVisitsCount,
          MIN(h.arrival) AS minArrival,
          MAX(h.arrival) AS maxArrival
        FROM History h
        ${historyWhereSql}
      `),

      // b) Active projects in range
      this.prisma.$queryRaw(Prisma.sql`
        SELECT COUNT(DISTINCT p.id) AS activeProjectsCount
        FROM History h
        INNER JOIN UserProject up ON up.id = h.userprojectId
        INNER JOIN Project p ON p.id = up.projectId
        ${activeProjectsWhereSql}
      `),

      // c) Machine activities
      this.prisma.$queryRaw(Prisma.sql`
        SELECT a.resourceId, COUNT(*) AS sessionCount
        FROM Activity a
        ${activityHistoryJoinSql}
        ${buildActivityWhereSql("MACHINE")}
        GROUP BY a.resourceId
        ORDER BY sessionCount DESC
      `),

      // d) Consumable activities
      this.prisma.$queryRaw(Prisma.sql`
        SELECT
          a.resourceId,
          SUM(COALESCE(a.quantity, 1)) AS totalQty,
          SUM(COALESCE(a.quantity, 1) * COALESCE(a.unitCost, c.cost, 0)) AS totalCost
        FROM Activity a
        ${activityHistoryJoinSql}
        LEFT JOIN Consumable c ON c.id = a.resourceId
        ${buildActivityWhereSql("CONSUMABLE")}
        GROUP BY a.resourceId
      `),

      // e) Hourly UTC buckets for DST-accurate weekday & timeline aggregation
      this.prisma.$queryRaw(Prisma.sql`
        SELECT DATE_FORMAT(h.arrival, '%Y-%m-%d %H:00:00') AS bucketUtc, COUNT(*) AS cnt
        FROM History h
        ${historyWhereSql}
        GROUP BY bucketUtc
        ORDER BY bucketUtc ASC
      `),

      // f) UserType distribution
      this.prisma.$queryRaw(Prisma.sql`
        SELECT COALESCE(ut.name, 'Autre / Non spécifié') AS label, COUNT(*) AS cnt
        FROM History h
        LEFT JOIN User u ON u.id = h.userId
        LEFT JOIN Usertype ut ON ut.id = u.usertypeId
        ${historyWhereSql}
        GROUP BY label
      `),

      // g) Projecttype (Motif) distribution
      this.prisma.$queryRaw(Prisma.sql`
        SELECT COALESCE(pt.name, 'Non spécifié') AS label, COUNT(*) AS cnt
        FROM History h
        LEFT JOIN UserProject up ON up.id = h.userprojectId
        LEFT JOIN Project p ON p.id = up.projectId
        LEFT JOIN Projecttype pt ON pt.id = p.projecttypeId
        ${historyWhereSql}
        GROUP BY label
      `),

      // h) Workspace summary
      this.prisma.$queryRaw(Prisma.sql`
        SELECT
          h.workspaceId,
          COUNT(*) AS totalVisits,
          COUNT(DISTINCT h.userId) AS uniqueVisitors
        FROM History h
        ${historyWhereSql}
        GROUP BY h.workspaceId
      `),
    ]);

    const machineMap = new Map((allMachines || []).map((m) => [m.id, m]));
    const consumableMap = new Map((allConsumables || []).map((c) => [c.id, c]));

    // KPIs from SQL aggregates
    const kpiRow = (visitKpiRows && visitKpiRows[0]) || {};
    const totalVisits = Number(kpiRow.totalVisits || 0);
    const uniqueVisitors = Number(kpiRow.uniqueVisitors || 0);
    const totalDurationMinutes = Number(kpiRow.totalDurationMinutes || 0);
    const completedVisitsCount = Number(kpiRow.completedVisitsCount || 0);
    const minArrival = kpiRow.minArrival || null;
    const maxArrival = kpiRow.maxArrival || null;

    const avgDurationMin = completedVisitsCount > 0 ? Math.round(totalDurationMinutes / completedVisitsCount) : 0;
    const avgDurationFormatted = `${Math.floor(avgDurationMin / 60)}h ${String(avgDurationMin % 60).padStart(2, "0")}m`;
    const totalHoursFormatted = (totalDurationMinutes / 60).toFixed(1);

    const activeProjectRow = (activeProjectRows && activeProjectRows[0]) || {};
    const activeProjectsCount = Number(activeProjectRow.activeProjectsCount || 0);

    // Machines KPIs & Top 5
    const safeMachineRows = Array.isArray(machineRows) ? machineRows : [];
    let totalMachineSessions = 0;
    let uniqueMachinesOperated = 0;
    const machineCountMap = new Map();
    for (const row of safeMachineRows) {
      const resourceId = Number(row.resourceId);
      const count = Number(row.sessionCount || 0);
      if (count <= 0) continue;
      totalMachineSessions += count;
      uniqueMachinesOperated += 1;
      const m = machineMap.get(resourceId);
      const mName = m ? m.name : `Machine #${resourceId}`;
      machineCountMap.set(mName, (machineCountMap.get(mName) || 0) + count);
    }

    const sortedMachines = Array.from(machineCountMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const topMachineLabels = sortedMachines.map((m) => m[0]);
    const topMachineCounts = sortedMachines.map((m) => m[1]);

    // Consumables KPIs & Top 5 (converted to stock units)
    const safeConsumableRows = Array.isArray(consumableRows) ? consumableRows : [];
    let totalConsumablesQuantity = 0;
    let totalConsumablesCostRaw = 0;
    const consumableStats = [];

    for (const row of safeConsumableRows) {
      const resourceId = Number(row.resourceId);
      const totalUsageQty = Number(row.totalQty || 0);
      const totalCost = Number(row.totalCost || 0);
      totalConsumablesQuantity += totalUsageQty;
      totalConsumablesCostRaw += totalCost;

      const c = consumableMap.get(resourceId);
      if (!c) continue;

      const unitsPerPack = c.unitsPerPack && Number(c.unitsPerPack) > 0 ? Number(c.unitsPerPack) : 1;
      const stockUnit = c.stockUnit || c.unit || "unités";
      const usageUnit = c.unit || "unités";
      const totalStockQty = totalUsageQty / unitsPerPack;

      consumableStats.push({
        id: c.id,
        name: c.name,
        stockUnit,
        usageUnit,
        totalUsageQty,
        totalStockQty,
      });
    }

    const totalConsumablesCost = totalConsumablesCostRaw.toFixed(2);
    const sortedConsumables = consumableStats
      .sort((a, b) => b.totalStockQty - a.totalStockQty)
      .slice(0, 5);
    const topConsumableLabels = sortedConsumables.map((c) => c.name);
    const topConsumableCounts = sortedConsumables.map((c) => Number(c.totalStockQty.toFixed(2)));
    const topConsumableDetails = sortedConsumables.map((c) => ({
      name: c.name,
      stockQty: Number(c.totalStockQty.toFixed(2)),
      stockUnit: c.stockUnit,
      usageQty: c.totalUsageQty,
      usageUnit: c.usageUnit,
    }));

    // Weekday averages & timeline in APP_TIMEZONE
    const {
      dayNames,
      dayCounts,
      dayOccurrences,
      dayAverages,
      peakDayName,
      peakDayAvg,
      peakDayTotal,
      peakDayOccurrences,
      timelineLabels,
      timelineValues,
    } = buildTimelineAndWeekdays({
      hourlyBuckets: Array.isArray(hourlyBuckets) ? hourlyBuckets : [],
      filterStartDate,
      filterEndDate,
      startDateObj,
      endDateObj,
      minArrival,
      maxArrival,
      now,
      timeZone: tz,
    });

    // UserType & Projecttype distributions
    const safeUserTypeRows = Array.isArray(userTypeRows) ? userTypeRows : [];
    const userTypeLabels = safeUserTypeRows.map((r) => r.label || "Autre / Non spécifié");
    const userTypeCounts = safeUserTypeRows.map((r) => Number(r.cnt || 0));

    const safeProjectTypeRows = Array.isArray(projectTypeRows) ? projectTypeRows : [];
    const projectTypeLabels = safeProjectTypeRows.map((r) => r.label || "Non spécifié");
    const projectTypeCounts = safeProjectTypeRows.map((r) => Number(r.cnt || 0));

    // Workspace summary table
    const wsAggMap = new Map();
    for (const row of Array.isArray(workspaceAggRows) ? workspaceAggRows : []) {
      if (row.workspaceId !== null && row.workspaceId !== undefined) {
        wsAggMap.set(Number(row.workspaceId), {
          totalVisits: Number(row.totalVisits || 0),
          uniqueVisitors: Number(row.uniqueVisitors || 0),
        });
      }
    }

    const workspaceStats = (workspaces || []).map((ws) => {
      const agg = wsAggMap.get(ws.id);
      const wsVisits = agg ? agg.totalVisits : 0;
      const wsUnique = agg ? agg.uniqueVisitors : 0;
      return {
        id: ws.id,
        name: ws.name,
        location: ws.location || "-",
        totalVisits: wsVisits,
        uniqueVisitors: wsUnique,
        percentage: totalVisits > 0 ? Math.round((wsVisits / totalVisits) * 100) : 0,
      };
    });

    const result = {
      workspaces: workspaces || [],
      selectedWorkspaceId,
      period: resolvedPeriod,
      filterStartDate: filterStartDate || "",
      filterEndDate: filterEndDate || "",
      kpis: {
        totalVisits,
        uniqueVisitors,
        avgDurationFormatted,
        totalHoursFormatted,
        activeProjectsCount,
        totalActiveProjectsInDb: Number(totalActiveProjectsInDb || 0),
        totalMachineSessions,
        uniqueMachinesOperated,
        totalConsumablesQuantity,
        totalConsumablesCost,
        peakDayName,
        peakDayAvg,
        peakDayTotal,
        peakDayOccurrences,
      },
      chartData: {
        dayNames,
        dayCounts,
        dayOccurrences,
        dayAverages,
        timelineLabels,
        timelineValues,
        userTypeLabels,
        userTypeCounts,
        projectTypeLabels,
        projectTypeCounts,
        topMachineLabels,
        topMachineCounts,
        topConsumableLabels,
        topConsumableCounts,
        topConsumableDetails,
      },
      workspaceStats,
    };

    this._setInCache(cacheKey, result);
    return result;
  }
}

const statisticsService = new StatisticsService();
statisticsService.StatisticsService = StatisticsService;
statisticsService.resolvePeriodRange = resolvePeriodRange;
statisticsService.buildTimelineAndWeekdays = buildTimelineAndWeekdays;
statisticsService.STATS_CACHE_TTL_MS = STATS_CACHE_TTL_MS;
statisticsService.MAX_CACHE_ENTRIES = MAX_CACHE_ENTRIES;

module.exports = statisticsService;
