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
// Route to manage warning types
// ******************************************************************************

router.get(
  "/manage",
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/warningtypes/manage";

    const warningtypes = await prisma.warningtype.findMany({
      orderBy: { id: "asc" },
    });

    res.render("admin/manage-warningtypes", {
      warningtypes,
    });
  }),
);

// ******************************************************************************
// Route to delete a warning type
// ******************************************************************************

router.get(
  "/delete/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
      const result = await prisma.warningtype.delete({
        where: { id: Number(id) },
      });

      invalidateCache(req);
      logger.logThat("Warning type " + result.name + " deleted by " + req.session.username);
      req.session.notification = "Success: Warning type " + result.name + " deleted";
    } catch (error) {
      console.error("Error deleting warning type:", error);
      req.session.notification = "Error: Failed to delete warning type (check linked warnings)";
    }

    res.redirect(req.session.lastPage || "/admin/warningtypes/manage");
  }),
);

// ******************************************************************************
// Route to create a warning type
// ******************************************************************************

router.post(
  "/create",
  asyncHandler(async (req, res) => {
    const { name, icon } = req.body;

    try {
      const warningtype = await prisma.warningtype.create({
        data: { name: name.trim(), icon: icon ? icon.trim() : null },
      });

      invalidateCache(req);
      logger.logThat("Warning type " + name + " created by " + req.session.username);
      req.session.notification = "Success: Warning type " + name + " created";
    } catch (error) {
      console.error("Error creating warning type:", error);
      req.session.notification = "Error: Failed to create warning type";
    }

    res.redirect("/admin/warningtypes/manage");
  }),
);

// ******************************************************************************
// Route to update a warning type
// ******************************************************************************

router.post(
  "/update",
  asyncHandler(async (req, res) => {
    const { warningtypeid, name, icon } = req.body;

    try {
      const warningtype = await prisma.warningtype.update({
        where: { id: Number(warningtypeid) },
        data: { name: name.trim(), icon: icon ? icon.trim() : null },
      });

      invalidateCache(req);
      logger.logThat("Warning type " + name + " updated by " + req.session.username);
      req.session.notification = "Success: Warning type " + name + " updated";
    } catch (error) {
      console.error("Error updating warning type:", error);
      req.session.notification = "Error: Failed to update warning type";
    }

    res.redirect("/admin/warningtypes/manage");
  }),
);

module.exports = router;
