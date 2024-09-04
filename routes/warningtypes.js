// ******************************************************************************
// This router handles the main admin routes
// ******************************************************************************

var express = require("express");
var router = express.Router();

const isAdmin = require("../middleware/checkAdmin.js");
router.use(isAdmin);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const logger = require("../utilities/simpleLogger.js");

// ******************************************************************************
// Route handling the admin page managing locations
//
// >>> Rendering route
// ******************************************************************************

router.get("/manage", async (req, res) => {
  const notification = req.session.notification;
  req.session.notification = "";
  req.session.lastPage = "/admin/warningtypes/manage";

  const warningtypes = await prisma.warningtype.findMany({});

  res.render("admin/manage-warningtypes", {
    notification: notification,
    role: req.session.role,
    warningtypes: warningtypes,
  });
});

// ******************************************************************************
// Route handling the deletion of a warning type
// ******************************************************************************

router.get("/delete/:id", async (req, res) => {
  const { id } = req.params;
  const result = await prisma.warningtype.delete({
    where: { id: Number(id) },
  });

  logger.logThat(
    "Warning type " + result.name + " deleted by " + req.session.username,
  );
  req.session.notification =
    "Success: Warning type " + result.name + " deleted";

  res.redirect(req.session.lastPage);
});

// ******************************************************************************
// Route handling the creation of a warning type
// ******************************************************************************

router.post("/create", async (req, res) => {
  const { name, icon } = req.body;

  const warningtype = await prisma.warningtype.create({
    data: { name: name, icon: icon },
  });

  logger.logThat(
    "Warning type " + name + " created by " + req.session.username,
  );
  req.session.notification = "Success: Warning type " + name + " created";

  res.redirect("/admin/warningtypes/manage");
});

// ******************************************************************************
// Route handling the update of an location
// ******************************************************************************

router.post("/update", async (req, res) => {
  const { warningtypeid, name, icon } = req.body;

  const warningtype = await prisma.warningtype.update({
    where: { id: Number(warningtypeid) },
    data: { name: name, icon: icon },
  });

  logger.logThat("Warning type " + name + " update by " + req.session.username);
  req.session.notification = "Success: Warning type " + name + " updated";

  res.redirect("/admin/warningtypes/manage");
});

module.exports = router;
