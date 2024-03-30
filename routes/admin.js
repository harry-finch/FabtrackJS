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
  res.render("admin", { error: req.session.error, message: req.session.message });
});

// ******************************************************************************
// Route handling the admin page managing staff accounts
// ******************************************************************************

router.get("/manage-staff", async (req, res) => {
  const allStaff = await prisma.staff.findMany({});
  res.render("admin-staff", { error: req.session.error, message: req.session.message, users: allStaff });
});

module.exports = router;
