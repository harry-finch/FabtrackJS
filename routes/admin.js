var express = require("express");
var router = express.Router();

// Script with HTML rendering functions
var render = require("../utilities/render");

const isAdmin = require("../middleware/checkAdmin.js");
router.use(isAdmin);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ******************************************************************************
// Route qui gère l'affichage de la page d'admin.
// ******************************************************************************

router.get("/", async (req, res) => {
  const allUsers = await prisma.utilisateurs.findMany({});
  const allBabyfoots = await prisma.babyfoot.findMany({});

  const currentGames = await prisma.parties.findMany({
    include: {
      babyfoot: true,
    },
    where: {
      etat: "en cours",
    },
  });

  // Passing data and rendering functions
  res.render("admin", { users: allUsers, babyfoots: allBabyfoots, games: currentGames, render: render });
});

module.exports = router;
