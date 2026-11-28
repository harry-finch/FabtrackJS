var express = require("express");
var router = express.Router();
const dotenv = require("dotenv");
dotenv.config();

const { prisma } = require("../utilities/db");

const isLoggedIn = require("../middleware/checkSession.js");
const requireRoles = require("../middleware/requireRoles.js");
const clearNotification = require("../middleware/clearNotification.js");
const asyncHandler = require("../middleware/asyncHandler.js");
const { validateBody } = require("../middleware/validate.js");
const { switchWorkspaceSchema } = require("../schemas/admin.schema.js");
const referenceCacheService = require("../services/referenceCacheService.js");
const kioskService = require("../services/kioskService.js");

const hookManager = require("../core/HookManager");

router.use(isLoggedIn);

// ******************************************************************************
// Route to the main kiosk page
// ******************************************************************************

router.get(
  "/",
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/fabtrack";

    const isBorneRole = req.session && req.session.role === "staff";
    const workspaceId = req.session.selectedWorkspace ? req.session.selectedWorkspace.id : null;

    const [consumables, history, availableWorkshops, machines] = await Promise.all([
      isBorneRole
        ? Promise.resolve([])
        : prisma.consumable.findMany({
            include: { category: true },
            orderBy: { name: "asc" },
          }),
      isBorneRole ? Promise.resolve([]) : kioskService.getPresentHistory(workspaceId),
      prisma.workshop.findMany({
        where: { active: true },
        include: { access: true },
        orderBy: { name: "asc" },
      }),
      !isBorneRole && prisma.machine && typeof prisma.machine.findMany === "function"
        ? prisma.machine.findMany({ orderBy: { name: "asc" } })
        : Promise.resolve([]),
    ]);

    // Hook for plugins to provide teaching units
    let teachingUnits = [];
    const isPluginUeEnabled = hookManager.isPluginEnabled("ue");
    if (isPluginUeEnabled) {
      const ueResults = await hookManager.triggerAsyncHook("fabtrack:teachingUnits");
      teachingUnits = ueResults.flat().filter(Boolean);
    }

    res.render("fabtrack/index", {
      history,
      consumables,
      machines,
      teachingUnits,
      isPluginUeEnabled,
      availableWorkshops,
    });
  }),
);

// ******************************************************************************
// Lightweight HTML fragment endpoint for partial kiosk table refresh (R-032)
// Restricted to admin/user — borne accounts (role === "staff") cannot list present users (R-036)
// ******************************************************************************

router.get(
  "/present-table",
  requireRoles("admin", "user"),
  asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const workspaceId = req.session.selectedWorkspace ? req.session.selectedWorkspace.id : null;
    const history = await kioskService.getPresentHistory(workspaceId);
    res.render("fabtrack/partials/present-table", { history });
  }),
);

// ******************************************************************************
// Route to switch workspace (if used)
// ******************************************************************************

router.post(
  "/switchworkspace",
  validateBody(switchWorkspaceSchema, { isApi: true }),
  asyncHandler(async (req, res) => {
    const newWorkspaceId = Number(req.body.workspaceId);
    const availableWorkspaces = await referenceCacheService.getWorkspaces();
    const selected = availableWorkspaces.find((w) => w.id === newWorkspaceId);
    if (selected) {
      req.session.selectedWorkspace = { id: selected.id, name: selected.name };
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

      req.session.notification = "Success: Espace basculé vers " + selected.name;
      res.sendStatus(200);
    } else {
      res.status(404).send("Workspace not found");
    }
  }),
);

module.exports = router;
