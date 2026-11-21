// ******************************************************************************
// This router handles the API for Fabtrack's database
// ******************************************************************************

var express = require("express");
var router = express.Router();

const isLoggedIn = require("../middleware/checkSession.js");
const isAdmin = require("../middleware/checkAdmin.js");

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const logger = require("../utilities/simpleLogger.js");
const hookManager = require("../core/HookManager.js");
const asyncHandler = require("../middleware/asyncHandler.js");
const { validateBody, validateQuery } = require("../middleware/validate.js");
const { rfidScanSchema } = require("../schemas/api.schema.js");

// ******************************************************************************
// Route returning a list of all staff members (admin only)
// ******************************************************************************

router.get(
  "/list/all-staff",
  isAdmin,
  asyncHandler(async (req, res) => {
    const allStaff = await prisma.staff.findMany({});
    res.status(200).json(allStaff);
  }),
);

// ******************************************************************************
// Route returning a list of all usertypes (admin only)
// ******************************************************************************

router.get(
  "/list/all-usertypes",
  isAdmin,
  asyncHandler(async (req, res) => {
    const allTypes = await prisma.usertype.findMany({});
    res.status(200).json(allTypes);
  }),
);

// ******************************************************************************
// Route returning a list of all users
// ******************************************************************************

router.get(
  "/list/all-users",
  isAdmin,
  asyncHandler(async (req, res) => {
    const allUsers = await prisma.user.findMany({});
    res.status(200).json(allUsers);
  }),
);

// ******************************************************************************
// Route returning a list of all history entries
// ******************************************************************************

router.get(
  "/list/all-history",
  isAdmin,
  asyncHandler(async (req, res) => {
    const allHistory = await prisma.history.findMany({});
    res.status(200).json(allHistory);
  }),
);

// ******************************************************************************
// Route returning a list of all users in the lab
// ******************************************************************************

router.get(
  "/list/users-inlab",
  isLoggedIn,
  asyncHandler(async (req, res) => {
    const history = await prisma.history.findMany({
      where: {
        departure: null,
      },
    });

    res.status(200).json(history);
  }),
);

// ******************************************************************************
// Route returning a list of all projects
// ******************************************************************************

router.get(
  "/list/all-projects",
  isAdmin,
  asyncHandler(async (req, res) => {
    const allProjects = await prisma.project.findMany({});
    res.status(200).json(allProjects);
  }),
);

// ******************************************************************************
// Route to get users and projects in dictionary format (main fabtrack page)
// ******************************************************************************

router.get(
  "/list/autocomplete-lists",
  isLoggedIn,
  asyncHandler(async (req, res) => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        surname: true,
        termsAccepted: true,
        projects: {
          select: {
            id: true,
            userId: true,
            projectId: true,
          },
        },
      },
    });
  const projects = await prisma.project.findMany({
    where: { active: true },
    select: {
      id: true,
      url: true,
      projecttypeId: true,
      teachingUnitId: true,
      unregisteredUeName: true,
      unregisteredUeContact: true,
      sorbonneEntity: true,
    },
  });
  const userprojects = await prisma.userProject.findMany({
    select: {
      id: true,
      userId: true,
      projectId: true,
    },
  });

  const sorbonneService = require("../services/sorbonneService.js");
  const sorbonneEntities = await sorbonneService.getDistinctEntities();

  let userlist = [];
  users.forEach(function (user) {
    userlist.push({
      fullname: user.name + " " + user.surname,
      id: user.id,
      termsAccepted: !!user.termsAccepted,
      projects: JSON.stringify(user.projects),
    });
  });

  let projectlist = [];
  projects.forEach(function (project) {
    projectlist.push({
      id: project.id,
      url: project.url,
      type: project.projecttypeId,
      teachingUnitId: project.teachingUnitId,
      unregisteredUeName: project.unregisteredUeName,
      unregisteredUeContact: project.unregisteredUeContact,
      sorbonneEntity: project.sorbonneEntity,
      group: "all",
    });
  });

  let userprojectlist = [];
  userprojects.forEach(function (userproject) {
    userprojectlist.push({ id: userproject.id, userid: userproject.userId, projectid: userproject.projectId });
  });

  let data = { userlist, projectlist, userprojectlist, sorbonneEntities };

  res.json(data);
  }),
);

// ******************************************************************************
// Endpoint to fetch Sorbonne Entities / UFR for autocomplete
// ******************************************************************************

router.get(
  "/sorbonne/entities",
  isLoggedIn,
  asyncHandler(async (req, res) => {
    const sorbonneService = require("../services/sorbonneService.js");
    const entities = await sorbonneService.getDistinctEntities();
    res.json(entities);
  }),
);

// ******************************************************************************
// RFID Plugin Endpoints
// ******************************************************************************

router.post(
  "/rfid/scan",
  isLoggedIn,
  validateBody(rfidScanSchema, { isApi: true }),
  asyncHandler(async (req, res) => {
    if (!hookManager.isPluginEnabled("rfid")) {
      return res.status(403).json({ success: false, error: "Le plugin RFID n'est pas activé." });
    }

    const { rfid } = req.body;
    const workspaceId =
      req.body.workspaceId || (req.session.selectedWorkspace ? req.session.selectedWorkspace.id : null);
    const staffUsername = req.session.username;

    const results = await hookManager.triggerAsyncHook("rfid:scan", {
      rfid,
      workspaceId,
      staffUsername,
    });

    if (results && results.length > 0) {
      const result = results[0];
      const statusCode = result.success ? 200 : result.code === "USER_NOT_FOUND" ? 404 : 400;
      return res.status(statusCode).json(result);
    }

    return res.status(500).json({ success: false, error: "Erreur lors du traitement du scan RFID." });
  }),
);

