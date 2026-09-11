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
// Route to manage workspaces (Admin Only)
// ******************************************************************************

router.get(
  "/manage",
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/workspaces/manage";

    const workspaces = await prisma.workspace.findMany({
      orderBy: { id: "asc" },
    });

    res.render("admin/manage-workspaces", {
      workspaces,
    });
  }),
);

// ******************************************************************************
// Route to delete a workspace (Admin Only)
// ******************************************************************************

router.get(
  "/delete/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
      const result = await prisma.workspace.delete({
        where: { id: Number(id) },
      });

      invalidateCache(req);
      logger.logThat("Workspace " + result.name + " deleted by " + req.session.username);
      req.session.notification = "Success: Workspace " + result.name + " deleted";
    } catch (error) {
      console.error("Error deleting workspace:", error);
      req.session.notification = "Error: Failed to delete workspace (check related history or categories)";
    }

    res.redirect(req.session.lastPage || "/admin/workspaces/manage");
  }),
);

// ******************************************************************************
// Route handling the creation of a workspace (Admin Only)
// ******************************************************************************

router.post(
  "/create",
  asyncHandler(async (req, res) => {
    const { name, location } = req.body;

    try {
      const workspace = await prisma.workspace.create({
        data: { name: name.trim(), location: location ? location.trim() : null },
      });

      invalidateCache(req);
      logger.logThat("Workspace " + name + " created by " + req.session.username);
      req.session.notification = "Success: Workspace " + name + " created";
    } catch (error) {
      console.error("Error creating workspace:", error);
      req.session.notification = "Error: Failed to create workspace";
    }

    res.redirect("/admin/workspaces/manage");
  }),
);

// ******************************************************************************
// Route to update a workspace
// ******************************************************************************

router.post(
  "/update",
  asyncHandler(async (req, res) => {
    const { workspaceid, name, location } = req.body;

    try {
      const workspace = await prisma.workspace.update({
        where: { id: Number(workspaceid) },
        data: { name: name.trim(), location: location ? location.trim() : null },
      });

      invalidateCache(req);
      logger.logThat("Workspace " + name + " updated by " + req.session.username);
      req.session.notification = "Success: Workspace " + name + " updated";
    } catch (error) {
      console.error("Error updating workspace:", error);
      req.session.notification = "Error: Failed to update workspace";
    }

    res.redirect("/admin/workspaces/manage");
  }),
);

module.exports = router;
