// ******************************************************************************
// This router handles the front end routes
// ******************************************************************************

var express = require("express");
var router = express.Router();

const isLoggedIn = require("../middleware/checkSession.js");
router.use(isLoggedIn);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ******************************************************************************
// Route handling the main admin page
// ******************************************************************************

router.get("/", async (req, res) => {
  const notification = req.session.notification;
  req.session.notification = "";

  req.session.lastPage = "/fabtrack";

  const allUsers = await prisma.users.findMany({
    relationLoadStrategy: "join",
    include: {
      usertype: true,
    },
  });

  const allTypes = await prisma.usertype.findMany({});

  res.render("fabtrack/index", {
    notification: notification,
    users: allUsers,
    usertypes: allTypes,
  });
});

module.exports = router;
