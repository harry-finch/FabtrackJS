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
const { validateBody } = require("../middleware/validate.js");
const { rfidScanSchema } = require("../schemas/api.schema.js");

// ******************************************************************************
// Route returning a list of all staff members (admin only)
// ******************************************************************************

router.get("/list/all-staff", isAdmin, async (req, res) => {
  const allStaff = await prisma.staff.findMany({});
  res.status(200).json(allStaff);
});

// ******************************************************************************
// Route returning a list of all usertypes (admin only)
// ******************************************************************************

router.get("/list/all-usertypes", isAdmin, async (req, res) => {
  const allTypes = await prisma.usertype.findMany({});
  res.status(200).json(allTypes);
});

// ******************************************************************************
// Route returning a list of all users
// ******************************************************************************

router.get("/list/all-users", isAdmin, async (req, res) => {
  const allUsers = await prisma.user.findMany({});
  res.status(200).json(allUsers);
});

// ******************************************************************************
// Route returning a list of all history entries
// ******************************************************************************

router.get("/list/all-history", isAdmin, async (req, res) => {
  const allHistory = await prisma.history.findMany({});
  res.status(200).json(allHistory);
});

// ******************************************************************************
// Route returning a list of all users in the lab
// ******************************************************************************

router.get("/list/users-inlab", isLoggedIn, async (req, res) => {
  const history = await prisma.history.findMany({
    where: {
      departure: null,
    },
  });

  res.status(200).json(history);
});

// ******************************************************************************
// Route returning a list of all projects
// ******************************************************************************

router.get("/list/all-projects", isAdmin, async (req, res) => {
  const allProjects = await prisma.project.findMany({});
  res.status(200).json(allProjects);
});

// ******************************************************************************
// Route to get users and projects in dictionary format (main fabtrack page)
// ******************************************************************************

router.get("/list/autocomplete-lists", isLoggedIn, async (req, res) => {
  const users = await prisma.user.findMany({
    relationLoadStrategy: "join",
    include: {
      usertype: true,
      projects: true,
    },
  });
  const projects = await prisma.project.findMany({
    where: { active: true },
  });
  const userprojects = await prisma.userProject.findMany();

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
      group: "all",
    });
  });

  let userprojectlist = [];
  userprojects.forEach(function (userproject) {
    userprojectlist.push({ id: userproject.id, userid: userproject.userId, projectid: userproject.projectId });
  });

  let data = { userlist, projectlist, userprojectlist };

  res.json(data);
});

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

module.exports = router;
