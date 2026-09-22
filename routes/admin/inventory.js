const express = require("express");
const router = express.Router();

const asyncHandler = require("../../middleware/asyncHandler.js");
const clearNotification = require("../../middleware/clearNotification.js");
const isAdmin = require("../../middleware/checkAdmin.js");
const isAuthenticated = require("../../middleware/checkSession.js");
const { invalidateCache } = require("../../middleware/cacheHelper.js");
const inventoryService = require("../../services/inventoryService.js");
const { inventoryCheckoutSchema } = require("../../schemas/inventory.schema.js");
const { prisma } = require("../../utilities/db.js");

// ******************************************************************************
// API: Get inventory items (consumables + equipment) for modals
// Accessible to logged-in staff and admins
// ******************************************************************************

router.get(
  "/items",
  isAuthenticated,
  asyncHandler(async (req, res) => {
    const items = await inventoryService.getInventoryItems();
    res.json({ success: true, ...items });
  }),
);

// ******************************************************************************
// Route: Record inventory checkout / write-off (AJAX or Form submission)
// Accessible to logged-in staff and admins
// ******************************************************************************

router.post(
  "/checkout",
  isAuthenticated,
  asyncHandler(async (req, res) => {
    const isJson = req.xhr || (req.headers.accept && req.headers.accept.includes("application/json"));
    const redirectUrl = req.headers.referer || req.session.lastPage || "/admin";

    const parsed = inventoryCheckoutSchema.safeParse(req.body);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map((i) => i.message).join(" ");
      if (isJson) {
        return res.status(400).json({ success: false, message: errorMsg });
      }
      req.session.notification = `Error: ${errorMsg}`;
      return res.redirect(redirectUrl);
    }

    const { itemType, itemId, quantity, reason, equipmentAction, notes } = parsed.data;
    const author = req.session.username || "Staff";

    try {
      let result;
      if (itemType === "CONSUMABLE") {
        result = await inventoryService.checkoutConsumable({
          id: itemId,
          quantity,
          reason,
          notes,
          author,
        });
      } else {
        result = await inventoryService.checkoutEquipment({
          id: itemId,
          action: equipmentAction,
          reason,
          notes,
          author,
        });
      }

      invalidateCache(req);

      const successMsg =
        itemType === "CONSUMABLE"
          ? `Sortie de stock enregistrée : -${quantity} ${result.movement.unit} de "${result.consumable.name}". Nouveau stock : ${result.consumable.stock}.`
          : `Sortie d'équipement enregistrée : "${result.equipment.name}" passé au statut "${result.equipment.status}".`;

      if (isJson) {
        return res.json({ success: true, message: successMsg, movement: result.movement });
      }

      req.session.notification = `Success: ${successMsg}`;
      return res.redirect(redirectUrl);
    } catch (err) {
      console.error("Error during inventory checkout:", err);
      const errMsg = err.message || "Erreur lors de la sortie d'inventaire.";
      if (isJson) {
        return res.status(500).json({ success: false, message: errMsg });
      }
      req.session.notification = `Error: ${errMsg}`;
      return res.redirect(redirectUrl);
    }
  }),
);

// ******************************************************************************
// Admin Protected Routes: Movements history, Export, and Restoration
// ******************************************************************************

router.use(isAdmin);

// Route: Movements history list
router.get(
  "/movements",
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/inventory/movements";

    const { itemType, reason, search, page } = req.query;
    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const limit = 30;
    const offset = (currentPage - 1) * limit;

    const { total, movements } = await inventoryService.getMovements({
      itemType: itemType || undefined,
      reason: reason || undefined,
      search: search || undefined,
      limit,
      offset,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    // KPI Counters
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [monthCount, breakageCount, scrapCount, equipmentOutCount] = await Promise.all([
      prisma.inventoryMovement.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      prisma.inventoryMovement.count({
        where: { reason: { contains: "Casse" } },
      }),
      prisma.inventoryMovement.count({
        where: { reason: { contains: "Rebut" } },
      }),
      prisma.equipment.count({
        where: { status: { in: ["OUT_OF_SERVICE", "DECOMMISSIONED"] } },
      }),
    ]);

    res.render("admin/manage-inventory-movements", {
      movements,
      total,
      currentPage,
      totalPages,
      itemType: itemType || "",
      reason: reason || "",
      search: search || "",
      stats: {
        monthCount,
        breakageCount,
        scrapCount,
        equipmentOutCount,
      },
    });
  }),
);

// Route: Export movements CSV
router.get(
  "/movements/export",
  asyncHandler(async (req, res) => {
    const csvData = await inventoryService.exportMovementsCsv();
    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `inventaire_sorties_${dateStr}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    // Add UTF-8 BOM so Excel opens accents correctly
    res.send("\uFEFF" + csvData);
  }),
);

// Route: Restore an equipment back to AVAILABLE service
router.post(
  "/equipment/restore/:id",
  asyncHandler(async (req, res) => {
    const targetId = Number(req.params.id);
    const author = req.session.username || "Admin";
    const notes = req.body.notes || "Remise en service manuelle";

    try {
      const result = await inventoryService.restoreEquipment({
        id: targetId,
        author,
        notes,
      });

      invalidateCache(req);
      req.session.notification = `Success: L'équipement "${result.equipment.name}" a été remis en service avec succès.`;
    } catch (err) {
      console.error("Error restoring equipment:", err);
      req.session.notification = `Error: Impossible de remettre en service cet équipement (${err.message}).`;
    }

    res.redirect(req.headers.referer || "/admin/equipment/manage");
  }),
);

module.exports = router;
