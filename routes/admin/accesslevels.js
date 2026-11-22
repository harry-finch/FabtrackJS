var express = require("express");
var router = express.Router();

const asyncHandler = require("../../middleware/asyncHandler.js");
const clearNotification = require("../../middleware/clearNotification.js");
const isAdmin = require("../../middleware/checkAdmin.js");
const { invalidateCache } = require("../../middleware/cacheHelper.js");
const { validateBody, validateParams } = require("../../middleware/validate.js");
const { idParamSchema, createAccessLevelSchema, updateAccessLevelSchema } = require("../../schemas/index.js");

router.use(isAdmin);

const { prisma } = require("../../utilities/db.js");

const logger = require("../../utilities/simpleLogger.js");

// ******************************************************************************
// Route to manage access levels
// ******************************************************************************

router.get(
  "/manage",
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/accesslevels/manage";

    const access = await prisma.access.findMany({
      orderBy: { id: "asc" },
    });

    res.render("admin/manage-access", {
      access,
    });
  }),
);

// ******************************************************************************
// Route to delete an access level
// ******************************************************************************

router.post(
  "/delete/:id",
  validateParams(idParamSchema, { redirectUrl: (req) => req.session.lastPage || "/admin/accesslevels/manage" }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
      const result = await prisma.access.delete({
        where: { id: Number(id) },
      });

      invalidateCache(req);
      logger.logThat("Access level " + result.name + " deleted by " + req.session.username);
      req.session.notification = "Success: Access level " + result.name + " deleted";
    } catch (error) {
      console.error("Error deleting access level:", error);
      req.session.notification = "Error: Failed to delete access level (check linked machines)";
    }

    res.redirect(req.session.lastPage || "/admin/accesslevels/manage");
  }),
);

// ******************************************************************************
// Route to create a new access level
// ******************************************************************************

router.post(
  "/create",
  validateBody(createAccessLevelSchema, { redirectUrl: "/admin/accesslevels/manage" }),
  asyncHandler(async (req, res) => {
    const { name, description } = req.body;

    try {
      const access = await prisma.access.create({
        data: { name: name.trim(), description: description.trim() },
      });

      invalidateCache(req);
      logger.logThat("Access level " + name + " created by " + req.session.username);
      req.session.notification = "Success: Access level " + name + " created";
    } catch (error) {
      console.error("Error creating access level:", error);
      req.session.notification = "Error: Failed to create access level";
    }

    res.redirect("/admin/accesslevels/manage");
  }),
);

// ******************************************************************************
// Route to update an access level
// ******************************************************************************

router.post(
  "/update",
  validateBody(updateAccessLevelSchema, { redirectUrl: "/admin/accesslevels/manage" }),
  asyncHandler(async (req, res) => {
    const { accessid, name, description } = req.body;

    try {
      const access = await prisma.access.update({
        where: { id: Number(accessid) },
        data: { name: name.trim(), description: description.trim() },
      });

      invalidateCache(req);
      logger.logThat("Access level " + name + " updated by " + req.session.username);
      req.session.notification = "Success: Access level " + name + " updated";
    } catch (error) {
      console.error("Error updating access level:", error);
      req.session.notification = "Error: Failed to update access level";
    }

    res.redirect("/admin/accesslevels/manage");
  }),
);

module.exports = router;
