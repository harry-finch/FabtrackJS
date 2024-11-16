const express = require("express");
const moment = require("moment");
const { PrismaClient } = require("@prisma/client");
const logger = require("../utilities/simpleLogger.js");
const { v4: uuidv4 } = require("uuid");
const nodemailer = require("nodemailer");

const asyncHandler = require("../middleware/asyncHandler.js");
const isLoggedIn = require("../middleware/checkSession.js");
const isAdmin = require("../middleware/checkAdmin.js");
const clearNotification = require("../middleware/clearNotification.js");
const { isNull } = require("util");

const prisma = new PrismaClient();
const router = express.Router();

router.use(isLoggedIn); // Ensure user is logged in

// Nodemailer config
const transporter = nodemailer.createTransport({
  host: process.env.HOST,
  port: Number(process.env.PORT),
  auth: {
    user: process.env.USR,
    pass: process.env.PASSWD,
  },
});

// Helper Functions
function formatDateTime(date) {
  return moment(date).format("L HH:mm");
}

function removeDuplicates(array) {
  return Array.from(new Set(array.map(JSON.stringify))).map(JSON.parse);
}

// Route: Manage ALL User Accounts (Admin Only)
router.get(
  "/manage",
  isAdmin, // Ensure user has admin role
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/users/manage";

    const users = await prisma.user.findMany({
      orderBy: { id: "desc" },
      include: { usertype: true },
    });

    res.render("admin/manage-users", { users });
  }),
);

// Route: Create a New User
router.post(
  "/create",
  clearNotification,
  asyncHandler(async (req, res) => {
    const { newname, newsurname, newemail, newusertype, newbirthyear, newcomments } = req.body;

    const token = uuidv4();

    try {
      const user = await prisma.user.create({
        data: {
          name: newname,
          surname: newsurname,
          email: newemail,
          usertypeId: Number(newusertype),
          birthYear: Number(newbirthyear),
          comment: newcomments,
          token: token,
        },
      });

      logger.logThat(`User ${user.name} ${user.surname} created by ${req.session.username}`);

      // Send notification email to admin
      const notif = await transporter.sendMail({
        from: process.env.MAILFROM,
        to: process.env.ADMIN,
        subject: "Fablab registration: please agree to our terms and conditions",
        text: `<a href="${process.env.HOSTURL}/agreement/${token}">I agree to the terms and conditions!</a>`,
      });

      // DEBUG: Etherreal link to email
      console.log("Preview URL: %s", nodemailer.getTestMessageUrl(notif));

      req.session.notification = "Warning: User needs to agree to the terms and conditions before accessing the lab.";

      res.redirect("/users/manage");
    } catch (e) {
      console.error("Error creating user:", e);
      req.session.notification =
        e.code === "P2002" ? "Error: User already exists" : "Error: Unable to create user. Please try again.";
      res.redirect("/users/manage");
    }
  }),
);

// Route: Delete a User (Admin Only)
router.get(
  "/delete/:id",
  isAdmin,
  clearNotification,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await prisma.user.delete({
      where: { id: Number(id) },
    });

    logger.logThat(`User ${user.name} ${user.surname} deleted by ${req.session.username}`);

    req.session.notification = `Success: User ${user.name} ${user.surname} has been deleted.`;
    res.redirect(req.session.lastPage);
  }),
);

// Route: Edit User Page
router.get(
  "/edit/:id",
  clearNotification,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    req.session.lastPage = `/users/edit/${id}`;

    const user = await prisma.user.findUnique({
      where: { id: Number(id) },
      include: { projects: true, usertype: true },
    });

    const history = await prisma.history.findMany({
      where: { userId: Number(id) },
      include: { workspace: true, userproject: { include: { project: true } } },
      orderBy: { arrival: "desc" },
    });

    const warnings = await prisma.warning.findMany({
      where: { userId: Number(id) },
      include: { warningtype: true },
    });

    // Format dates
    user.createdAt = formatDateTime(user.createdAt);
    history.forEach((entry) => {
      entry.arrival = formatDateTime(entry.arrival);
      entry.departure = entry.departure ? formatDateTime(entry.departure) : "-";
    });
    warnings.forEach((warning) => {
      warning.createdAt = formatDateTime(warning.createdAt);
    });

    // Remove duplicate projects from history
    if (history.userproject ?? null) {
      const userprojects = removeDuplicates(history.map((entry) => entry.userproject.project));
    } else {
      userprojects = {};
    }

    res.render("fabtrack/edit-user", {
      user,
      history,
      warnings,
      userprojects,
    });
  }),
);

// Route: Update User Profile
router.post(
  "/update/:id",
  clearNotification,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, surname, email, usertype, birthyear, comments } = req.body;

    await prisma.user.update({
      where: { id: Number(id) },
      data: {
        name,
        surname,
        email,
        usertypeId: Number(usertype),
        birthYear: Number(birthyear),
        comment: comments,
      },
    });

    logger.logThat(`User ${name} ${surname} updated by ${req.session.username}`);

    req.session.notification = "Success: User profile updated!";
    res.redirect(req.session.lastPage);
  }),
);

router.get(
  "/resend/:id",
  clearNotification,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: Number(id) },
    });

    // Send notification email to admin
    const notif = await transporter.sendMail({
      from: process.env.MAILFROM,
      to: process.env.ADMIN,
      subject: "Fablab registration: please agree to our terms and conditions",
      html: `<a href="${process.env.HOSTURL}/agreement/${user.token}">I agree to the terms and conditions!</a>`,
    });

    // DEBUG: Etherreal link to email
    console.log("Preview URL: %s", nodemailer.getTestMessageUrl(notif));
    console.log("Last page is: %s", req.session.lastPage);

    req.session.notification = `Success: User ${user.name} ${user.surname} has been notified.`;
    res.redirect(req.session.lastPage);
  }),
);

module.exports = router;
