const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const isAdmin = require("../../middleware/checkAdmin.js");
const clearNotification = require("../../middleware/clearNotification.js");
const asyncHandler = require("../../middleware/asyncHandler.js");
const settingsService = require("../../services/settingsService.js");
const hookManager = require("../../core/HookManager.js");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const repairCafeService = require("../../services/repairCafeService.js");
const workshopService = require("../../services/workshopService.js");
const i18nService = require("../../services/i18nService.js");
const dateService = require("../../services/dateService.js");

const router = express.Router();
router.use(isAdmin);

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".csv" || file.mimetype === "text/csv" || file.mimetype === "application/vnd.ms-excel") {
      return cb(null, true);
    }
    return cb(new Error("Veuillez importer un fichier CSV (.csv)."));
  },
});

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
    const loadPlugins = require("../../core/pluginLoader.js");
    if (hookManager.getAllPlugins().length === 0) {
      loadPlugins();
    }
    const plugins = hookManager.getAllPlugins();
    const projecttypes = await prisma.projecttype.findMany({ orderBy: { name: "asc" } });

    res.render("admin/manage-settings", {
      settings,
      plugins,
      projecttypes,
      validDateFormats: dateService.VALID_FORMATS,
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
    const validLocales = i18nService.getAvailableLocales();
    if (req.body.default_language !== undefined && validLocales.includes(req.body.default_language)) {
      updates.default_language = req.body.default_language;
    }
    if (req.body.date_format !== undefined && dateService.VALID_FORMAT_VALUES.includes(req.body.date_format)) {
      updates.date_format = req.body.date_format;
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

    // Plugins management - ONLY process if the plugins section was present in the submitted form
    if (req.body.plugin_settings_submitted === "true") {
      const isUeEnabled = req.body.plugin_ue_enabled === "true" || req.body.plugin_ue_enabled === "on";
      updates.plugin_ue_enabled = isUeEnabled ? "true" : "false";
      hookManager.setPluginEnabled("ue", isUeEnabled);

      const isRfidEnabled = req.body.plugin_rfid_enabled === "true" || req.body.plugin_rfid_enabled === "on";
      updates.plugin_rfid_enabled = isRfidEnabled ? "true" : "false";
      hookManager.setPluginEnabled("rfid", isRfidEnabled);

      const isBookstackEnabled = req.body.plugin_bookstack_enabled === "true" || req.body.plugin_bookstack_enabled === "on";
      updates.plugin_bookstack_enabled = isBookstackEnabled ? "true" : "false";
      hookManager.setPluginEnabled("bookstack", isBookstackEnabled);

      const isRepairCafeEnabled = req.body.plugin_repaircafe_enabled === "true" || req.body.plugin_repaircafe_enabled === "on";
      updates.plugin_repaircafe_enabled = isRepairCafeEnabled ? "true" : "false";
      hookManager.setPluginEnabled("repaircafe", isRepairCafeEnabled);

      const isWorkshopEnabled = req.body.plugin_workshop_enabled === "true" || req.body.plugin_workshop_enabled === "on";
      updates.plugin_workshop_enabled = isWorkshopEnabled ? "true" : "false";
      hookManager.setPluginEnabled("workshop", isWorkshopEnabled);

      const isSorbonneEnabled = req.body.plugin_sorbonne_enabled === "true" || req.body.plugin_sorbonne_enabled === "on";
      updates.plugin_sorbonne_enabled = isSorbonneEnabled ? "true" : "false";
      hookManager.setPluginEnabled("sorbonne", isSorbonneEnabled);
    }

    // Associated project type names for plugins
    if (req.body.repaircafe_projecttype_name !== undefined) {
      updates.repaircafe_projecttype_name = req.body.repaircafe_projecttype_name.trim() || "Repair Café";
    }
    if (req.body.workshop_projecttype_name !== undefined) {
      updates.workshop_projecttype_name = req.body.workshop_projecttype_name.trim() || "Atelier";
    }
    if (req.body.ue_projecttype_name !== undefined) {
      updates.ue_projecttype_name = req.body.ue_projecttype_name.trim() || "Academic";
    }
    if (req.body.sorbonne_projecttype_name !== undefined) {
      updates.sorbonne_projecttype_name = req.body.sorbonne_projecttype_name.trim() || "Sorbonne";
    }

    // Natural Language AI Query settings
    if (req.body.ai_provider !== undefined) {
      updates.ai_provider = req.body.ai_provider;
    }
    if (req.body.ai_openai_api_key !== undefined) {
      updates.ai_openai_api_key = req.body.ai_openai_api_key.trim();
    }
    if (req.body.ai_openai_model !== undefined) {
      updates.ai_openai_model = req.body.ai_openai_model.trim() || "gpt-4o-mini";
    }
    if (req.body.ai_gemini_api_key !== undefined) {
      updates.ai_gemini_api_key = req.body.ai_gemini_api_key.trim();
    }
    if (req.body.ai_gemini_model !== undefined) {
      updates.ai_gemini_model = req.body.ai_gemini_model.trim() || "gemini-1.5-flash";
    }
    if (req.body.ai_anthropic_api_key !== undefined) {
      updates.ai_anthropic_api_key = req.body.ai_anthropic_api_key.trim();
    }
    if (req.body.ai_anthropic_model !== undefined) {
      updates.ai_anthropic_model = req.body.ai_anthropic_model.trim() || "claude-3-5-haiku-20241022";
    }
    if (req.body.ai_local_url !== undefined) {
      updates.ai_local_url = req.body.ai_local_url.trim() || "http://localhost:11434/v1";
    }
    if (req.body.ai_local_model !== undefined) {
      updates.ai_local_model = req.body.ai_local_model.trim() || "llama3.2";
    }
    if (req.body.ai_local_api_key !== undefined) {
      updates.ai_local_api_key = req.body.ai_local_api_key.trim();
    }

    await settingsService.updateSettings(updates);

    // Automatically ensure project types exist in the database
    await repairCafeService.ensureProjectType();
    await workshopService.ensureProjectType();
    const sorbonneService = require("../../services/sorbonneService");
    await sorbonneService.ensureProjectType();
    if (updates.ue_projecttype_name) {
      const existingUe = await prisma.projecttype.findFirst({
        where: { name: { equals: updates.ue_projecttype_name } },
      });
      if (!existingUe) {
        await prisma.projecttype.create({
          data: { name: updates.ue_projecttype_name },
        });
      }
    }

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

// ******************************************************************************
// GET /admin/settings/i18n/export: Download translations.csv
// ******************************************************************************
router.get(
  "/i18n/export",
  asyncHandler(async (req, res) => {
    const csvContent = i18nService.exportToCsvString();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="translations.csv"');
    res.send(csvContent);
  }),
);

// ******************************************************************************
// POST /admin/settings/i18n/import: Upload and import translations.csv
// ******************************************************************************
router.post(
  "/i18n/import",
  csvUpload.single("translations_file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      req.session.notification = "Error: Aucun fichier CSV sélectionné.";
      return res.redirect("/admin/settings");
    }

    try {
      const csvText = req.file.buffer.toString("utf8");
      const result = i18nService.importFromCsvString(csvText);
      const newLangMsg = result.newLocales && result.newLocales.length > 0
        ? ` Nouvelle(s) langue(s) créée(s) : ${result.newLocales.map((l) => l.toUpperCase()).join(", ")} !`
        : "";
      req.session.notification = `Success: Traductions importées avec succès (${result.totalKeys} clés dans ${result.localesUpdated.map((l) => l.toUpperCase()).join(", ")}).${newLangMsg}`;
    } catch (err) {
      console.error("Erreur lors de l'import i18n CSV:", err);
      req.session.notification = `Error: Échec de l'import des traductions : ${err.message}`;
    }
    res.redirect("/admin/settings");
  }),
);

// ******************************************************************************
// POST /admin/settings/ai/test-connection: Test AI provider connectivity
// ******************************************************************************
router.post(
  "/ai/test-connection",
  express.json(),
  asyncHandler(async (req, res) => {
    const aiQueryService = require("../../services/aiQueryService");
    try {
      const customConfig = {
        provider: req.body.ai_provider,
        openaiApiKey: req.body.ai_openai_api_key,
        openaiModel: req.body.ai_openai_model,
        geminiApiKey: req.body.ai_gemini_api_key,
        geminiModel: req.body.ai_gemini_model,
        anthropicApiKey: req.body.ai_anthropic_api_key,
        anthropicModel: req.body.ai_anthropic_model,
        localUrl: req.body.ai_local_url,
        localModel: req.body.ai_local_model,
        localApiKey: req.body.ai_local_api_key,
      };
      const result = await aiQueryService.testConnection(customConfig);
      res.json({ success: true, message: result.message });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }),
);

module.exports = router;
