var express = require("express");
var router = express.Router();

const asyncHandler = require("../../middleware/asyncHandler.js");
const clearNotification = require("../../middleware/clearNotification.js");
const isAdmin = require("../../middleware/checkAdmin.js");
router.use(isAdmin);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const logger = require("../../utilities/simpleLogger.js");

// ******************************************************************************
// Route to manage staff accounts (Admin Only)
// ******************************************************************************

router.get(
  "/manage",
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/staff/manage";

    const staff = await prisma.staff.findMany({
      orderBy: {
        id: "desc",
      },
    });

    res.render("admin/manage-staff", {
      users: staff,
    });
  }),
);

// ******************************************************************************
// Route to edit a staff account (Admin Only)
// ******************************************************************************

router.get(
  "/edit/:id",
  clearNotification,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await prisma.staff.findUnique({
      where: {
        id: Number(id),
      },
    });

    res.render("admin/edit-staff", {
      user,
    });
  }),
);

// ******************************************************************************
// Route to enable a staff account (Admin Only)
// ******************************************************************************

router.get(
  "/enable/:id",
  asyncHandler(async (req, res) => {
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
  }),
);

// ******************************************************************************
// Route to disable a staff account (Admin Only)
// ******************************************************************************

router.get(
  "/disable/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await prisma.staff.update({
      where: {
        id: Number(id),
      },
      data: {
        approved: false,
      },
    });

    logger.logThat("User " + result.name + " disabled by " + req.session.username);
    req.session.notification = "Success: User is now disabled";
    res.redirect(req.session.lastPage);
  }),
);

// ******************************************************************************
// Route making a staff admin (Admin Only)
// ******************************************************************************

router.get(
  "/promote/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await prisma.staff.update({
      where: {
        id: Number(id),
      },
      data: {
        role: "admin",
      },
    });

    logger.logThat("User " + result.name + " made admin by " + req.session.username);
    req.session.notification = "Success: User is now admin";
    res.redirect(req.session.lastPage);
  }),
);

// ******************************************************************************
// Route making a staff a regular user (Admin Only)
// ******************************************************************************

router.get(
  "/demote/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await prisma.staff.update({
      where: {
        id: Number(id),
      },
      data: {
        role: "user",
      },
    });

    logger.logThat("User " + result.name + " made simple user by " + req.session.username);
    req.session.notification = "Success: User is now just a user again";
    res.redirect(req.session.lastPage);
  }),
);

// ******************************************************************************
// Route to delete a staff (Admin Only)
// ******************************************************************************

router.get(
  "/delete/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await prisma.staff.delete({
      where: { id: Number(id) },
    });

    logger.logThat("User " + result.name + " has been deleted by " + req.session.username);
    req.session.notification = "Success: User has been deleted";
    res.redirect(req.session.lastPage);
  }),
);

// ******************************************************************************
// Route to update a staff account (Admin Only)
// ******************************************************************************

router.post(
  "/update",
  asyncHandler(async (req, res) => {
    const user = req.body;
    let approval = false;

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

    logger.logThat("User " + result.name + " has been updated by " + req.session.username);
    req.session.notification = "Success: User has been updated";
    res.redirect("/admin/staff/manage");
  }),
);

module.exports = router;
