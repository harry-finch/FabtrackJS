var express = require("express");
var router = express.Router();

const asyncHandler = require("../../middleware/asyncHandler.js");
const clearNotification = require("../../middleware/clearNotification.js");
const isAdmin = require("../../middleware/checkAdmin.js");

router.use(isAdmin);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const logger = require("../../utilities/simpleLogger.js");

function formatISODate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// ******************************************************************************
// Route for the Statistics Dashboard
// ******************************************************************************

router.get(
  "/",
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/statistics";

    let { workspaceId, period, startDate, endDate } = req.query;

    const now = new Date();
    const todayStr = formatISODate(now);

    // Default period preset: this_month if not specified
    if (!period && !startDate && !endDate) {
      period = "this_month";
    }

    let calculatedStart = null;
    let calculatedEnd = null;

    if (period === "7d") {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      calculatedStart = formatISODate(d);
      calculatedEnd = todayStr;
    } else if (period === "30d") {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      calculatedStart = formatISODate(d);
      calculatedEnd = todayStr;
    } else if (period === "this_month") {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      calculatedStart = formatISODate(d);
      calculatedEnd = todayStr;
    } else if (period === "last_month") {
      const dStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const dEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      calculatedStart = formatISODate(dStart);
      calculatedEnd = formatISODate(dEnd);
    } else if (period === "this_year") {
      const d = new Date(now.getFullYear(), 0, 1);
      calculatedStart = formatISODate(d);
      calculatedEnd = todayStr;
    } else if (period === "academic_year") {
      // Academic year starts Sept 1st
      const startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
      const d = new Date(startYear, 8, 1);
      calculatedStart = formatISODate(d);
      calculatedEnd = todayStr;
    } else if (period === "all") {
      calculatedStart = null;
      calculatedEnd = null;
    } else if (period === "custom") {
      calculatedStart = startDate || null;
      calculatedEnd = endDate || null;
    } else {
      calculatedStart = startDate || null;
      calculatedEnd = endDate || null;
    }

    const filterStartDate = calculatedStart;
    const filterEndDate = calculatedEnd;

    // Build Date Objects for Prisma queries
    let startDateObj = filterStartDate ? new Date(filterStartDate + "T00:00:00.000Z") : null;
    let endDateObj = filterEndDate ? new Date(filterEndDate + "T23:59:59.999Z") : null;

    const selectedWorkspaceId = workspaceId && workspaceId !== "all" && workspaceId !== "" ? Number(workspaceId) : null;

    // 1. Fetch available workspaces for filter dropdown
    const workspaces = await prisma.workspace.findMany({ orderBy: { name: "asc" } });

    // 2. Query History for the selected timeframe and workspace
    const historyWhere = {};
    if (startDateObj || endDateObj) {
      historyWhere.arrival = {};
      if (startDateObj) historyWhere.arrival.gte = startDateObj;
      if (endDateObj) historyWhere.arrival.lte = endDateObj;
    }
    if (selectedWorkspaceId) {
      historyWhere.workspaceId = selectedWorkspaceId;
    }

    const history = await prisma.history.findMany({
      where: historyWhere,
      include: {
        user: { include: { usertype: true } },
        userproject: { include: { project: { include: { projecttype: true } } } },
        workspace: true,
      },
      orderBy: { arrival: "asc" },
    });

    // 3. Query Activities for the timeframe
    const activityWhere = {};
    if (startDateObj || endDateObj) {
      activityWhere.createdAt = {};
      if (startDateObj) activityWhere.createdAt.gte = startDateObj;
      if (endDateObj) activityWhere.createdAt.lte = endDateObj;
    }
    if (selectedWorkspaceId) {
      activityWhere.history = { workspaceId: selectedWorkspaceId };
    }

    const activities = await prisma.activity.findMany({
      where: activityWhere,
      include: {
        history: { include: { workspace: true } },
      },
    });

    // References for machines & consumables
    const allMachines = await prisma.machine.findMany({
      include: { machinetype: true, category: true },
    });
    const machineMap = new Map(allMachines.map((m) => [m.id, m]));

    const allConsumables = await prisma.consumable.findMany({
      include: { category: true },
    });
    const consumableMap = new Map(allConsumables.map((c) => [c.id, c]));

    // 4. Compute KPIs
    const totalVisits = history.length;
    const uniqueUserIds = new Set(history.map((h) => h.userId));
    const uniqueVisitors = uniqueUserIds.size;

    // Duration calculation for completed visits
    let totalDurationMinutes = 0;
    let completedVisitsCount = 0;
    history.forEach((h) => {
      if (h.departure && h.arrival) {
        const diff = Math.max(0, (new Date(h.departure) - new Date(h.arrival)) / 60000);
        if (diff > 0 && diff < 1440) {
          // Ignore erroneous multi-day visits > 24h
          totalDurationMinutes += diff;
          completedVisitsCount++;
        }
      }
    });

    const avgDurationMin = completedVisitsCount > 0 ? Math.round(totalDurationMinutes / completedVisitsCount) : 0;
    const avgDurationFormatted = `${Math.floor(avgDurationMin / 60)}h ${String(avgDurationMin % 60).padStart(2, "0")}m`;
    const totalHoursFormatted = (totalDurationMinutes / 60).toFixed(1);

    // Active Projects Count (Only non-archived active projects)
    const activeProjectIds = new Set();
    history.forEach((h) => {
      if (h.userproject && h.userproject.project && h.userproject.project.active) {
        activeProjectIds.add(h.userproject.projectId);
      }
    });
    const activeProjectsCount = activeProjectIds.size;
    const totalActiveProjectsInDb = await prisma.project.count({
      where: { active: true },
    });

    // Consumables & Machine activity
    const machineActivities = activities.filter((a) => a.resourceType === "MACHINE");
    const consumableActivities = activities.filter((a) => a.resourceType === "CONSUMABLE");

    const totalMachineSessions = machineActivities.length;
    const uniqueMachinesOperated = new Set(machineActivities.map((a) => a.resourceId)).size;

    const totalConsumablesQuantity = consumableActivities.reduce((sum, a) => sum + (a.quantity || 1), 0);
    const totalConsumablesCost = consumableActivities
      .reduce((sum, a) => {
        const c = consumableMap.get(a.resourceId);
        const unitCost = c ? Number(c.cost) : 0;
        return sum + (a.quantity || 1) * unitCost;
      }, 0)
      .toFixed(2);

    // 5. Chart 1: Days of the week breakdown (Lundi - Dimanche) with Averages & Totals
    const dayNames = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    const dayOccurrences = [0, 0, 0, 0, 0, 0, 0];
    const dayAverages = [0, 0, 0, 0, 0, 0, 0];

    // Determine effective date range to count distinct occurrences of each weekday in the period
    let rangeStart = startDateObj;
    let rangeEnd = endDateObj;
    if (!rangeStart && history.length > 0) rangeStart = new Date(history[0].arrival);
    if (!rangeEnd && history.length > 0) rangeEnd = new Date(history[history.length - 1].arrival);
    if (!rangeStart) rangeStart = new Date();
    if (!rangeEnd) rangeEnd = new Date();

    const curDay = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
    const endDay = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate());
    while (curDay <= endDay) {
      const idx = (curDay.getDay() + 6) % 7;
      dayOccurrences[idx]++;
      curDay.setDate(curDay.getDate() + 1);
    }

    history.forEach((h) => {
      const d = new Date(h.arrival);
      const dayIdx = (d.getDay() + 6) % 7;
      dayCounts[dayIdx]++;
    });

    for (let i = 0; i < 7; i++) {
      const occ = dayOccurrences[i] || 1;
      dayAverages[i] = Number((dayCounts[i] / occ).toFixed(1));
    }

    const maxDayAvg = Math.max(...dayAverages);
    const peakDayIndex = dayAverages.indexOf(maxDayAvg);
    const peakDayName = maxDayAvg > 0 ? dayNames[peakDayIndex] : "N/A";
    const peakDayAvg = maxDayAvg;
    const peakDayTotal = dayCounts[peakDayIndex];
    const peakDayOccurrences = dayOccurrences[peakDayIndex];

    // 6. Chart 2: Timeline Evolution (By week or day depending on duration)
    // If range is <= 14 days, group by day. Otherwise group by week.
    let diffDays = 30;
    if (startDateObj && endDateObj) {
      diffDays = Math.ceil((endDateObj - startDateObj) / (1000 * 60 * 60 * 24));
    }

    const timelineMap = new Map();

    history.forEach((h) => {
      const d = new Date(h.arrival);
      let key = "";
      let label = "";

      if (diffDays <= 14) {
        // Group by Day (DD/MM)
        key = formatISODate(d);
        label = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
      } else {
        // Group by ISO Week
        const weekNum = getWeekNumber(d);
        const year = d.getFullYear();
        key = `${year}-W${String(weekNum).padStart(2, "0")}`;
        label = `Sem. ${weekNum} (${year})`;
      }

      if (!timelineMap.has(key)) {
        timelineMap.set(key, { label, count: 0, date: d });
      }
      timelineMap.get(key).count++;
    });

    const sortedTimeline = Array.from(timelineMap.entries()).sort((a, b) => a[1].date - b[1].date);
    const timelineLabels = sortedTimeline.map((item) => item[1].label);
    const timelineValues = sortedTimeline.map((item) => item[1].count);

    // 7. Chart 3: Distribution by User Types
    const userTypeMap = new Map();
    history.forEach((h) => {
      const typeName = h.user && h.user.usertype ? h.user.usertype.name : "Autre / Non spécifié";
      userTypeMap.set(typeName, (userTypeMap.get(typeName) || 0) + 1);
    });

    const userTypeLabels = Array.from(userTypeMap.keys());
    const userTypeCounts = Array.from(userTypeMap.values());

    // 8. Chart 4: Distribution by Project Types
    const projectTypeMap = new Map();
    history.forEach((h) => {
      let typeName = "Sans projet";
      if (h.userproject && h.userproject.project && h.userproject.project.projecttype) {
        typeName = h.userproject.project.projecttype.name;
      }
      projectTypeMap.set(typeName, (projectTypeMap.get(typeName) || 0) + 1);
    });

    const projectTypeLabels = Array.from(projectTypeMap.keys());
    const projectTypeCounts = Array.from(projectTypeMap.values());

    // 9. Chart 5: Top 5 Machines most used
    const machineCountMap = new Map();
    machineActivities.forEach((a) => {
      const m = machineMap.get(a.resourceId);
      const mName = m ? m.name : `Machine #${a.resourceId}`;
      machineCountMap.set(mName, (machineCountMap.get(mName) || 0) + 1);
    });

    const sortedMachines = Array.from(machineCountMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const topMachineLabels = sortedMachines.map((m) => m[0]);
    const topMachineCounts = sortedMachines.map((m) => m[1]);

    // 10. Chart 6: Top 5 Consumables most used (converted to stock units: bobines, packs, rouleaux...)
    const consumableStatsMap = new Map();
    consumableActivities.forEach((a) => {
      const c = consumableMap.get(a.resourceId);
      if (!c) return;
      const cName = c.name;
      const unitsPerPack = c.unitsPerPack && Number(c.unitsPerPack) > 0 ? Number(c.unitsPerPack) : 1;
      const stockUnitName = c.stockUnit || c.unit || "unités";
      const usageUnitName = c.unit || "unités";
      const qty = a.quantity || 1;
      const stockQty = qty / unitsPerPack;

      if (!consumableStatsMap.has(c.id)) {
        consumableStatsMap.set(c.id, {
          id: c.id,
          name: cName,
          stockUnit: stockUnitName,
          usageUnit: usageUnitName,
          totalUsageQty: 0,
          totalStockQty: 0,
        });
      }
      const entry = consumableStatsMap.get(c.id);
      entry.totalUsageQty += qty;
      entry.totalStockQty += stockQty;
    });

    const sortedConsumables = Array.from(consumableStatsMap.values())
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

    // 11. Distribution by Workspace (for the summary table)
    const workspaceStats = workspaces.map((ws) => {
      const wsVisits = history.filter((h) => h.workspaceId === ws.id);
      const wsUnique = new Set(wsVisits.map((h) => h.userId)).size;
      return {
        id: ws.id,
        name: ws.name,
        location: ws.location || "-",
        totalVisits: wsVisits.length,
        uniqueVisitors: wsUnique,
        percentage: totalVisits > 0 ? Math.round((wsVisits.length / totalVisits) * 100) : 0,
      };
    });

    const kpis = {
      totalVisits,
      uniqueVisitors,
      avgDurationFormatted,
      totalHoursFormatted,
      activeProjectsCount,
      totalActiveProjectsInDb,
      totalMachineSessions,
      uniqueMachinesOperated,
      totalConsumablesQuantity,
      totalConsumablesCost,
      peakDayName,
      peakDayAvg,
      peakDayTotal,
      peakDayOccurrences,
    };

    const chartData = {
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
    };

    const aiQueryService = require("../../services/aiQueryService");
    const aiConfig = await aiQueryService.getConfig();
    const isAiConfigured = Boolean(aiConfig.provider && aiConfig.provider !== "none");
    const aiProviderLabel = aiQueryService.getProviderLabel(aiConfig.provider);

    res.render("admin/manage-statistics", {
      workspaces,
      selectedWorkspaceId,
      period,
      filterStartDate: filterStartDate || "",
      filterEndDate: filterEndDate || "",
      kpis,
      chartData,
      workspaceStats,
      aiConfig,
      isAiConfigured,
      aiProviderLabel,
    });
  }),
);

