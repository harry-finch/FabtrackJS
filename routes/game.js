var express = require("express");
var router = express.Router();

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// #TODO
// - Page de classement des joueurs

// ******************************************************************************
// Route qui gère l'affichage de la page d'un match.
// ******************************************************************************

router.get("/:id", async (req, res) => {
  const { id } = req.params;

  const game = await prisma.parties.findUnique({
    where: {
      id: Number(id),
    },
  });
  res.render("game", { game: game });
});

// ******************************************************************************
// Route qui génère une liste de tous les matchs.
// ******************************************************************************

router.get("/list", async (req, res) => {
  if (!req.session.loggedin) {
    req.session.error = "Unauthorized access!";
    return res.redirect("/");
  }

  const allGames = await prisma.parties.findMany({});
  res.status(200).json(allGames);
});

// ******************************************************************************
// Route qui gère la création d'une partie.
// ******************************************************************************

router.post("/start", async (req, res) => {
  const { babyfoot, player1, player2 } = req.body;

  const result = await prisma.parties.create({
    data: {
      babyfootId: Number(babyfoot),
      adversaire_1Id: Number(player1),
      adversaire_2Id: Number(player2),
    },
  });
  req.session.currentgame = result.id;
  res.redirect("/game/" + result.id);
});

// ******************************************************************************
// API à destination du babyfoot
// Permet de récupérer l'id d'une partie qui vient de démarrer sur le babyfoot.
// L'id envoyé est celui du babyfoot
// ******************************************************************************

router.get("/getgame/:babyfootid", async (req, res) => {
  const { babyfootId } = req.params;

  const result = prisma.parties.findFirst({
    where: {
      babyfootId: babyfootId,
      etat: "en cours",
    },
  });
  res.json(result);
});

// ******************************************************************************
// API à destination du babyfoot
// Permet de terminer une partie de babyfoot.
// L'id envoyé est celui de la partie à terminer.
// ******************************************************************************

router.put("/end/:id", async (req, res) => {
  const { id } = req.params;

  // Get socket.io to emit a message with the updated values
  var io = req.app.get("socketio");
  io.emit("fin", req.params);

  const result = await prisma.parties.update({
    where: {
      id: Number(id),
    },
    data: {
      etat: "terminée",
    },
  });
  res.redirect("../admin");
});

// ******************************************************************************
// API à destination du babyfoot
// Permet de valider un but.
// gameid: id de la partie en cours
// score1: score de l'adversaire 1
// score2: score de l'adversaire 2
// ******************************************************************************

router.get("/score/:gameid/:score1/:score2", async (req, res) => {
  const { gameid, score1, score2 } = req.params;

  // Get socket.io to emit a message with the updated values
  var io = req.app.get("socketio");
  io.emit("but", req.params);

  const result = await prisma.parties.update({
    where: {
      id: Number(gameid),
    },
    data: {
      score_1: Number(score1),
      score_2: Number(score2),
    },
  });
  res.status(200).end();
});

// ******************************************************************************
// API pour tests
// ******************************************************************************

router.get("/createDummy", async (req, res) => {
  const result = await prisma.parties.create({
    data: {
      babyfootId: 1,
      adversaire_1Id: 2,
      adversaire_2Id: 3,
      score_1: 4,
      score_2: 3,
      etat: "en cours",
    },
  });
  res.json(result);
});

module.exports = router;
