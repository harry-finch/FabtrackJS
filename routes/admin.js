// ******************************************************************************
// This router handles the main admin routes
// ******************************************************************************

var express = require("express");
var router = express.Router();

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

// ******************************************************************************
// Route handling the admin page managing user accounts
// ******************************************************************************

router.get("/manage-usertypes", async (req, res) => {
  const allTypes = await prisma.usertype.findMany({});
  res.render("admin/admin-usertypes", { error: req.session.error, message: req.session.message, usertypes: allTypes });
});

// ******************************************************************************
// Route handling the deletion of a usertype
// ******************************************************************************

router.delete("/usertype/delete/:id", async (req, res) => {
  const { id } = req.params;
  const result = await prisma.usertype.delete({
    where: { id: Number(id) },
  });
  res.status(200).json(result);
});

// ******************************************************************************
// Route handling the creation of a usertype
// ******************************************************************************

router.post("/usertype/create", async (req, res) => {
  const { name } = req.body;
  const usertype = await prisma.usertype.create({
    data: { name: name },
  });
  res.redirect("/admin/manage-usertypes");
});

module.exports = router;
