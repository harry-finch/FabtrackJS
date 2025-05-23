const express = require("express");
const router = express.Router();

const asyncHandler = require("../../middleware/asyncHandler.js");
const clearNotification = require("../../middleware/clearNotification.js");
const isAdmin = require("../../middleware/checkAdmin.js");
router.use(isAdmin);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const logger = require("../../utilities/simpleLogger.js");

// ******************************************************************************
// Route to manage consumables
// ******************************************************************************

router.get(
  "/manage",
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/consumables/manage";

    const consumables = await prisma.consumable.findMany({});

    res.render("admin/manage-consumables", {
      consumables,
    });
  }),
);

// ******************************************************************************
// Route to delete a consumable
// ******************************************************************************

router.get(
  "/delete/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
      const result = await prisma.consumable.delete({
        where: { id: Number(id) },
      });

      logger.logThat("Consumable " + result.name + " deleted by " + req.session.username);
      req.session.notification = "Success: Consumable " + result.name + " deleted";
    } catch (error) {
      console.error("Error deleting consumable:", error);
      req.session.notification = "Error: Failed to delete consumable";
    }

    res.redirect(req.session.lastPage);
  }),
);

// ******************************************************************************
// Route to create a consumable
// ******************************************************************************

router.post("/create", async (req, res) => {
  const { name, cost } = req.body;

  try {
    const consumable = await prisma.consumable.create({
      data: { name: name, cost: parseFloat(cost) }, // Parse cost to a float
    });

    logger.logThat("Consumable " + name + " created by " + req.session.username);
    req.session.notification = "Success: Consumable " + name + " created";
  } catch (error) {
    console.error("Error creating consumable:", error);
    req.session.notification = "Error: Failed to create consumable";
  }

  res.redirect("/admin/consumables/manage");
});

// ******************************************************************************
// Route to update a consumable
// ******************************************************************************

router.post(
  "/update",
  asyncHandler(async (req, res) => {
    const { consumableid, name, cost } = req.body;

    try {
      const consumable = await prisma.consumable.update({
        where: { id: Number(consumableid) },
        data: { name: name, cost: parseFloat(cost) },
      });

      logger.logThat("Consumable " + name + " updated by " + req.session.username);
      req.session.notification = "Success: Consumable " + name + " updated";
    } catch (error) {
      console.error("Error updating consumable:", error);
      req.session.notification = "Error: Failed to update consumable";
    }

    res.redirect("/admin/consumables/manage");
  }),
);

module.exports = router;
