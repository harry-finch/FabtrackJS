var express = require("express");
var router = express.Router();
const moment = require("moment");
const dotenv = require("dotenv");
dotenv.config();

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const isLoggedIn = require("../middleware/checkSession.js");
const clearNotification = require("../middleware/clearNotification.js");
const asyncHandler = require("../middleware/asyncHandler.js");

const hookManager = require("../core/HookManager");

router.use(isLoggedIn);

// ******************************************************************************
// Route to the main page
// ******************************************************************************

router.get(
  "/",
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/fabtrack";

    const consumables = await prisma.consumable.findMany({
      include: {
        category: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    var history = await prisma.history.findMany({
      where: {
        departure: null,
        workspaceId: req.session.selectedWorkspace ? req.session.selectedWorkspace.id : null,
      },
      relationLoadStrategy: "join",
      include: {
        user: true,
        workshop: true,
      },
    });

    // Find all warnings associated with the users in the lab
    // 1. Extract User IDs
    const userIdsInLab = history.map((entry) => entry.userId);

    // 2. Fetch Warnings for Users in Lab (Optimized)
    const warnings = await prisma.warning.findMany({
      where: {
        userId: { in: userIdsInLab },
        active: true, // Filter for active warnings only
      },
      include: { warningtype: true },
    });

    // 3. Create a Map for Efficient Lookup
    const warningsByUser = new Map();
    warnings.forEach((warning) => {
      if (!warningsByUser.has(warning.userId)) {
        warningsByUser.set(warning.userId, []);
      }
      warningsByUser.get(warning.userId).push(warning);
    });

    // 4. Fetch Active Equipment Loans for Users in Lab
    const activeEquipmentActivities = await prisma.activity.findMany({
      where: {
        userId: { in: userIdsInLab },
        resourceType: "EQUIPMENT",
        returnedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    const equipmentIds = [...new Set(activeEquipmentActivities.map((a) => a.resourceId))];
    const equipmentItems = equipmentIds.length > 0
      ? await prisma.equipment.findMany({ where: { id: { in: equipmentIds } }, include: { workspace: true } })
      : [];
    const equipmentMap = new Map(equipmentItems.map((eq) => [eq.id, eq]));

    const now = new Date();
    const activeLoansByUser = new Map();
    activeEquipmentActivities.forEach((act) => {
      if (!activeLoansByUser.has(act.userId)) {
        activeLoansByUser.set(act.userId, []);
      }
      const eq = equipmentMap.get(act.resourceId);
      const isOverdue = act.expectedReturnAt ? new Date(act.expectedReturnAt) < now : false;
      activeLoansByUser.get(act.userId).push({
        id: act.id,
        equipmentId: act.resourceId,
        equipmentName: eq ? eq.name : `#${act.resourceId}`,
        workspaceName: eq && eq.workspace ? eq.workspace.name : null,
        borrowedAt: act.createdAt,
        expectedReturnAt: act.expectedReturnAt,
        borrowDurationDays: act.borrowDurationDays,
        isOverdue,
      });
    });

    var oldRecords = false;

    // 5. Populate Warnings and Active Loans in History Entries and handle the arrival time
    for (const entry of history) {
      const parsedDate = moment(entry.arrival);
      const today = moment();

      entry.arrival = moment(entry.arrival).format("HH:mm");
      entry.warnings = warningsByUser.get(entry.userId) || [];
      entry.activeLoans = activeLoansByUser.get(entry.userId) || [];
      entry.hasOverdueLoans = entry.activeLoans.some((l) => l.isOverdue);

      // If the user has been in the lab but not logged out on a previous day
      if (parsedDate.isBefore(today, "day")) {
        parsedDate.set({ hour: 18, minute: 30 });
        const isoString = parsedDate.toISOString();

        try {
          // Update the departure time in the database
          await prisma.history.update({
            where: {
              id: entry.id,
            },
            data: {
              departure: isoString,
            },
          });
        } catch (error) {
          console.error("Error updating history entry:", error);
        }

        // 5. If there are old records, then all records are old
        oldRecords = true;
      }
    }

    // 6. Empty complete object
    if (oldRecords) history = [];

    // Hook for plugins to provide teaching units
    let teachingUnits = [];
    const isPluginUeEnabled = hookManager.isPluginEnabled("ue");
    if (isPluginUeEnabled) {
      const ueResults = await hookManager.triggerAsyncHook("fabtrack:teachingUnits");
      teachingUnits = ueResults.flat().filter(Boolean);
    }

    const availableWorkshops = await prisma.workshop.findMany({
      where: { active: true },
      include: { access: true },
      orderBy: { name: "asc" },
    });

    res.render("fabtrack/index", {
      history,
      consumables,
      teachingUnits,
      isPluginUeEnabled,
      availableWorkshops,
    });
  }),
);

// ******************************************************************************
// Route to switch workspace (if used)
// ******************************************************************************

router.post(
  "/switchworkspace",
  asyncHandler(async (req, res) => {
    const newWorkspaceId = Number(req.body.workspaceId);

    if (!req.session.availableWorkspaces) {
      req.session.availableWorkspaces = await prisma.workspace.findMany();
    }

    const selected = req.session.availableWorkspaces.find((w) => w.id === newWorkspaceId);
    if (selected) {
      req.session.selectedWorkspace = selected;
      req.session.lastWorkspaceId = selected.id;
      res.cookie("fabtrack_last_workspace_id", selected.id, {
        maxAge: 365 * 24 * 60 * 60 * 1000,
        sameSite: "lax",
      });

      if (req.session.username) {
        try {
          await prisma.staff.update({
            where: { name: req.session.username },
            data: { lastWorkspaceId: selected.id },
          });
        } catch (e) {
          console.error("Could not save lastWorkspaceId for staff:", e);
        }
      }

      req.session.notification = "Success: Workspace switched to " + selected.name;
      res.sendStatus(200);
    } else {
      res.status(404).send("Workspace not found");
    }
  }),
);

module.exports = router;
