// ******************************************************************************
// This router handles login, logout, authentication and password reset
// ******************************************************************************

var express = require("express");
var router = express.Router();
var crypto = require("crypto");

const dotenv = require("dotenv");
dotenv.config();

// Update mail options in .env file
const nodemailer = require("nodemailer");
const transporter = nodemailer.createTransport({
  host: process.env.HOST,
  port: parseInt(process.env.MAILPORT),
  secure: process.env.SECURE === "true",
  auth: {
    user: process.env.USR,
    pass: process.env.PASSWD,
  },
});

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ******************************************************************************
// Route handling the root page depending if you're logged in or not
// ******************************************************************************

router.get("/", async (req, res) => {
  if (req.session.role === "admin") {
    return res.redirect("admin/");
  }

  if (req.session.loggedin == true) {
    return res.redirect("fabtrack/");
  } else {
    return res.redirect("login/");
  }
});

// ******************************************************************************
// Routes handling login, registration and password reset
//
// >>> Rendering routes
// ******************************************************************************

router.get("/login", function (req, res) {
  const notification = req.session.notification;
  req.session.notification = "";

  res.render("index/login", {
    notification: notification,
  });
});

router.get("/register", function (req, res) {
  const notification = req.session.notification;
  req.session.notification = "";

  res.render("index/register", {
    notification: notification,
    content: req.session.formcontent,
  });
});

router.get("/forgot", function (req, res) {
  const notification = req.session.notification;
  req.session.notification = "";

  res.render("index/forgot", { notification: notification });
});

// ******************************************************************************
// Route handling the creation of a new staff from the registration page
// ******************************************************************************

router.post("/create-account", async (req, res) => {
  const { username, password, mail } = req.body;

  // Hash password
  var salt = process.env.SALT;
  var hash = crypto
    .pbkdf2Sync(password, salt, 1000, 64, `sha512`)
    .toString(`base64`);

  const result = await prisma.staff
    .create({
      data: {
        name: username,
        pwd: hash,
        mail: mail,
      },
    })
    .catch(async (e) => {
      console.log(e);

      if (e.code === "P2002") {
        await prisma.$disconnect();

        req.session.notification = "Error: User already exists";
        res.redirect("/register");
      } else {
        req.session.notification =
          "Warning: Your account needs to be approved by an administrator before you can log in.";

        const info = await transporter.sendMail({
          from: process.env.MAILFROM,
          to: process.env.ADMIN,
          subject: "FabtrackJS: new staff account created",
          text:
            "User " +
            username +
            " (" +
            mail +
            ") " +
            " has registered an account on Fabtrack.",
        });

        res.redirect("/login");
      }
    });
});

// ******************************************************************************
// Route handling the generation of a random token to reset the password and
// sends it via email to the user (staff)
// ******************************************************************************

router.post("/reset", async (req, res) => {
  const { mail } = req.body;

  // Generate a random token
  const buf = crypto.randomBytes(10);
  const now = new Date().toISOString();

  const result = await prisma.staff.update({
    where: {
      mail: mail,
    },
    data: {
      pwdtoken: buf.toString("base64"),
      timestamp: now,
    },
  });

  const info = await transporter.sendMail({
    from: process.env.MAILFROM,
    to: mail,
    subject: "FabtrackJS: reset your password",
    text: process.env.HOSTURL + "/reset/" + buf.toString("base64"),
    html:
      '<a href="' +
      process.env.HOSTURL +
      "/reset/" +
      buf.toString("base64") +
      '">Click here to reset your password</a>',
  });

  console.log(process.env.HOSTURL + "/reset/" + buf.toString("base64"));
  req.session.notification = "Warning: Check your email to reset password";

  res.redirect("login");
});

// ******************************************************************************
// Route handling the reset password page
//
// It takes a token as param and checks which staff has it in the database
// as well as the token validity (10 minutes)
// ******************************************************************************

router.get("/reset/:token", async (req, res) => {
  const { token } = req.params;

  // Find the staff with the corresponding token
  const result = await prisma.staff.findFirst({
    where: {
      pwdtoken: token,
    },
  });

  const now = Date.now();
  const tokenCreation = Date.parse(result.timestamp);

  // Check if token is still valid (10 minutes)
  if (now - tokenCreation > 600000) {
    req.session.notification = "Error: Token has timed out.";
    res.redirect("/forgot");
  } else {
    res.render("index/reset", { user: result });
  }
});

// ******************************************************************************
// Route handling saving the new password in the database
// ******************************************************************************

router.post("/reset_password", async (req, res) => {
  const { password, id } = req.body;

  // Hash password and update it
  var salt = process.env.SALT;
  var hash = crypto
    .pbkdf2Sync(password, salt, 1000, 64, `sha512`)
    .toString(`base64`);

  const result = await prisma.staff.update({
    where: {
      id: Number(id),
    },
    data: {
      pwd: hash,
    },
  });
  res.redirect("/login");
});

// ******************************************************************************
// Route handling the authentication process
//
// It takes a username, a password and the "rememberMe" checkbox value
// Redirects to the index page or the login if not successful
// ******************************************************************************

router.post("/auth", async function (req, res) {
  let username = req.body.username;
  let password = req.body.password;
  let rememberMe = req.body.rememberMe;

  // Ensure the input fields exists and are not empty
  if (username && password) {
    // Hash the password to check it against the hash in the database
    var salt = process.env.SALT;
    var hash = crypto
      .pbkdf2Sync(password, salt, 1000, 64, `sha512`)
      .toString(`base64`);

    const user = await prisma.staff.findUnique({
      where: { name: username, pwd: hash },
    });

    if (user) {
      req.session.loggedin = true;
      req.session.username = username;
      req.session.role = user.role;

      if (rememberMe) {
        var hour = 3600000;
        req.session.cookie.maxAge = 30 * 24 * hour; // Remember session for 30 days
      }

      res.redirect("/");
    } else {
      req.session.notification = "Error: Wrong user/password";
      res.redirect("/");
    }
  } else {
    req.session.notification = "Error: At least one field is empty.";
    res.redirect("/login");
  }
});

// ******************************************************************************
// Route handling staff logout
//
// Redirects to the login page
// ******************************************************************************

router.get("/logout", function (req, res, next) {
  req.session.username = null;
  req.session.save(function (err) {
    if (err) next(err);

    // Regenerate the session, which is good practice to help
    // guard against forms of session fixation
    req.session.regenerate(function (err) {
      if (err) next(err);
      res.redirect("/");
    });
  });
});

// ******************************************************************************
// Route handling the user signing the agreement
// ******************************************************************************

router.put("/agreement/:token", async (req, res) => {
  const { token } = req.params;

  const result = await prisma.users.update({
    where: { token: token },
    data: {
      termsAndConditions: true,
    },
  });
  req.session.notification =
    "Thank you for agreeing to our terms and conditions";
  res.redirect("../");
});

module.exports = router;
