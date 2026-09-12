const express = require("express");
const isAdmin = require("../../middleware/checkAdmin.js");
const clearNotification = require("../../middleware/clearNotification.js");
const asyncHandler = require("../../middleware/asyncHandler.js");
const settingsService = require("../../services/settingsService.js");
const repairCafeService = require("../../services/repairCafeService.js");

const router = express.Router();
router.use(isAdmin);

// ******************************************************************************
// GET /admin/repair-cafe: Repair Café Dashboard, History, Success Rate & Settings
// ******************************************************************************
router.get(
  "/",
  clearNotification,
  asyncHandler(async (req, res) => {
    const settings = await settingsService.getSettings();
    const stats = await repairCafeService.getRepairStats();
    const statuses = repairCafeService.getStatuses();

    res.render("admin/manage-repaircafe", {
      settings,
      stats,
      statuses,
    });
  }),
);

// ******************************************************************************
// POST /admin/repair-cafe/settings: Save Repair Café plugin settings
// ******************************************************************************
router.post(
  "/settings",
  asyncHandler(async (req, res) => {
    const updates = {};

    updates.plugin_repaircafe_enabled =
      req.body.plugin_repaircafe_enabled === "true" || req.body.plugin_repaircafe_enabled === "on" ? "true" : "false";

    if (req.body.repaircafe_projecttype_name !== undefined) {
      updates.repaircafe_projecttype_name = req.body.repaircafe_projecttype_name.trim() || "Repair Café";
    }

    await settingsService.updateSettings(updates);
    await repairCafeService.ensureProjectType();

    req.session.notification = "Success: Paramètres du Repair Café enregistrés avec succès.";
    res.redirect("/admin/repair-cafe");
  }),
);

// ******************************************************************************
// POST /admin/repair-cafe/update-entry: Update repair outcome/notes
// ******************************************************************************
router.post(
  "/update-entry",
  asyncHandler(async (req, res) => {
    const { historyid, repairObject, repairStatus, repairNotes } = req.body;

    try {
      await repairCafeService.updateRepairEntry(historyid, {
        repairObject,
        repairStatus,
        repairNotes,
      });
      req.session.notification = "Success: Fiche de réparation mise à jour.";
    } catch (err) {
      console.error("Error updating repair entry:", err);
      req.session.notification = "Error: Impossible de mettre à jour la fiche de réparation.";
    }

    res.redirect("/admin/repair-cafe");
  }),
);

module.exports = router;
