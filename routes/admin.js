// ******************************************************************************
// This router handles the main admin routes
// ******************************************************************************

var express = require("express");
var router = express.Router();

const isAdmin = require("../middleware/checkAdmin.js");
router.use(isAdmin);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ******************************************************************************
// Route handling the main admin page
//
// >>> Rendering route
// ******************************************************************************

router.get("/", async (req, res) => {
  const notification = req.session.notification;
  req.session.notification = "";

  res.render("admin/main", {
    notification: notification,
    role: req.session.role,
  });
});

module.exports = router;
