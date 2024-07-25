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

  const allUsers = await prisma.user.findMany({
    relationLoadStrategy: "join",
    include: {
      usertype: true,
    },
  });

  const userTypes = await prisma.usertype.findMany({});
  const projectTypes = await prisma.projecttype.findMany({});

  res.render("fabtrack/index", {
    notification: notification,
    role: req.session.role,
    users: allUsers,
    usertypes: userTypes,
    projecttypes: projectTypes,
  });
});

module.exports = router;
