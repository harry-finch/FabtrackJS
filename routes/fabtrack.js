// ******************************************************************************
// This router handles the front end routes
// ******************************************************************************

var express = require("express");
var router = express.Router();

const isLoggedIn = require("../middleware/checkSession.js");
router.use(isLoggedIn);

const moment = require("moment");

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ******************************************************************************
// Route handling the main fabtrack page
// ******************************************************************************

router.get("/", async (req, res) => {
  const notification = req.session.notification;
  req.session.notification = "";

  req.session.lastPage = "/fabtrack";

  const allUsers = await prisma.user.findMany({
    relationLoadStrategy: "join",
    include: {
      usertype: true,
      projects: true,
    },
  });

  const userTypes = await prisma.usertype.findMany({});
  const projectTypes = await prisma.projecttype.findMany({});
  const projects = await prisma.project.findMany({});
  const userprojects = await prisma.userproject.findMany({});

  var history = await prisma.history.findMany({
    where: {
      departure: null,
    },
    relationLoadStrategy: "join",
    include: {
      user: true,
    },
  });

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

  // 4. Populate Warnings in History Entries
  history.forEach((entry) => {
    entry.arrival = moment(entry.arrival).calendar();
    entry.warnings = warningsByUser.get(entry.userId) || [];
  });

  res.render("fabtrack/index", {
    notification: notification,
    role: req.session.role,
    users: allUsers,
    usertypes: userTypes,
    projecttypes: projectTypes,
    projects: projects,
    userprojects: userprojects,
    history: history,
  });
});

module.exports = router;
