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
// Route handling the admin page managing machine types (3D printer, laser cutter...)
//
// >>> Rendering route
// ******************************************************************************

router.get("/manage-types", async (req, res) => {
  const notification = req.session.notification;
  req.session.notification = "";
  req.session.lastPage = "/admin/machines/manage-types";

  const allTypes = await prisma.machinetype.findMany({});

  res.render("admin/manage-machinetypes", {
    notification: notification,
    role: req.session.role,
    machinetypes: allTypes,
  });
});

// ******************************************************************************
// Route handling the deletion of a machinetype
// ******************************************************************************

router.get("/delete-type/:id", async (req, res) => {
  const { id } = req.params;
  const result = await prisma.machinetype.delete({
    where: { id: Number(id) },
  });

  logger.logThat(
    "Machine type " + result.name + " deleted by " + req.session.username,
  );
  req.session.notification =
    "Success: Machine type " + result.name + " deleted";

  res.redirect(req.session.lastPage);
});

// ******************************************************************************
// Route handling the creation of a machine type
// ******************************************************************************

router.post("/create-type", async (req, res) => {
  const { name } = req.body;
  const machinetype = await prisma.machinetype.create({
    data: { name: name },
  });

  logger.logThat(
    "Machine type " + name + " created by " + req.session.username,
  );
  req.session.notification = "Success: Machine type " + name + " created";

  res.redirect("/admin/machines/manage-types");
});

// ******************************************************************************
// Route handling the update of a machine type
// ******************************************************************************

router.post("/update-type", async (req, res) => {
  const { machinetypeid, name } = req.body;
  const access = await prisma.machinetype.update({
    where: { id: Number(machinetypeid) },
    data: { name: name },
  });

  logger.logThat("Machine type " + name + " update by " + req.session.username);
  req.session.notification = "Success: Machine type " + name + " updated";

  res.redirect("/admin/machines/manage-types");
});

module.exports = router;
