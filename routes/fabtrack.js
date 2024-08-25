// ******************************************************************************
// This router handles the front end routes
// ******************************************************************************

var express = require("express");
var router = express.Router();

const isLoggedIn = require("../middleware/checkSession.js");
router.use(isLoggedIn);

const moment = require("moment");

const dotenv = require("dotenv");
dotenv.config();

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
  const projects = await prisma.project.findMany({
    where: { active: true },
  });
  const userprojects = await prisma.userproject.findMany({});

  var history = await prisma.history.findMany({
    where: {
      departure: null,
      workspaceId: req.session.selectedWorkspace
        ? req.session.selectedWorkspace.id
        : null,
    },
    relationLoadStrategy: "join",
    include: {
      user: true,
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

  var oldRecords = false;

  // 4. Populate Warnings in History Entries and handle the arrival time
  for (const entry of history) {
    const parsedDate = moment(entry.arrival);
    const today = moment();

    entry.arrival = moment(entry.arrival).calendar();
    entry.warnings = warningsByUser.get(entry.userId) || [];

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

router.post("/switchworkspace", (req, res) => {
  const newWorkspaceId = Number(req.body.workspaceId);

  req.session.selectedWorkspace = res.locals.availableWorkspaces.find(
    (workspace) => workspace.id === newWorkspaceId,
  );

  req.session.notification =
    "Success: Workspace switched to " + req.session.selectedWorkspace.name;

  res.sendStatus(200); // Send a success status
});

module.exports = router;
