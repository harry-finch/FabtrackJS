// ******************************************************************************
// This router handles the administration of staff accounts
// ******************************************************************************

var express = require("express");
var router = express.Router();

const isAdmin = require("../middleware/checkAdmin.js");
router.use(isAdmin);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const logger = require("../utilities/simpleLogger.js");

// ******************************************************************************
// Route handling the admin page managing staff accounts (admin only)
//
// >>> Rendering route
// ******************************************************************************

router.get("/manage", async (req, res) => {
  const notification = req.session.notification;
  req.session.notification = "";
  req.session.lastPage = "/admin/staff/manage";

  const allStaff = await prisma.staff.findMany({
    orderBy: {
      id: "desc",
    },
  });
  res.render("admin/manage-staff", {
    notification: notification,
    role: req.session.role,
    users: allStaff,
  });
});

// ******************************************************************************
// Route handling the admin page to edit a staff account (admin only)
//
// >>> Rendering route
// ******************************************************************************

router.get("/edit/:id", async (req, res) => {
  const notification = req.session.notification;
  req.session.notification = "";

  const { id } = req.params;
  const user = await prisma.staff.findUnique({
    where: {
      id: Number(id),
    },
  });

  res.render("admin/edit-staff", {
    notification: notification,
    role: req.session.role,
    user: user,
  });
});

// ******************************************************************************
// Route handling the enabling of a staff account (admin only)
// ******************************************************************************

router.get("/enable/:id", async (req, res) => {
  const { id } = req.params;
  const result = await prisma.staff.update({
    where: {
      id: Number(id),
    },
    data: {
      approved: true,
    },
  });

  logger.logThat("User " + result.name + " enabled by " + req.session.username);
  req.session.notification = "Success: User is now enabled";
  res.redirect(req.session.lastPage);
});

// ******************************************************************************
// Route handling the disabling of a staff account (admin only)
// ******************************************************************************

router.get("/disable/:id", async (req, res) => {
  const { id } = req.params;
  const result = await prisma.staff.update({
    where: {
      id: Number(id),
    },
    data: {
      approved: false,
    },
  });

  logger.logThat(
    "User " + result.name + " disabled by " + req.session.username,
  );
  req.session.notification = "Success: User is now disabled";
  res.redirect(req.session.lastPage);
});

// ******************************************************************************
// Route making a staff admin (admin only)
// ******************************************************************************

router.get("/promote/:id", async (req, res) => {
  const { id } = req.params;
  const result = await prisma.staff.update({
    where: {
      id: Number(id),
    },
    data: {
      role: "admin",
    },
  });

  logger.logThat(
    "User " + result.name + " made admin by " + req.session.username,
  );
  req.session.notification = "Success: User is now admin";
  res.redirect(req.session.lastPage);
});

// ******************************************************************************
// Route making a staff a regular user (admin only)
// ******************************************************************************

router.get("/demote/:id", async (req, res) => {
  const { id } = req.params;
  const result = await prisma.staff.update({
    where: {
      id: Number(id),
    },
    data: {
      role: "user",
    },
  });

  logger.logThat(
    "User " + result.name + " made simple user by " + req.session.username,
  );
  req.session.notification = "Success: User is now just a user again";
  res.redirect(req.session.lastPage);
});

// ******************************************************************************
// Route handling the deletion of a staff (admin only)
// ******************************************************************************

router.get("/delete/:id", async (req, res) => {
  const { id } = req.params;
  const result = await prisma.staff.delete({
    where: { id: Number(id) },
  });

  logger.logThat(
    "User " + result.name + " has been deleted by " + req.session.username,
  );
  req.session.notification = "Success: User has been deleted";
  res.redirect(req.session.lastPage);
});

// ******************************************************************************
// Route handling the modification of a staff (admin only)
// ******************************************************************************

router.post("/update", async (req, res) => {
  const user = req.body;
  let approval = false;

  var prevPage = req;
  console.log(prevPage);

  if (user.approved == "on") {
    approval = true;
  }

  const result = await prisma.staff.update({
    where: { id: Number(user.id) },
    data: {
      name: user.username,
      email: user.email,
      role: user.role,
      approved: approval,
    },
  });

  logger.logThat(
    "User " + result.name + " has been updated by " + req.session.username,
  );
  req.session.notification = "Success: User has been updated";
  res.redirect("/admin/staff/manage");
});

module.exports = router;
