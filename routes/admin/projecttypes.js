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
// Route to manage project types (university project, personal project...)
// ******************************************************************************

router.get(
  "/manage",
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/projecttypes/manage";

    const projecttypes = await prisma.projecttype.findMany({
      orderBy: { id: "asc" },
    });

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

    try {
      const result = await prisma.projecttype.delete({
        where: { id: Number(id) },
      });

      invalidateCache(req);
      logger.logThat("Projecttype " + result.name + " deleted by " + req.session.username);
      req.session.notification = "Success: Project type " + result.name + " deleted";
    } catch (error) {
      console.error("Error deleting project type:", error);
      req.session.notification = "Error: Failed to delete project type (check linked projects)";
    }

    res.redirect(req.session.lastPage || "/admin/projecttypes/manage");
  }),
);

// ******************************************************************************
// Route to create a project type
// ******************************************************************************

router.post(
  "/create",
  asyncHandler(async (req, res) => {
    const { name } = req.body;

    try {
      const projecttype = await prisma.projecttype.create({
        data: { name: name.trim() },
      });

      invalidateCache(req);
      logger.logThat("Projecttype " + name + " created by " + req.session.username);
      req.session.notification = "Success: Project type " + name + " created";
    } catch (error) {
      console.error("Error creating project type:", error);
      req.session.notification = "Error: Failed to create project type";
    }

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

    try {
      const projecttype = await prisma.projecttype.update({
        where: { id: Number(projecttypeid) },
        data: { name: name.trim() },
      });

      invalidateCache(req);
      logger.logThat("Project type " + name + " updated by " + req.session.username);
      req.session.notification = "Success: Project type " + name + " updated";
    } catch (error) {
      console.error("Error updating project type:", error);
      req.session.notification = "Error: Failed to update project type";
    }

    res.redirect("/admin/projecttypes/manage");
  }),
);

module.exports = router;
