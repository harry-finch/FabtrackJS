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
    userlist.push({ fullname: user.name + " " + user.surname, id: user.id, projects: JSON.stringify(user.projects) });
  });

  let projectlist = [];
  projects.forEach(function (project) {
    projectlist.push({ id: project.id, url: project.url, type: project.projecttypeId, group: "all" });
  });

  let userprojectlist = [];
  userprojects.forEach(function (userproject) {
    userprojectlist.push({ id: userproject.id, userid: userproject.userId, projectid: userproject.projectId });
  });

  let data = { userlist, projectlist, userprojectlist };

  res.json(data);
});

module.exports = router;
