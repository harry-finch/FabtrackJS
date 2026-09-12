const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const mailService = require("../services/mailService.js");
const settingsService = require("../services/settingsService.js");
const asyncHandler = require("../middleware/asyncHandler.js");
const logger = require("../utilities/simpleLogger.js");

const router = express.Router();

// Ensure uploads/issues directory exists
const issuesUploadsDir = path.join(__dirname, "../uploads/issues");
if (!fs.existsSync(issuesUploadsDir)) {
  fs.mkdirSync(issuesUploadsDir, { recursive: true });
}

// Multer storage for issue photos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, issuesUploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `issue-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".heic"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext) || file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Format de fichier non pris en charge. Veuillez fournir une image valide (JPG, PNG, WEBP)."));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB
  },
});

// ******************************************************************************
// GET /report-issue (and GET /report-issue/:machineId): Public reporting page
// ******************************************************************************
router.get(
  ["/", "/:machineId"],
  asyncHandler(async (req, res) => {
    const requestedMachineId = req.params.machineId || req.query.machineId || null;

    const machines = await prisma.machine.findMany({
      include: {
        machinetype: true,
        location: true,
        category: true,
      },
      orderBy: [{ name: "asc" }],
    });

    let selectedMachine = null;
    let selectedMachineId = null;

    if (requestedMachineId) {
      const parsedId = parseInt(requestedMachineId, 10);
      if (!isNaN(parsedId)) {
        selectedMachine = machines.find((m) => m.id === parsedId) || null;
        if (selectedMachine) {
          selectedMachineId = selectedMachine.id;
        }
      }
    }

    res.render("public/report-issue", {
      machines,
      selectedMachine,
      selectedMachineId,
      success: req.query.success === "1",
      reportedMachineName: req.query.machineName || "",
      notification: req.session ? req.session.notification : null,
    });
  }),
);

// ******************************************************************************
// POST /report-issue: Submit issue report with optional camera photo
// ******************************************************************************
router.post(
  "/",
  upload.single("photo"),
  asyncHandler(async (req, res) => {
    const { machineId, description, reporterName, reporterEmail } = req.body;

    if (!machineId) {
      req.session.notification = "Error: Veuillez sélectionner une machine.";
      return res.redirect("/report-issue");
    }

    if (!description || !description.trim()) {
      req.session.notification = "Error: Veuillez décrire le problème rencontré.";
      return res.redirect(`/report-issue?machineId=${machineId}`);
    }

    const machine = await prisma.machine.findUnique({
      where: { id: parseInt(machineId, 10) },
      include: {
        machinetype: true,
        location: true,
      },
    });

    if (!machine) {
      req.session.notification = "Error: Machine sélectionnée introuvable.";
      return res.redirect("/report-issue");
    }

    const photoPath = req.file ? `/uploads/issues/${req.file.filename}` : null;

    const issue = await prisma.machineIssue.create({
      data: {
        machineId: machine.id,
        description: description.trim(),
        photoPath,
        reporterName: reporterName && reporterName.trim() ? reporterName.trim() : null,
        reporterEmail: reporterEmail && reporterEmail.trim() ? reporterEmail.trim() : null,
        status: "OPEN",
      },
    });

    logger.logThat(`Nouvel incident signalé sur la machine "${machine.name}" (ID #${issue.id})`);

    // Asynchronously send email notification to admin
    const hostUrl = `${req.protocol}://${req.get("host")}`;
    mailService
      .sendMachineIssueAlert({
        machine,
        issue,
        hostUrl,
      })
      .then((result) => {
        if (result && result.success) {
          logger.logThat(`Notification e-mail d'incident envoyée pour la machine "${machine.name}"`);
        }
      })
      .catch((err) => {
        console.error("[ReportIssue] Error sending admin notification email:", err.message);
      });

    res.redirect(`/report-issue?success=1&machineName=${encodeURIComponent(machine.name)}`);
  }),
);

module.exports = router;
