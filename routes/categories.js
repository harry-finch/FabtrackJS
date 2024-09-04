// ******************************************************************************
// This router handles the routes for managing categories
// ******************************************************************************

const express = require("express");
const router = express.Router();

const isAdmin = require("../middleware/checkAdmin.js"); // Assuming you have an isAdmin middleware
router.use(isAdmin);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const logger = require("../utilities/simpleLogger.js"); // Assuming you have a simpleLogger utility

// ******************************************************************************
// Route handling the admin page managing categories
// ******************************************************************************

router.get("/manage", async (req, res) => {
  const notification = req.session.notification;
  req.session.notification = "";
  req.session.lastPage = "/admin/categories/manage";

  const categories = await prisma.category.findMany({
    include: { workspace: true }, // Include workspace details if needed
  });

  // Fetch workspaces for potential association (if applicable)
  const workspaces = await prisma.workspace.findMany();

  res.render("admin/manage-categories", {
    notification: notification,
    role: req.session.role,
    categories: categories,
    workspaces: workspaces, // Pass workspaces to the template
  });
});

// ******************************************************************************
// Route handling the deletion of a category
// ******************************************************************************

router.get("/delete/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await prisma.category.delete({
      where: { id: Number(id) },
    });

    logger.logThat(
      "Category " + result.name + " deleted by " + req.session.username,
    );
    req.session.notification = "Success: Category " + result.name + " deleted";
  } catch (error) {
    console.error("Error deleting category:", error);
    req.session.notification = "Error: Failed to delete category";
  }

  res.redirect(req.session.lastPage);
});

// ******************************************************************************
// Route handling the creation of a category
// ******************************************************************************

router.post("/create", async (req, res) => {
  const { name, workspaceId } = req.body;

  try {
    const category = await prisma.category.create({
      data: {
        name: name,
        workspaceId: workspaceId ? parseInt(workspaceId) : null, // Handle optional workspaceId
      },
    });

    logger.logThat("Category " + name + " created by " + req.session.username);
    req.session.notification = "Success: Category " + name + " created";
  } catch (error) {
    console.error("Error creating category:", error);
    req.session.notification = "Error: Failed to create category";
  }

  res.redirect("/admin/categories/manage");
});

// ******************************************************************************
// Route handling the update of a category
// ******************************************************************************

router.post("/update", async (req, res) => {
  const { categoryid, name, workspaceId } = req.body;

  try {
    const category = await prisma.category.update({
      where: { id: Number(categoryid) },
      data: {
        name: name,
        workspaceId: workspaceId ? parseInt(workspaceId) : null,
      },
    });

    logger.logThat("Category " + name + " updated by " + req.session.username);
    req.session.notification = "Success: Category " + name + " updated";
  } catch (error) {
    console.error("Error updating category:", error);
    req.session.notification = "Error: Failed to update category";
  }

  res.redirect("/admin/categories/manage");
});

module.exports = router;
