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
// Route to manage workspaces (Admin Only)
// ******************************************************************************

router.get(
  "/manage",
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/workspaces/manage";

    const workspaces = await prisma.workspace.findMany({});

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

    const result = await prisma.workspace.delete({
      where: { id: Number(id) },
    });

    logger.logThat("Workspace " + result.name + " deleted by " + req.session.username);

    req.session.notification = "Success: Workspace " + result.name + " deleted";
    res.redirect(req.session.lastPage);
  }),
);

// ******************************************************************************
// Route handling the creation of a workspace (Admin Only)
// ******************************************************************************

router.post(
  "/create",
  asyncHandler(async (req, res) => {
    const { name, location } = req.body;

    const workspace = await prisma.workspace.create({
      data: { name: name, location: location },
    });

    logger.logThat("Workspace " + name + " created by " + req.session.username);

    req.session.notification = "Success: Workspace " + name + " created";
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

    const workspace = await prisma.workspace.update({
      where: { id: Number(workspaceid) },
      data: { name: name, location: location },
    });

    logger.logThat("Workspace " + name + " update by " + req.session.username);
    req.session.notification = "Success: Workspace " + name + " updated";

    res.redirect("/admin/workspaces/manage");
  }),
);

module.exports = router;