router.get(
  "/rfid/check-availability",
  isLoggedIn,
  asyncHandler(async (req, res) => {
    const { rfid, excludeUserId } = req.query;
    const results = await hookManager.triggerAsyncHook("rfid:checkAvailability", {
      rfid,
      excludeUserId,
    });

    if (results && results.length > 0) {
      return res.json(results[0]);
    }
    return res.json({ available: true });
  }),
);

// ******************************************************************************
// BookStack Wiki Plugin Endpoints
// ******************************************************************************
const bookstackService = require("../services/bookstackService.js");

router.get(
  "/bookstack/check-doc",
  isLoggedIn,
  asyncHandler(async (req, res) => {
    if (!hookManager.isPluginEnabled("bookstack")) {
      return res.json({ enabled: false, message: "Plugin BookStack désactivé" });
    }

    const { projectId, userId } = req.query;
    const result = await bookstackService.checkProjectDocStatus(projectId, userId);
    return res.json(result);
  }),
);

// ******************************************************************************
// Machine Access Verification & Usage Tracking Endpoints
// (Used by computer lock screen applications & 3D printers)
// ******************************************************************************
const machineUsageService = require("../services/machineUsageService.js");
const checkApiKeyOrSession = require("../middleware/checkApiKeyOrSession.js");
const {
  verifyCardUserSchema,
  verifyCardQuerySchema,
  startMachineUsageSchema,
  endMachineUsageSchema,
  recordMachineUsageSchema,
  machineUsageQuerySchema,
} = require("../schemas/machineUsage.schema.js");

function resolveMachineApiStatusCode(code) {
  switch (code) {
    case "USER_NOT_FOUND":
    case "MACHINE_NOT_FOUND":
    case "SESSION_NOT_FOUND":
    case "ACTIVITY_NOT_FOUND":
      return 404;
    case "NOT_CHECKED_IN":
    case "TERMS_NOT_ACCEPTED":
    case "ACTIVE_WARNING":
    case "MACHINE_ACCESS_DENIED":
    case "INVALID_HISTORY":
    case "UNAUTHORIZED_SESSION":
      return 403;
    default:
      return 400;
  }
}

/**
 * Verify if an NFC badge corresponds to a user currently checked-in today at the lab
 * Supports both POST and GET for simple client app integration
 */
router.post(
  "/machines/verify-user",
  checkApiKeyOrSession,
  validateBody(verifyCardUserSchema, { isApi: true }),
  asyncHandler(async (req, res) => {
    const { rfid, machineId } = req.validatedBody || req.body;
    const result = await machineUsageService.verifyUserPresenceByCard({ rfid, machineId });

    if (!result.success) {
      return res.status(resolveMachineApiStatusCode(result.code)).json(result);
    }

    return res.status(200).json(result);
  }),
);

router.get(
  "/machines/verify-user",
  checkApiKeyOrSession,
  validateQuery(verifyCardQuerySchema, { isApi: true }),
  asyncHandler(async (req, res) => {
    const query = req.validatedQuery || req.query;
    const rfid = query.rfid || query.cardId;
    const machineId = query.machineId;

    const result = await machineUsageService.verifyUserPresenceByCard({ rfid, machineId });

    if (!result.success) {
      return res.status(resolveMachineApiStatusCode(result.code)).json(result);
    }

    return res.status(200).json(result);
  }),
);

/**
 * Start using a machine (record start time)
 */
router.post(
  "/machines/usage/start",
  checkApiKeyOrSession,
  validateBody(startMachineUsageSchema, { isApi: true }),
  asyncHandler(async (req, res) => {
    const payload = req.validatedBody || req.body;
    const result = await machineUsageService.startMachineUsage(payload);

    if (!result.success) {
      return res.status(resolveMachineApiStatusCode(result.code)).json(result);
    }

    return res.status(201).json(result);
  }),
);

/**
 * End machine usage (record end time + optional 3D printing telemetry)
 */
router.post(
  "/machines/usage/end",
  checkApiKeyOrSession,
  validateBody(endMachineUsageSchema, { isApi: true }),
  asyncHandler(async (req, res) => {
    const payload = req.validatedBody || req.body;
    const result = await machineUsageService.endMachineUsage(payload);

    if (!result.success) {
      return res.status(resolveMachineApiStatusCode(result.code)).json(result);
    }

    return res.status(200).json(result);
  }),
);

/**
 * Record a complete machine usage in a single call (start, end, and 3D printing details)
 */
router.post(
  "/machines/usage/record",
  checkApiKeyOrSession,
  validateBody(recordMachineUsageSchema, { isApi: true }),
  asyncHandler(async (req, res) => {
    const payload = req.validatedBody || req.body;
    const result = await machineUsageService.recordMachineUsage(payload);

    if (!result.success) {
      return res.status(resolveMachineApiStatusCode(result.code)).json(result);
    }

    return res.status(201).json(result);
  }),
);

/**
 * Query usage history for a machine (PII minimized: no email/rfid/token/balance)
 */
router.get(
  "/machines/usage",
  checkApiKeyOrSession,
  validateQuery(machineUsageQuerySchema, { isApi: true }),
  asyncHandler(async (req, res) => {
    const { machineId, limit } = req.validatedQuery || req.query;
    const history = await machineUsageService.getMachineUsageHistory(machineId, limit || 50);

    return res.status(200).json({ success: true, machineId, count: history.length, history });
  }),
);

module.exports = router;
