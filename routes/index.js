var express = require("express");
var router = express.Router();
var crypto = require("crypto");

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ******************************************************************************
// Route de la page principale
// Envoie les joueurs, les babyfoots et les parties en cours
// ******************************************************************************

router.get("/", async (req, res) => {
  if (req.session.role === "admin") {
    return res.redirect("admin/");
  }
  if (req.session.loggedin == true) {
    const games = await prisma.parties.findMany({
      include: {
        babyfoot: true,
        adversaire_1: true,
        adversaire_2: true,
      },
      where: {
        etat: "en cours",
      },
    });
    const babyfoot = await prisma.babyfoot.findMany({
      include: {
        parties: {
          where: {
            etat: "en cours",
          },
        },
      },
    });
    const players = await prisma.utilisateurs.findMany({
      include: {
        partiesAdv1: {
          where: {
            etat: "en cours",
          },
        },
        partiesAdv2: {
          where: {
            etat: "en cours",
          },
        },
      },
    });

    return res.render("index", { user: req.session.username, players: players, babyfoots: babyfoot, games: games });
  } else {
    return res.redirect("./login/");
  }
});

// ******************************************************************************
// Routes handling login, registration and password reset
// ******************************************************************************

router.get("/login", function (req, res) {
  res.render("login", { error: req.session.error, message: req.session.message });
});

router.get("/register", function (req, res) {
  res.render("register", { error: req.session.error, content: req.session.formcontent });
});

router.get("/forgot", function (req, res) {
  res.render("forgot", { error: req.session.error });
});

// ******************************************************************************
// Route handling the generation of a random token to reset the password and
// sends it via email to the user
// ******************************************************************************

router.post("/reset", async (req, res) => {
  const { mail } = req.body;

  // Generate a random token
  const buf = crypto.randomBytes(10);
  console.log("The random data is: " + buf.toString("base64"));

  const now = new Date().toISOString();

  const result = await prisma.utilisateurs.update({
    where: {
      mail: mail,
    },
    data: {
      pwdtoken: buf.toString("base64"),
      timestamp: now,
    },
  });

  // TODO: send email with URL
  res.send("http://localhost:8080/reset/" + buf.toString("base64"));
});

// ******************************************************************************
// Route handling the reset password page
// It takes a token as param and checks which user has it in the database
// as well as the token validity (10 minutes)
// ******************************************************************************

router.get("/reset/:token", async (req, res) => {
  const { token } = req.params;

  // Find the user with the corresponding token
  const result = await prisma.utilisateurs.findFirst({
    where: {
      pwdtoken: token,
    },
  });

  const now = Date.now();
  const tokenCreation = Date.parse(result.timestamp);

  // Check if token is still valid (10 minutes)
  if (now - tokenCreation > 600000) {
    req.session.error = "Token has timed out.";
    res.redirect("/forgot");
  } else {
    res.render("reset", { user: result });
  }
});

// ******************************************************************************
// Route handling saving the new password in the database
// ******************************************************************************

router.post("/reset_password", async (req, res) => {
  const { password, id } = req.body;

  // Hash password and update it
  var salt = process.env.SALT;
  var hash = crypto.pbkdf2Sync(password, salt, 1000, 64, `sha512`).toString(`base64`);

  const result = await prisma.utilisateurs.update({
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
    var hash = crypto.pbkdf2Sync(password, salt, 1000, 64, `sha512`).toString(`base64`);

    const user = await prisma.utilisateurs.findUnique({
      where: { nom: username, pwd: hash },
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
      req.session.error = "Wrong user/password";
      res.redirect("/");
    }
  } else {
    req.session.error = "At least one field is empty.";
    res.redirect("/login");
  }
});

// ******************************************************************************
// Route handling user logout
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

module.exports = router;