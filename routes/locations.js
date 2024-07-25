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
  req.session.lastPage = "/admin/locations/manage";

  const locations = await prisma.location.findMany({});

  res.render("admin/manage-locations", {
    notification: notification,
    role: req.session.role,
    locations: locations,
  });
});

// ******************************************************************************
// Route handling the deletion of a location
// ******************************************************************************

router.get("/delete/:id", async (req, res) => {
  const { id } = req.params;
  const result = await prisma.location.delete({
    where: { id: Number(id) },
  });

  logger.logThat(
    "Location " + result.name + " deleted by " + req.session.username,
  );
  req.session.notification = "Success: Location " + result.name + " deleted";

  res.redirect(req.session.lastPage);
});

// ******************************************************************************
// Route handling the creation of a location
// ******************************************************************************

router.post("/create", async (req, res) => {
  const { name, description } = req.body;
  const location = await prisma.location.create({
    data: { name: name, description: description },
  });

  logger.logThat("Location " + name + " created by " + req.session.username);
  req.session.notification = "Success: Location " + name + " created";

  res.redirect("/admin/locations/manage");
});

// ******************************************************************************
// Route handling the update of an location
// ******************************************************************************

router.post("/update", async (req, res) => {
  const { locationid, name, description } = req.body;
  const access = await prisma.location.update({
    where: { id: Number(locationid) },
    data: { name: name, description: description },
  });

  logger.logThat("Location " + name + " update by " + req.session.username);
  req.session.notification = "Success: Location " + name + " updated";

  res.redirect("/admin/locations/manage");
});

module.exports = router;
