const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const isAdmin = require("../../middleware/checkAdmin.js");
const clearNotification = require("../../middleware/clearNotification.js");
const asyncHandler = require("../../middleware/asyncHandler.js");
const settingsService = require("../../services/settingsService.js");
const hookManager = require("../../core/HookManager.js");

const router = express.Router();
router.use(isAdmin);

// Multer storage for branding uploads
const uploadsDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const prefix = file.fieldname === "favicon" ? "favicon-" : "logo-";
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, prefix + uniqueSuffix + path.extname(file.originalname).toLowerCase());
  },
});

const fileFilter = (req, file, cb) => {
  const allowedLogoExts = [".png", ".jpg", ".jpeg", ".svg", ".webp"];
  const allowedFaviconExts = [".ico", ".png", ".svg"];
  const ext = path.extname(file.originalname).toLowerCase();

  if (file.fieldname === "favicon") {
    if (allowedFaviconExts.includes(ext)) {
      return cb(null, true);
    }
    return cb(new Error("Invalid favicon format. Please upload .ico, .png, or .svg"));
  }

  if (allowedLogoExts.includes(ext)) {
    return cb(null, true);
  }
  return cb(new Error("Invalid logo format. Please upload .png, .jpg, .svg, or .webp"));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB max
});

// ******************************************************************************
// GET /admin/settings: Settings management dashboard
// ******************************************************************************
router.get(
  "/",
  clearNotification,
  asyncHandler(async (req, res) => {
    const settings = await settingsService.getSettings();
    const plugins = hookManager.getAllPlugins();

    res.render("admin/manage-settings", {
      settings,
      plugins,
    });
  }),
);

// ******************************************************************************
// POST /admin/settings: Save settings and branding files
// ******************************************************************************
router.post(
  "/",
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "favicon", maxCount: 1 },
  ]),
  asyncHandler(async (req, res) => {
    const current = await settingsService.getSettings();
    const updates = {};

    // Text fields
    if (req.body.platform_name !== undefined) {
      updates.platform_name = req.body.platform_name.trim() || "FabtrackJS";
    }
    if (req.body.platform_subtitle !== undefined) {
      updates.platform_subtitle = req.body.platform_subtitle.trim() || "Track your fablab's activity";
    }
    if (req.body.session_timeout_hours !== undefined) {
      const hours = parseInt(req.body.session_timeout_hours, 10);
      updates.session_timeout_hours = !isNaN(hours) && hours > 0 ? String(hours) : "24";
    }
    if (req.body.currency_symbol !== undefined) {
      updates.currency_symbol = req.body.currency_symbol.trim() || "€";
    }
    if (req.body.admin_email !== undefined) {
      updates.admin_email = req.body.admin_email.trim() || "admin@example.com";
    }
    if (req.body.allow_self_registration !== undefined) {
      updates.allow_self_registration = req.body.allow_self_registration === "true" ? "true" : "false";
    }

    // Logo choice
    if (req.body.platform_logo_type) {
      updates.platform_logo_type = req.body.platform_logo_type;
    }

    // New Logo upload
    if (req.files && req.files["logo"] && req.files["logo"][0]) {
      updates.platform_logo_path = "/uploads/" + req.files["logo"][0].filename;
      updates.platform_logo_type = "custom";
    }

    // New Favicon upload
    if (req.files && req.files["favicon"] && req.files["favicon"][0]) {
      updates.platform_favicon_path = "/uploads/" + req.files["favicon"][0].filename;
    }

    // Plugins management
    const isUeEnabled = req.body.plugin_ue_enabled === "true" || req.body.plugin_ue_enabled === "on";
    updates.plugin_ue_enabled = isUeEnabled ? "true" : "false";
    hookManager.setPluginEnabled("ue", isUeEnabled);

    const isRfidEnabled = req.body.plugin_rfid_enabled === "true" || req.body.plugin_rfid_enabled === "on";
    updates.plugin_rfid_enabled = isRfidEnabled ? "true" : "false";
    hookManager.setPluginEnabled("rfid", isRfidEnabled);

    await settingsService.updateSettings(updates);

    req.session.notification = "Success: Platform settings updated successfully.";
    res.redirect("/admin/settings");
  }),
);

// ******************************************************************************
// POST /admin/settings/reset-logo: Revert to default Sorbonne Université logo
// ******************************************************************************
router.post(
  "/reset-logo",
  asyncHandler(async (req, res) => {
    await settingsService.updateSettings({
      platform_logo_type: "default",
      platform_logo_path: "",
    });

    req.session.notification = "Success: Logo reset to default Sorbonne Université SVG.";
    res.redirect("/admin/settings");
  }),
);

// ******************************************************************************
// POST /admin/settings/reset-favicon: Revert to default favicon
// ******************************************************************************
router.post(
  "/reset-favicon",
  asyncHandler(async (req, res) => {
    await settingsService.updateSettings({
      platform_favicon_path: "",
    });

    req.session.notification = "Success: Favicon reset to default.";
    res.redirect("/admin/settings");
  }),
);

module.exports = router;
