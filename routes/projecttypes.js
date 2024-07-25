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
// Route handling the admin page managing project types (university project, personal project...)
//
// >>> Rendering route
// ******************************************************************************

router.get("/manage", async (req, res) => {
  const notification = req.session.notification;
  req.session.notification = "";
  req.session.lastPage = "/admin/projecttypes/manage";

  const allTypes = await prisma.projecttype.findMany({});

  res.render("admin/manage-projecttypes", {
    notification: notification,
    role: req.session.role,
    projecttypes: allTypes,
  });
});

// ******************************************************************************
// Route handling the deletion of a projecttype
// ******************************************************************************

router.get("/delete/:id", async (req, res) => {
  const { id } = req.params;
  const result = await prisma.projecttype.delete({
    where: { id: Number(id) },
  });

  logger.logThat(
    "Projecttype " + result.name + " deleted by " + req.session.username,
  );
  req.session.notification =
    "Success: Project type " + result.name + " deleted";

  res.redirect(req.session.lastPage);
});

// ******************************************************************************
// Route handling the creation of a project type
// ******************************************************************************

router.post("/create", async (req, res) => {
  const { name } = req.body;
  const projecttype = await prisma.projecttype.create({
    data: { name: name },
  });

  logger.logThat("Projecttype " + name + " created by " + req.session.username);
  req.session.notification = "Success: Project type " + name + " created";

  res.redirect("/admin/projecttypes/manage");
});

// ******************************************************************************
// Route handling the update of a project type
// ******************************************************************************

router.post("/update", async (req, res) => {
  const { projecttypeid, name } = req.body;
  const projecttype = await prisma.projecttype.update({
    where: { id: Number(projecttypeid) },
    data: { name: name },
  });

  logger.logThat("Project type " + name + " update by " + req.session.username);
  req.session.notification = "Success: Project type " + name + " updated";

  res.redirect("/admin/projecttypes/manage");
});

module.exports = router;
