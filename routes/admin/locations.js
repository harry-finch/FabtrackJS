var express = require("express");
var router = express.Router();

const asyncHandler = require("../../middleware/asyncHandler.js");
const clearNotification = require("../../middleware/clearNotification.js");
const isAdmin = require("../../middleware/checkAdmin.js");
router.use(isAdmin);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const logger = require("../../utilities/simpleLogger.js");

// ******************************************************************************
// Route to manage locations
// ******************************************************************************

router.get(
  "/manage",
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/locations/manage";

    const locations = await prisma.location.findMany({});

    res.render("admin/manage-locations", {
      notification: notification,
      role: req.session.role,
      locations: locations,
    });
  }),
);

// ******************************************************************************
// Route to delete a location
// ******************************************************************************

router.get(
  "/delete/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await prisma.location.delete({
      where: { id: Number(id) },
    });

    logger.logThat("Location " + result.name + " deleted by " + req.session.username);

    req.session.notification = "Success: Location " + result.name + " deleted";
    res.redirect(req.session.lastPage);
  }),
);

// ******************************************************************************
// Route to create a location
// ******************************************************************************

router.post(
  "/create",
  asyncHandler(async (req, res) => {
    const { name, description } = req.body;

    const location = await prisma.location.create({
      data: { name: name, description: description },
    });

    logger.logThat("Location " + name + " created by " + req.session.username);
    req.session.notification = "Success: Location " + name + " created";

    res.redirect("/admin/locations/manage");
  }),
);

// ******************************************************************************
// Route to update a location
// ******************************************************************************

router.post(
  "/update",
  asyncHandler(async (req, res) => {
    const { locationid, name, description } = req.body;

    const location = await prisma.location.update({
      where: { id: Number(locationid) },
      data: { name: name, description: description },
    });

    logger.logThat("Location " + name + " update by " + req.session.username);
    req.session.notification = "Success: Location " + name + " updated";

    res.redirect("/admin/locations/manage");
  }),
);

module.exports = router;
