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

  history.forEach(async (entry) => {
    entry.arrival = moment(entry.arrival).calendar();
    entry.warnings = await prisma.warning.findMany({
      where: { userId: entry.userId },
      include: { warningtype: true },
    });
  });

  console.log(history);

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
