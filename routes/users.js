var express = require("express");
var crypto = require("crypto");
var router = express.Router();

// const isLoggedIn = require("../middleware/checkSession.js");
// router.use(isLoggedIn);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ******************************************************************************
// Route qui renvoie une liste de tous les utilisateurs.
// ******************************************************************************

router.get("/", async (req, res) => {
  if (!req.session.loggedin) {
    req.session.error = "Unauthorized access!";
    return res.redirect("/");
  }

  const allUsers = await prisma.utilisateurs.findMany({});
  res.status(200).json(allUsers);
});

// ******************************************************************************
// Route qui gère la création d'un nouvel utilisateur.
// ******************************************************************************

router.post("/create", async (req, res) => {
  const { username, password, mail } = req.body;

  // Hash password
  var salt = "babyfoot";
  var hash = crypto.pbkdf2Sync(password, salt, 1000, 64, `sha512`).toString(`base64`);

  const result = await prisma.utilisateurs
    .create({
      data: {
        nom: username,
        pwd: hash,
        mail: mail,
      },
    })
    .catch(async (e) => {
      console.log(e);

      if (e.code === "P2002") {
        req.session.error = "User already exists";
        res.redirect("../register");
      }
      await prisma.$disconnect();
    });

  req.session.message = "Your account needs to be approved by an administrator before you can log in.";
  res.redirect("../login");
});

// ******************************************************************************
// Route qui gère la suppression d'un utilisateur (réservé à l'admin).
// ******************************************************************************

router.delete("/delete/:id", async (req, res) => {
  if (!req.session.admin) {
    req.session.error = "Unauthorized access!";
    return res.redirect("/");
  }

  const { id } = req.params;
  const user = await prisma.utilisateurs.delete({
    where: { id: Number(id) },
  });
  res.json(user);
});

module.exports = router;
