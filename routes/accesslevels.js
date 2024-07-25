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
// Route handling the admin page managing access levels
//
// >>> Rendering route
// ******************************************************************************

router.get("/manage", async (req, res) => {
  const notification = req.session.notification;
  req.session.notification = "";
  req.session.lastPage = "/admin/access/manage";

  const access = await prisma.access.findMany({});

  res.render("admin/manage-access", {
    notification: notification,
    role: req.session.role,
    access: access,
  });
});

// ******************************************************************************
// Route handling the deletion of a access
// ******************************************************************************

router.get("/delete/:id", async (req, res) => {
  const { id } = req.params;
  const result = await prisma.access.delete({
    where: { id: Number(id) },
  });

  logger.logThat(
    "Access level " + result.name + " deleted by " + req.session.username,
  );
  req.session.notification =
    "Success: Access level " + result.name + " deleted";

  res.redirect(req.session.lastPage);
});

// ******************************************************************************
// Route handling the creation of an access level
// ******************************************************************************

router.post("/create", async (req, res) => {
  const { name, description } = req.body;
  const access = await prisma.access.create({
    data: { name: name, description: description },
  });

  logger.logThat(
    "Access level " + name + " created by " + req.session.username,
  );
  req.session.notification = "Success: Access level " + name + " created";

  res.redirect("/admin/access/manage");
});

// ******************************************************************************
// Route handling the update of an access level
// ******************************************************************************

router.post("/update", async (req, res) => {
  const { accessid, name, description } = req.body;
  const access = await prisma.access.update({
    where: { id: Number(accessid) },
    data: { name: name, description: description },
  });

  logger.logThat("Access level " + name + " update by " + req.session.username);
  req.session.notification = "Success: Access level " + name + " updated";

  res.redirect("/admin/access/manage");
});

module.exports = router;
