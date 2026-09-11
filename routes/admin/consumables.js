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
    const { name, cost, stock, reorderThreshold, categoryId, unit, stockUnit, unitsPerPack } = req.body;

    const parsedCost = parseFloat(cost) || 0.0;
    const parsedStock = parseInt(stock, 10) || 0;
    const parsedThreshold = parseInt(reorderThreshold, 10) || 10;
    const parsedCategoryId = categoryId && categoryId !== "" && categoryId !== "null" ? Number(categoryId) : null;
    const parsedUnit = (unit || "u").trim();
    const parsedStockUnit = (stockUnit || "u").trim();
    const parsedUnitsPerPack = parseFloat(unitsPerPack) > 0 ? parseFloat(unitsPerPack) : 1.0;
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
          unit: parsedUnit,
          stockUnit: parsedStockUnit,
          unitsPerPack: parsedUnitsPerPack,
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

    const { name, cost, stock, reorderThreshold, categoryId, unit, stockUnit, unitsPerPack } = req.body;

    const parsedCost = parseFloat(cost) || 0.0;
    const parsedStock = parseInt(stock, 10) || 0;
    const parsedThreshold = parseInt(reorderThreshold, 10) || 10;
    const parsedCategoryId = categoryId && categoryId !== "" && categoryId !== "null" ? Number(categoryId) : null;
    const parsedUnit = unit ? unit.trim() : undefined;
    const parsedStockUnit = stockUnit ? stockUnit.trim() : undefined;
    const parsedUnitsPerPack = unitsPerPack ? (parseFloat(unitsPerPack) > 0 ? parseFloat(unitsPerPack) : 1.0) : undefined;
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
          unit: parsedUnit,
          stockUnit: parsedStockUnit,
          unitsPerPack: parsedUnitsPerPack,
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
// Route to record a stock delivery (Livraison) with packaging conversion
// ******************************************************************************

router.post(
  "/restock",
  asyncHandler(async (req, res) => {
    const targetId = Number(req.body.consumableid || req.body.id);

    if (!targetId || isNaN(targetId)) {
      req.session.notification = "Error: Invalid consumable ID provided.";
      return res.redirect("/admin/consumables/manage");
    }

    try {
      const existing = await prisma.consumable.findUnique({ where: { id: targetId } });
      if (!existing) {
        req.session.notification = "Error: Consumable not found.";
        return res.redirect("/admin/consumables/manage");
      }

      const ratio = Number(existing.unitsPerPack || 1);
      let addedUnits = 0;

      if (req.body.restockMode === "packs" && req.body.packages) {
        const packs = parseFloat(req.body.packages);
        if (isNaN(packs) || packs <= 0) {
          req.session.notification = "Error: Invalid number of packages.";
          return res.redirect("/admin/consumables/manage");
        }
        addedUnits = Math.round(packs * ratio);
      } else {
        addedUnits = parseInt(req.body.quantity, 10);
        if (isNaN(addedUnits) || addedUnits <= 0) {
          req.session.notification = "Error: Invalid quantity entered.";
          return res.redirect("/admin/consumables/manage");
        }
      }

      const newStock = existing.stock + addedUnits;
      const newStatus = computeStatus(newStock, existing.reorderThreshold);

      const updated = await prisma.consumable.update({
        where: { id: targetId },
        data: {
          stock: newStock,
          status: newStatus,
        },
      });

      invalidateCache(req);
      const packsEquiv = ratio > 1 ? ` (~${(addedUnits / ratio).toFixed(2)} ${existing.stockUnit || "packs"})` : "";
      logger.logThat(
        `Livraison: Added ${addedUnits} ${existing.unit}${packsEquiv} to consumable "${updated.name}" by ${req.session.username}`
      );
      req.session.notification = `Success: Delivery recorded! Added +${addedUnits} ${existing.unit}${packsEquiv} to "${updated.name}". New stock: ${updated.stock} ${existing.unit}.`;
    } catch (error) {
      console.error("Error recording delivery for consumable:", error);
      req.session.notification = "Error: Failed to record delivery.";
    }

    res.redirect("/admin/consumables/manage");
  }),
);

module.exports = router;
