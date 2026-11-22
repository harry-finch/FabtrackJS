var express = require("express");
var router = express.Router();

const asyncHandler = require("../../middleware/asyncHandler.js");
const clearNotification = require("../../middleware/clearNotification.js");
const isAdmin = require("../../middleware/checkAdmin.js");
const { validateBody, validateQuery } = require("../../middleware/validate.js");
const {
  statisticsQuerySchema,
  statisticsExportQuerySchema,
  aiQuerySchema,
} = require("../../schemas/admin.schema.js");

router.use(isAdmin);

const { prisma } = require("../../utilities/db.js");

const statisticsService = require("../../services/statisticsService.js");
const { getZonedDayBounds } = require("../../utilities/timezoneHelper.js");

// ******************************************************************************
// Route for the Statistics Dashboard
// ******************************************************************************

router.get(
  "/",
  validateQuery(statisticsQuerySchema, { redirectUrl: "/admin/statistics" }),
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/statistics";

    const { workspaceId, period, startDate, endDate } = req.query;

    const stats = await statisticsService.getDashboardStats({
      workspaceId,
      period,
      startDate,
      endDate,
    });

    const aiQueryService = require("../../services/aiQueryService");
    const rawAiConfig = await aiQueryService.getConfig();
    const isAiConfigured = Boolean(rawAiConfig.provider && rawAiConfig.provider !== "none");
    const aiProviderLabel = aiQueryService.getProviderLabel(rawAiConfig.provider);
    const aiConfig = {
      provider: rawAiConfig.provider,
      openaiModel: rawAiConfig.openaiModel,
      geminiModel: rawAiConfig.geminiModel,
      anthropicModel: rawAiConfig.anthropicModel,
      localModel: rawAiConfig.localModel,
    };

    res.render("admin/manage-statistics", {
      workspaces: stats.workspaces,
      selectedWorkspaceId: stats.selectedWorkspaceId,
      period: stats.period,
      filterStartDate: stats.filterStartDate || "",
      filterEndDate: stats.filterEndDate || "",
      kpis: stats.kpis,
      chartData: stats.chartData,
      workspaceStats: stats.workspaceStats,
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
  validateBody(aiQuerySchema, { isApi: true }),
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
  validateQuery(statisticsExportQuerySchema, { redirectUrl: "/admin/statistics" }),
  asyncHandler(async (req, res) => {
    const { workspaceId, startDate, endDate } = req.query;

    const historyWhere = {};
    const startBounds = startDate ? getZonedDayBounds(startDate) : null;
    const endBounds = endDate ? getZonedDayBounds(endDate) : null;
    if (startBounds) historyWhere.arrival = { ...(historyWhere.arrival || {}), gte: startBounds.start };
    if (endBounds) historyWhere.arrival = { ...(historyWhere.arrival || {}), lte: endBounds.end };
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

    const { escapeCsvCell, sanitizeContentDispositionFilename } = require("../../utilities/securityHelpers.js");
    let csvContent = "\uFEFF"; // UTF-8 BOM
    csvContent += "ID;Date arrivee;Date depart;Duree (min);Utilisateur;Type utilisateur;Projet;Type projet;Espace\r\n";

    history.forEach((h) => {
      const arr = escapeCsvCell(h.arrival ? new Date(h.arrival).toLocaleString("fr-FR") : "");
      const dep = escapeCsvCell(h.departure ? new Date(h.departure).toLocaleString("fr-FR") : "");
      const dur = h.departure && h.arrival ? Math.round((new Date(h.departure) - new Date(h.arrival)) / 60000) : "";
      const uName = escapeCsvCell(h.user ? `${h.user.name} ${h.user.surname}` : "");
      const uType = escapeCsvCell(h.user && h.user.usertype ? h.user.usertype.name : "");
      const pUrl = escapeCsvCell(h.userproject && h.userproject.project ? h.userproject.project.url : "");
      const pType = escapeCsvCell(
        h.userproject && h.userproject.project && h.userproject.project.projecttype
          ? h.userproject.project.projecttype.name
          : "",
      );
      const wsName = escapeCsvCell(h.workspace ? h.workspace.name : "");

      csvContent += `${h.id};${arr};${dep};${dur};${uName};${uType};${pUrl};${pType};${wsName}\r\n`;
    });

    const filename = sanitizeContentDispositionFilename(
      `statistiques_fablab_${startDate || "debut"}_${endDate || "fin"}.csv`,
      "statistiques_fablab.csv",
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);
  }),
);

module.exports = router;
