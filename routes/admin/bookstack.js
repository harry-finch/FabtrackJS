const express = require("express");
const isAdmin = require("../../middleware/checkAdmin.js");
const clearNotification = require("../../middleware/clearNotification.js");
const asyncHandler = require("../../middleware/asyncHandler.js");
const settingsService = require("../../services/settingsService.js");
const bookstackService = require("../../services/bookstackService.js");

const router = express.Router();
router.use(isAdmin);

// ******************************************************************************
// GET /admin/bookstack: BookStack Wiki Configuration & Documentation Stats
// ******************************************************************************
router.get(
  "/",
  clearNotification,
  asyncHandler(async (req, res) => {
    const settings = await settingsService.getSettings();
    const stats = await bookstackService.getOverallDocumentationStats();
    const hasTokenSecret = Boolean(settings.bookstack_token_secret && settings.bookstack_token_secret.trim());

    res.render("admin/manage-bookstack", {
      settings,
      stats,
      hasTokenSecret,
    });
  }),
);

// ******************************************************************************
// POST /admin/bookstack/settings: Save BookStack API settings and preferences
// ******************************************************************************
router.post(
  "/settings",
  asyncHandler(async (req, res) => {
    const current = await settingsService.getSettings();
    const updates = {};

    updates.plugin_bookstack_enabled =
      req.body.plugin_bookstack_enabled === "true" || req.body.plugin_bookstack_enabled === "on" ? "true" : "false";

    if (req.body.bookstack_url !== undefined) {
      let url = req.body.bookstack_url.trim();
      if (url && !url.endsWith("/")) url += "/";
      updates.bookstack_url = url || "https://wiki.fablab.sorbonne-universite.fr/BookStack/";
    }

    if (req.body.bookstack_token_id !== undefined) {
      updates.bookstack_token_id = req.body.bookstack_token_id.trim();
    }

    if (req.body.bookstack_token_secret !== undefined && req.body.bookstack_token_secret.trim() !== "") {
      updates.bookstack_token_secret = req.body.bookstack_token_secret.trim();
    }

    updates.bookstack_auto_prefill =
      req.body.bookstack_auto_prefill === "true" || req.body.bookstack_auto_prefill === "on" ? "true" : "false";

    await settingsService.updateSettings(updates);

    req.session.notification = "Success: Configuration du plugin BookStack enregistrée avec succès.";
    res.redirect("/admin/bookstack");
  }),
);

// ******************************************************************************
// POST /admin/bookstack/test: Live API connection test to BookStack
// ******************************************************************************
router.post(
  "/test",
  asyncHandler(async (req, res) => {
    const result = await bookstackService.testConnection();

    if (result.success) {
      req.session.notification = `Success: ${result.message} (${result.totalBooks} livre(s) détecté(s)).`;
    } else {
      req.session.notification = `Error: ${result.error}`;
    }

    res.redirect("/admin/bookstack");
  }),
);

module.exports = router;
