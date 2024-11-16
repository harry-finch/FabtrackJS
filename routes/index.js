const express = require("express");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const nodemailer = require("nodemailer");
const { PrismaClient } = require("@prisma/client");
const dotenv = require("dotenv");

const isAuthenticated = require("../middleware/checkSession.js");
const clearNotification = require("../middleware/clearNotification.js");
const asyncHandler = require("../middleware/asyncHandler.js");

dotenv.config();

const prisma = new PrismaClient();
const router = express.Router();

// Nodemailer config
const transporter = nodemailer.createTransport({
  host: process.env.HOST,
  port: Number(process.env.PORT),
  auth: {
    user: process.env.USR,
    pass: process.env.PASSWD,
  },
});

const saltRounds = 10;

// Root route with authentication check
router.get("/", isAuthenticated, (req, res) => {
  req.session.role === "admin"
    ? res.redirect("/admin/")
    : res.redirect("/fabtrack/");
});

// Login and registration routes
router.get("/login", clearNotification, (req, res) =>
  res.render("index/login"),
);
router.get("/register", clearNotification, (req, res) =>
  res.render("index/register"),
);

// Account creation route
router.post(
  "/create-account",
  asyncHandler(async (req, res) => {
    const { username, password, mail } = req.body;

    // Hash the password with bcrypt
    const hash = await bcrypt.hash(password, saltRounds);

    try {
      await prisma.staff.create({
        data: {
          name: username,
          pwd: hash,
          email: mail,
        },
      });

      // Notify user about admin approval requirement
      req.session.notification =
        "Warning: Your account needs to be approved by an administrator before you can log in.";

      // Send notification email to admin
      const notif = await transporter.sendMail({
        from: process.env.MAILFROM,
        to: process.env.ADMIN,
        subject: "FabtrackJS: new staff account created",
        text: `User ${username} (${email}) has registered an account on Fabtrack.`,
      });

      // DEBUG: Etherreal link to email
      console.log("Preview URL: %s", nodemailer.getTestMessageUrl(notif));

      res.redirect("/login");
    } catch (e) {
      console.error("Error creating account:", e);
      if (e.code === "P2002") {
        req.session.notification = "Error: User already exists";
        res.redirect("/");
      } else {
        req.session.notification =
          "Error: Unexpected database error. Unable to create account. Please try again.";
        res.redirect("/register");
      }
    }
  }),
);

// Password forgotten page
router.get("/forgot", clearNotification, function (req, res) {
  res.render("index/forgot");
});

// Password reset route
router.post(
  "/reset",
  asyncHandler(async (req, res) => {
    const { mail } = req.body;
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Update password reset token in the database
    await prisma.staff.update({
      where: { email: mail },
      data: { pwdToken: token, tokenExpiry: expiresAt },
    });

    const notif = await transporter.sendMail({
      from: process.env.MAILFROM,
      to: mail,
      subject: "Password Reset",
      html: `<a href="${process.env.HOSTURL}/reset/${token}">Reset Password</a>`,
    });

    // DEBUG: Etherreal link to email
    console.log("Preview URL: %s", nodemailer.getTestMessageUrl(notif));

    req.session.notification =
      "Success: Check your email to reset your password.";
    res.redirect("/login");
  }),
);

// Password reset page
router.get(
  "/reset/:token",
  clearNotification,
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    const user = await prisma.staff.findFirst({
      where: { pwdToken: token, tokenExpiry: { gte: new Date() } },
    });

    user ? res.render("index/reset", { user }) : res.redirect("/forgot");
  }),
);

// Reset password in the database
router.post(
  "/reset_password",
  asyncHandler(async (req, res) => {
    const { password, id } = req.body;

    // Hash the new password with bcrypt
    const hash = await bcrypt.hash(password, saltRounds);

    // Update the password in the database and clear the reset token
    try {
      await prisma.staff.update({
        where: { id: Number(id) },
        data: {
          password: hash,
          pwdToken: null, // Clear the token to prevent reuse
          tokenExpiry: null, // Clear token expiration if stored
        },
      });

      req.session.notification = "Success: Password reset successfully.";
      res.redirect("/login");
    } catch (e) {
      console.error("Error resetting password:", e);
      req.session.notification =
        "Error: Unable to reset password. Please try again.";
      res.redirect("/reset/" + id);
    }
  }),
);

// Authentication route
router.post(
  "/auth",
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const user = await prisma.staff.findUnique({ where: { name: username } });

    if (user && (await bcrypt.compare(password, user.password))) {
      req.session.loggedin = true;
      req.session.role = user.role;
      req.session.username = user.name;
      res.redirect("/");
    } else {
      req.session.notification = "Error: Incorrect username or password.";
      res.redirect("/login");
    }
  }),
);

// Logout route
router.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// User agreement
router.get(
  "/agreement/:token",
  asyncHandler(async (req, res) => {
    const { token } = req.params;

    try {
      const result = await prisma.user.update({
        where: { token },
        data: { termsAccepted: true },
      });

      req.session.notification =
        "Success: Thank you for agreeing to our terms and conditions";
      res.redirect("../");
    } catch (e) {
      console.error("Error updating agreement:", e);
      req.session.notification =
        "Error: Unable to update agreement status. Please try again.";
      res.redirect("../");
    }
  }),
);

module.exports = router;
