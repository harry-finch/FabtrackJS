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
// Route to manage project types (university project, personal project...)
// ******************************************************************************

router.get(
  "/manage",
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/projecttypes/manage";

    const projecttypes = await prisma.projecttype.findMany({});

    res.render("admin/manage-projecttypes", {
      projecttypes,
    });
  }),
);

// ******************************************************************************
// Route to delete a project type
// ******************************************************************************

router.get(
  "/delete/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await prisma.projecttype.delete({
      where: { id: Number(id) },
    });

    logger.logThat("Projecttype " + result.name + " deleted by " + req.session.username);

    req.session.notification = "Success: Project type " + result.name + " deleted";
    res.redirect(req.session.lastPage);
  }),
);

// ******************************************************************************
// Route to create a project type
// ******************************************************************************

router.post(
  "/create",
  asyncHandler(async (req, res) => {
    const { name } = req.body;
    const projecttype = await prisma.projecttype.create({
      data: { name: name },
    });

    logger.logThat("Projecttype " + name + " created by " + req.session.username);

    req.session.notification = "Success: Project type " + name + " created";
    res.redirect("/admin/projecttypes/manage");
  }),
);

// ******************************************************************************
// Route to update a project type
// ******************************************************************************

router.post(
  "/update",
  asyncHandler(async (req, res) => {
    const { projecttypeid, name } = req.body;

    const projecttype = await prisma.projecttype.update({
      where: { id: Number(projecttypeid) },
      data: { name: name },
    });

    logger.logThat("Project type " + name + " update by " + req.session.username);

    req.session.notification = "Success: Project type " + name + " updated";
    res.redirect("/admin/projecttypes/manage");
  }),
);

module.exports = router;
