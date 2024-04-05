// ******************************************************************************
// This router handles the main admin routes
// ******************************************************************************

var express = require("express");
var router = express.Router();

// Script with HTML rendering functions
var render = require("../utilities/render");

const isAdmin = require("../middleware/checkAdmin.js");
router.use(isAdmin);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ******************************************************************************
// Route handling the main admin page
// ******************************************************************************

router.get("/", async (req, res) => {
  res.render("admin/admin", { error: req.session.error, message: req.session.message });
});

// ******************************************************************************
// Route handling the admin page managing staff accounts
// ******************************************************************************

router.get("/manage-staff", async (req, res) => {
  const allStaff = await prisma.staff.findMany({});
  res.render("admin/admin-staff", { error: req.session.error, message: req.session.message, users: allStaff });
});

// ******************************************************************************
// Route handling the admin page managing user accounts
// ******************************************************************************

router.get("/manage-users", async (req, res) => {
  const allUsers = await prisma.staff.findMany({});
  res.render("admin/admin-users", { error: req.session.error, message: req.session.message, users: allUsers });
});

module.exports = router;
