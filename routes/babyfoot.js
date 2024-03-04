var express = require("express");
var router = express.Router();

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const isAdmin = require("../middleware/checkAdmin.js");
router.use(isAdmin);

// ******************************************************************************
// Route qui gère la création d'un babyfoot (réservé à l'admin).
// ******************************************************************************

router.post("/create", async (req, res) => {
  const { location } = req.body;

  const result = await prisma.babyfoot.create({
    data: {
      localisation: location,
    },
  });
  res.redirect("../admin");
});

// ******************************************************************************
// Route qui gère la suppression d'un babyfoot (réservé à l'admin).
// ******************************************************************************

router.delete("/delete/:id", async (req, res) => {
  const { id } = req.params;

  const result = await prisma.babyfoot.delete({
    where: {
      id: Number(id),
    },
  });
  res.redirect("../admin");
});

module.exports = router;
