const express = require("express");
const multer = require("multer");
const path = require("path");
const moment = require("moment");
const isAdmin = require("../../middleware/checkAdmin.js");
const clearNotification = require("../../middleware/clearNotification.js");
const asyncHandler = require("../../middleware/asyncHandler.js");
const historyImportService = require("../../services/historyImportService.js");
const { prisma } = require("../../utilities/db.js");

const router = express.Router();
router.use(isAdmin);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 Mo max
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (
      ext === ".csv" ||
      ext === ".txt" ||
      file.mimetype === "text/csv" ||
      file.mimetype === "text/plain" ||
      file.mimetype === "application/vnd.ms-excel"
    ) {
      return cb(null, true);
    }
    return cb(new Error("Format de fichier non pris en charge. Veuillez téléverser un fichier CSV (.csv)."));
  },
});

// ******************************************************************************
// GET /admin/history : Redirige vers la vue historique générale
// ******************************************************************************
router.get("/", (req, res) => {
  res.redirect("/admin/view-history");
});

// ******************************************************************************
// GET /admin/history/import : Interface d'importation CSV
// ******************************************************************************
router.get(
  "/import",
  clearNotification,
  asyncHandler(async (req, res) => {
    const workspaces = await prisma.workspace.findMany({ orderBy: { name: "asc" } });
    const projecttypes = await prisma.projecttype.findMany({ orderBy: { name: "asc" } });
    const usertypes = await prisma.usertype.findMany({ orderBy: { name: "asc" } });

    res.render("admin/import-history", {
      workspaces,
      projecttypes,
      usertypes,
      todayDate: moment().format("YYYY-MM-DD"),
    });
  }),
);

// ******************************************************************************
// GET /admin/history/template : Téléchargement du fichier modèle CSV
// ******************************************************************************
router.get(
  "/template",
  asyncHandler(async (req, res) => {
    const csvContent = historyImportService.generateCsvTemplate();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="modele_import_seance_fablab.csv"');
    res.send("\uFEFF" + csvContent); // Préfixe BOM UTF-8 pour ouverture parfaite dans Excel
  }),
);

// ******************************************************************************
// POST /admin/history/preview : Analyse et prévisualisation du fichier CSV
// ******************************************************************************
router.post(
  "/preview",
  upload.single("csv_file"),
  asyncHandler(async (req, res) => {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: "Veuillez sélectionner un fichier CSV.",
      });
    }

    try {
      const csvText = req.file.buffer.toString("utf-8");
      const options = {
        defaultDate: req.body.default_date,
        defaultArrival: req.body.default_arrival,
        defaultDeparture: req.body.default_departure,
        defaultProjectType: req.body.default_project_type,
        defaultWorkspaceId: req.body.default_workspace_id,
        defaultUserTypeId: req.body.default_usertype_id,
      };

      const analysis = await historyImportService.analyzeImport(csvText, options);
      res.json({
        success: true,
        data: analysis,
      });
    } catch (err) {
      console.error("[routes/admin/history/preview] Erreur d'analyse CSV :", err);
      res.status(400).json({
        success: false,
        message: err.message,
      });
    }
  }),
);

// ******************************************************************************
// POST /admin/history/execute : Exécution de l'importation validée
// ******************************************************************************
router.post(
  "/execute",
  express.json({ limit: "15mb" }),
  asyncHandler(async (req, res) => {
    const { items, options } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Aucune donnée à importer.",
      });
    }

    try {
      const result = await historyImportService.executeImport(
        items,
        options || {},
        req.session.username || "Admin",
      );
      res.json(result);
    } catch (err) {
      console.error("[routes/admin/history/execute] Erreur d'exécution :", err);
      res.status(500).json({
        success: false,
        message: err.message || "Une erreur est survenue lors de l'enregistrement des données.",
      });
    }
  }),
);

module.exports = router;
