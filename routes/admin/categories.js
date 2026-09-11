const express = require("express");
const router = express.Router();

const asyncHandler = require("../../middleware/asyncHandler.js");
const clearNotification = require("../../middleware/clearNotification.js");
const isAdmin = require("../../middleware/checkAdmin.js");
const { invalidateCache } = require("../../middleware/cacheHelper.js");

router.use(isAdmin);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const logger = require("../../utilities/simpleLogger.js");

// ******************************************************************************
// Route to manage categories
// ******************************************************************************

router.get(
  "/manage",
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/categories/manage";

    const categories = await prisma.category.findMany({
      include: { workspace: true },
      orderBy: { id: "asc" },
    });

    const workspaces = await prisma.workspace.findMany();

    res.render("admin/manage-categories", {
      categories,
      workspaces,
    });
  }),
);

// ******************************************************************************
// Route to delete a category
// ******************************************************************************

router.get(
  "/delete/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
      const result = await prisma.category.delete({
        where: { id: Number(id) },
      });

      invalidateCache(req);
      logger.logThat("Category " + result.name + " deleted by " + req.session.username);
      req.session.notification = "Success: Category " + result.name + " deleted";
    } catch (error) {
      console.error("Error deleting category:", error);
      req.session.notification = "Error: Failed to delete category";
    }

    res.redirect(req.session.lastPage || "/admin/categories/manage");
  }),
);

// ******************************************************************************
// Route to create a category
// ******************************************************************************

router.post(
  "/create",
  asyncHandler(async (req, res) => {
    const { name, workspaceId } = req.body;

    let wsId = workspaceId ? parseInt(workspaceId, 10) : null;
    if (!wsId) {
      const firstWs = await prisma.workspace.findFirst();
      wsId = firstWs ? firstWs.id : null;
    }

    if (!wsId) {
      req.session.notification = "Error: A workspace must exist before creating a category.";
      return res.redirect("/admin/categories/manage");
    }

    try {
      const category = await prisma.category.create({
        data: {
          name: name.trim(),
          workspaceId: wsId,
        },
      });

      invalidateCache(req);
      logger.logThat("Category " + name + " created by " + req.session.username);
      req.session.notification = "Success: Category " + name + " created";
    } catch (error) {
      console.error("Error creating category:", error);
      req.session.notification = "Error: Failed to create category";
    }

    res.redirect("/admin/categories/manage");
  }),
);

// ******************************************************************************
// Route to update a category
// ******************************************************************************

router.post(
  "/update",
  asyncHandler(async (req, res) => {
    const { categoryid, name, workspaceId } = req.body;

    let wsId = workspaceId ? parseInt(workspaceId, 10) : null;
    if (!wsId) {
      const current = await prisma.category.findUnique({ where: { id: Number(categoryid) } });
      wsId = current ? current.workspaceId : null;
    }

    try {
      const category = await prisma.category.update({
        where: { id: Number(categoryid) },
        data: {
          name: name.trim(),
          workspaceId: wsId,
        },
      });

      invalidateCache(req);
      logger.logThat("Category " + name + " updated by " + req.session.username);
      req.session.notification = "Success: Category " + name + " updated";
    } catch (error) {
      console.error("Error updating category:", error);
      req.session.notification = "Error: Failed to update category";
    }

    res.redirect("/admin/categories/manage");
  }),
);

module.exports = router;
