var express = require("express");
var router = express.Router();

const isAdmin = require("../middleware/checkAdmin.js");
router.use(isAdmin);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const logger = require("../utilities/simpleLogger.js");

// ******************************************************************************
// Route handling the admin page managing workspaces
//
// >>> Rendering route
// ******************************************************************************

router.get("/manage", async (req, res) => {
  const notification = req.session.notification;
  req.session.notification = "";
  req.session.lastPage = "/admin/workspaces/manage";

  const workspaces = await prisma.workspace.findMany({});

  res.render("admin/manage-workspaces", {
    notification: notification,
    role: req.session.role,
    workspaces: workspaces,
  });
});

// ******************************************************************************
// Route handling the deletion of a workspace
// ******************************************************************************

router.get("/delete/:id", async (req, res) => {
  const { id } = req.params;
  const result = await prisma.workspace.delete({
    where: { id: Number(id) },
  });

  logger.logThat(
    "Workspace " + result.name + " deleted by " + req.session.username,
  );
  req.session.notification = "Success: Workspace " + result.name + " deleted";

  res.redirect(req.session.lastPage);
});

// ******************************************************************************
// Route handling the creation of a workspace
// ******************************************************************************

router.post("/create", async (req, res) => {
  const { name, location } = req.body;

  const workspace = await prisma.workspace.create({
    data: { name: name, location: location },
  });

  logger.logThat("Workspace " + name + " created by " + req.session.username);
  req.session.notification = "Success: Workspace " + name + " created";

  res.redirect("/admin/workspaces/manage");
});

// ******************************************************************************
// Route handling the update of a workspace
// ******************************************************************************

router.post("/update", async (req, res) => {
  const { workspaceid, name, location } = req.body;

  const workspace = await prisma.workspace.update({
    where: { id: Number(workspaceid) },
    data: { name: name, location: location },
  });

  logger.logThat("Workspace " + name + " update by " + req.session.username);
  req.session.notification = "Success: Workspace " + name + " updated";

  res.redirect("/admin/workspaces/manage");
});

module.exports = router;