// ******************************************************************************
// POST /admin/statistics/ai-query: Process natural language database query
// ******************************************************************************

router.post(
  "/ai-query",
  express.json(),
  asyncHandler(async (req, res) => {
    const { question } = req.body;
    if (!question || typeof question !== "string" || !question.trim()) {
      return res.status(400).json({ success: false, error: "Veuillez poser une question." });
    }

    const aiQueryService = require("../../services/aiQueryService");
    try {
      const result = await aiQueryService.processNaturalLanguageQuery(question);
      res.json(result);
    } catch (err) {
      console.error(`[AI Query Controller] ${err.message}`);
      res.status(400).json({ success: false, error: err.message });
    }
  }),
);

// ******************************************************************************
// Route to export summary CSV
// ******************************************************************************

router.get(
  "/export",
  asyncHandler(async (req, res) => {
    const { workspaceId, startDate, endDate } = req.query;

    const historyWhere = {};
    if (startDate) historyWhere.arrival = { ...(historyWhere.arrival || {}), gte: new Date(startDate + "T00:00:00.000Z") };
    if (endDate) historyWhere.arrival = { ...(historyWhere.arrival || {}), lte: new Date(endDate + "T23:59:59.999Z") };
    if (workspaceId && workspaceId !== "all" && workspaceId !== "") historyWhere.workspaceId = Number(workspaceId);

    const history = await prisma.history.findMany({
      where: historyWhere,
      include: {
        user: { include: { usertype: true } },
        userproject: { include: { project: { include: { projecttype: true } } } },
        workspace: true,
      },
      orderBy: { arrival: "asc" },
    });

    let csvContent = "\uFEFF"; // UTF-8 BOM
    csvContent += "ID;Date arrivee;Date depart;Duree (min);Utilisateur;Type utilisateur;Projet;Type projet;Espace\r\n";

    history.forEach((h) => {
      const arr = h.arrival ? new Date(h.arrival).toLocaleString("fr-FR") : "";
      const dep = h.departure ? new Date(h.departure).toLocaleString("fr-FR") : "";
      const dur = h.departure && h.arrival ? Math.round((new Date(h.departure) - new Date(h.arrival)) / 60000) : "";
      const uName = h.user ? `"${h.user.name} ${h.user.surname}"` : '""';
      const uType = h.user && h.user.usertype ? `"${h.user.usertype.name}"` : '""';
      const pUrl = h.userproject && h.userproject.project ? `"${h.userproject.project.url}"` : '""';
      const pType = h.userproject && h.userproject.project && h.userproject.project.projecttype ? `"${h.userproject.project.projecttype.name}"` : '""';
      const wsName = h.workspace ? `"${h.workspace.name}"` : '""';

      csvContent += `${h.id};${arr};${dep};${dur};${uName};${uType};${pUrl};${pType};${wsName}\r\n`;
    });

    const filename = `statistiques_fablab_${startDate || "debut"}_${endDate || "fin"}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);
  }),
);

module.exports = router;
