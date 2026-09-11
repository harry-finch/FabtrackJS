var express = require("express");
var router = express.Router();

const asyncHandler = require("../../middleware/asyncHandler.js");
const clearNotification = require("../../middleware/clearNotification.js");
const isAdmin = require("../../middleware/checkAdmin.js");
const { invalidateCache } = require("../../middleware/cacheHelper.js");

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

    const locations = await prisma.location.findMany({
      orderBy: { id: "asc" },
    });

    res.render("admin/manage-locations", {
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

    try {
      const result = await prisma.location.delete({
        where: { id: Number(id) },
      });

      invalidateCache(req);
      logger.logThat("Location " + result.name + " deleted by " + req.session.username);
      req.session.notification = "Success: Location " + result.name + " deleted";
    } catch (error) {
      console.error("Error deleting location:", error);
      req.session.notification = "Error: Failed to delete location (check linked machines)";
    }

    res.redirect(req.session.lastPage || "/admin/locations/manage");
  }),
);

// ******************************************************************************
// Route to create a location
// ******************************************************************************

router.post(
  "/create",
  asyncHandler(async (req, res) => {
    const { name, description } = req.body;

    try {
      const location = await prisma.location.create({
        data: { name: name.trim(), description: description ? description.trim() : null },
      });

      invalidateCache(req);
      logger.logThat("Location " + name + " created by " + req.session.username);
      req.session.notification = "Success: Location " + name + " created";
    } catch (error) {
      console.error("Error creating location:", error);
      req.session.notification = "Error: Failed to create location";
    }

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

    try {
      const location = await prisma.location.update({
        where: { id: Number(locationid) },
        data: { name: name.trim(), description: description ? description.trim() : null },
      });

      invalidateCache(req);
      logger.logThat("Location " + name + " updated by " + req.session.username);
      req.session.notification = "Success: Location " + name + " updated";
    } catch (error) {
      console.error("Error updating location:", error);
      req.session.notification = "Error: Failed to update location";
    }

    res.redirect("/admin/locations/manage");
  }),
);

module.exports = router;
