const express = require("express");
const router = express.Router();

const asyncHandler = require("../../middleware/asyncHandler.js");
const clearNotification = require("../../middleware/clearNotification.js");
const isAdmin = require("../../middleware/checkAdmin.js");
const { invalidateCache } = require("../../middleware/cacheHelper.js");

router.use(isAdmin);

const { PrismaClient, ConsumableStatus } = require("@prisma/client");
const prisma = new PrismaClient();

const logger = require("../../utilities/simpleLogger.js");

function computeStatus(stock, reorderThreshold) {
  if (stock <= 0) return ConsumableStatus.OUT_OF_STOCK;
  if (stock <= reorderThreshold) return ConsumableStatus.LOW_STOCK;
  return ConsumableStatus.AVAILABLE;
}

// ******************************************************************************
// Route to manage consumables
// ******************************************************************************

router.get(
  "/manage",
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/consumables/manage";

    const consumables = await prisma.consumable.findMany({
      orderBy: { id: "asc" },
      include: { category: true },
    });

    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
    });

    res.render("admin/manage-consumables", {
      consumables,
      categories,
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

      invalidateCache(req);
      logger.logThat("Consumable " + result.name + " deleted by " + req.session.username);
      req.session.notification = "Success: Consumable " + result.name + " deleted";
    } catch (error) {
      console.error("Error deleting consumable:", error);
      req.session.notification = "Error: Failed to delete consumable";
    }

    res.redirect(req.session.lastPage || "/admin/consumables/manage");
  }),
);

// ******************************************************************************
// Route to create a consumable
// ******************************************************************************

router.post(
  "/create",
  asyncHandler(async (req, res) => {
    const { name, cost, stock, reorderThreshold, categoryId } = req.body;

    const parsedCost = parseFloat(cost) || 0.0;
    const parsedStock = parseInt(stock, 10) || 0;
    const parsedThreshold = parseInt(reorderThreshold, 10) || 10;
    const parsedCategoryId = categoryId && categoryId !== "" && categoryId !== "null" ? Number(categoryId) : null;
    const status = computeStatus(parsedStock, parsedThreshold);

    try {
      const consumable = await prisma.consumable.create({
        data: {
          name: name.trim(),
          cost: parsedCost,
          stock: parsedStock,
          reorderThreshold: parsedThreshold,
          status: status,
          categoryId: parsedCategoryId,
        },
      });

      invalidateCache(req);
      logger.logThat("Consumable " + name + " created by " + req.session.username);
      req.session.notification = "Success: Consumable " + name + " created";
    } catch (error) {
      console.error("Error creating consumable:", error);
      req.session.notification = "Error: Failed to create consumable (check name uniqueness)";
    }

    res.redirect("/admin/consumables/manage");
  }),
);

// ******************************************************************************
// Route to update a consumable
// ******************************************************************************

router.post(
  "/update",
  asyncHandler(async (req, res) => {
    const targetId = Number(req.body.consumableid || req.body.id);
    if (!targetId || isNaN(targetId)) {
      req.session.notification = "Error: Invalid consumable ID provided.";
      return res.redirect("/admin/consumables/manage");
    }

    const { name, cost, stock, reorderThreshold, categoryId } = req.body;

    const parsedCost = parseFloat(cost) || 0.0;
    const parsedStock = parseInt(stock, 10) || 0;
    const parsedThreshold = parseInt(reorderThreshold, 10) || 10;
    const parsedCategoryId = categoryId && categoryId !== "" && categoryId !== "null" ? Number(categoryId) : null;
    const status = computeStatus(parsedStock, parsedThreshold);

    try {
      const consumable = await prisma.consumable.update({
        where: { id: targetId },
        data: {
          name: name ? name.trim() : undefined,
          cost: parsedCost,
          stock: parsedStock,
          reorderThreshold: parsedThreshold,
          status: status,
          categoryId: parsedCategoryId,
        },
      });

      invalidateCache(req);
      logger.logThat("Consumable " + consumable.name + " updated by " + req.session.username);
      req.session.notification = "Success: Consumable " + consumable.name + " updated";
    } catch (error) {
      console.error("Error updating consumable:", error);
      req.session.notification = "Error: Failed to update consumable";
    }

    res.redirect("/admin/consumables/manage");
  }),
);

// ******************************************************************************
// Route to record a stock delivery (Livraison) without editing the whole consumable
// ******************************************************************************

router.post(
  "/restock",
  asyncHandler(async (req, res) => {
    const targetId = Number(req.body.consumableid || req.body.id);
    const addedQuantity = parseInt(req.body.quantity, 10);

    if (!targetId || isNaN(targetId) || isNaN(addedQuantity) || addedQuantity <= 0) {
      req.session.notification = "Error: Invalid consumable or delivery quantity (must be greater than 0).";
      return res.redirect("/admin/consumables/manage");
    }

    try {
      const existing = await prisma.consumable.findUnique({ where: { id: targetId } });
      if (!existing) {
        req.session.notification = "Error: Consumable not found.";
        return res.redirect("/admin/consumables/manage");
      }

      const newStock = existing.stock + addedQuantity;
      const newStatus = computeStatus(newStock, existing.reorderThreshold);

      const updated = await prisma.consumable.update({
        where: { id: targetId },
        data: {
          stock: newStock,
          status: newStatus,
        },
      });

      invalidateCache(req);
      logger.logThat(
        `Livraison: Added ${addedQuantity} units to consumable "${updated.name}" by ${req.session.username}`
      );
      req.session.notification = `Success: Delivery recorded! Added ${addedQuantity} units to "${updated.name}". New stock: ${updated.stock} units.`;
    } catch (error) {
      console.error("Error recording delivery for consumable:", error);
      req.session.notification = "Error: Failed to record delivery.";
    }

    res.redirect("/admin/consumables/manage");
  }),
);

module.exports = router;
