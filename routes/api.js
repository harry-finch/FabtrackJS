// ******************************************************************************
// This router handles the API for Fabtrack's database
// ******************************************************************************

var express = require("express");
var router = express.Router();

const isAdmin = require("../middleware/checkAdmin.js");
router.use(isAdmin);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const logger = require("../utilities/simpleLogger.js");

// ******************************************************************************
// Route returning a list of all staff members (admin only)
// ******************************************************************************

router.get("/list/all-staff", async (req, res) => {
  const allStaff = await prisma.staff.findMany({});
  res.status(200).json(allStaff);
});

// ******************************************************************************
// Route returning a list of all usertypes (admin only)
// ******************************************************************************

router.get("/list/all-usertypes", async (req, res) => {
  const allTypes = await prisma.usertype.findMany({});
  res.status(200).json(allTypes);
});

// ******************************************************************************
// Route returning a list of all users
// ******************************************************************************

router.get("/list/all-users", async (req, res) => {
  if (req.session.role != "admin") {
    req.session.notification = "Error: Unauthorized access!";
    return res.redirect("/");
  }

  const allUsers = await prisma.user.findMany({});
  res.status(200).json(allUsers);
});

// ******************************************************************************
// Route returning a list of all history entries
// ******************************************************************************

router.get("/list/all-history", async (req, res) => {
  if (req.session.role != "admin") {
    req.session.notification = "Error: Unauthorized access!";
    return res.redirect("/");
  }

  const allHistory = await prisma.history.findMany({});
  res.status(200).json(allHistory);
});

// ******************************************************************************
// Route returning a list of all projects
// ******************************************************************************

router.get("/list/all-projects", async (req, res) => {
  if (req.session.role != "admin") {
    req.session.notification = "Error: Unauthorized access!";
    return res.redirect("/");
  }

  const allProjects = await prisma.project.findMany({});
  res.status(200).json(allProjects);
});

module.exports = router;
