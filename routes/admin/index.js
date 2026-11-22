const express = require("express");
const dotenv = require("dotenv");

const isAdmin = require("../../middleware/checkAdmin.js");
const clearNotification = require("../../middleware/clearNotification.js");
const asyncHandler = require("../../middleware/asyncHandler.js");
const { validateQuery } = require("../../middleware/validate.js");
const { viewHistoryQuerySchema } = require("../../schemas/admin.schema.js");
const { getZonedDayBounds, formatDateInTimezone } = require("../../utilities/timezoneHelper.js");
const dateService = require("../../services/dateService.js");

dotenv.config();
const { prisma } = require("../../utilities/db.js");
const router = express.Router();

// Admin access check middleware
router.use(isAdmin);

// ******************************************************************************
// Route to the administration panel (Admin Only)
// ******************************************************************************

router.get("/", clearNotification, (req, res) => {
  res.render("admin/main", { workspaces: true });
});

// ******************************************************************************
// Route to view entire fablab history (Admin Only)
// ******************************************************************************

router.get(
  "/view-history",
  validateQuery(viewHistoryQuerySchema, { redirectUrl: "/admin/view-history" }),
  clearNotification,
  asyncHandler(async (req, res) => {
    try {
      if (req.session) {
        req.session.lastPage = req.originalUrl || "/admin/view-history";
      }

      const query = req.validatedQuery || req.query || {};
      const page = Number(query.page) || 1;
      const limit = Number(query.limit) || 50;
      const rawWorkspaceId = query.workspaceId ? String(query.workspaceId).trim() : "";
      const selectedWorkspaceId =
        rawWorkspaceId && rawWorkspaceId !== "all" && /^\d+$/.test(rawWorkspaceId) ? rawWorkspaceId : "all";
      const startDate = query.startDate ? String(query.startDate).trim() : "";
      const endDate = query.endDate ? String(query.endDate).trim() : "";
      const search = query.search ? String(query.search).trim() : "";

      const where = {};
      if (selectedWorkspaceId !== "all") {
        where.workspaceId = Number(selectedWorkspaceId);
      }

      const arrivalFilter = {};
      if (startDate) {
        const startBounds = getZonedDayBounds(startDate);
        if (startBounds && startBounds.start) {
          arrivalFilter.gte = startBounds.start;
        }
      }
      if (endDate) {
        const endBounds = getZonedDayBounds(endDate);
        if (endBounds && endBounds.end) {
          arrivalFilter.lte = endBounds.end;
        }
      }
      if (Object.keys(arrivalFilter).length > 0) {
        where.arrival = arrivalFilter;
      }

      if (search) {
        where.OR = [
          { user: { name: { contains: search } } },
          { user: { surname: { contains: search } } },
          { user: { email: { contains: search } } },
          { comments: { contains: search } },
          { userproject: { project: { url: { contains: search } } } },
        ];
      }

      const [history, totalCount, workspaceGroups, grandTotalCount] = await Promise.all([
        prisma.history.findMany({
          where,
          orderBy: { arrival: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          include: {
            user: true,
            userproject: { include: { project: true } },
            workspace: true,
          },
        }),
        prisma.history.count({ where }),
        prisma.history.groupBy({
          by: ["workspaceId"],
          _count: { id: true },
        }),
        prisma.history.count(),
      ]);

      const workspaceCountsMap = {};
      for (const row of workspaceGroups || []) {
        if (row.workspaceId !== null && row.workspaceId !== undefined) {
          workspaceCountsMap[row.workspaceId] = (row._count && row._count.id) || 0;
        }
      }

      const locale = res.locals ? res.locals.currentLocale : null;
      history.forEach((entry) => {
        entry.rawArrival = entry.arrival ? formatDateInTimezone(entry.arrival) : "";
        entry.arrival = dateService.formatDateTime(entry.arrival, null, locale);
        entry.departure = dateService.formatTime(entry.departure, locale);
      });

      res.render("admin/view-history", {
        history,
        totalCount,
        grandTotalCount,
        workspaceCountsMap,
        currentPage: page,
        totalPages: Math.max(1, Math.ceil(totalCount / limit)),
        limit,
        filters: {
          workspaceId: selectedWorkspaceId || "all",
          startDate: startDate || "",
          endDate: endDate || "",
          search: search || "",
        },
      });
    } catch (error) {
      console.error("Error fetching history data:", error);
      res.status(500).render("error", { errorMessage: "Unable to retrieve history data." });
    }
  }),
);

module.exports = router;
