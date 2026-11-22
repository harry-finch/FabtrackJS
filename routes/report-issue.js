const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { prisma } = require("../utilities/db.js");

const mailService = require("../services/mailService.js");
const asyncHandler = require("../middleware/asyncHandler.js");
const clearNotification = require("../middleware/clearNotification.js");
const logger = require("../utilities/simpleLogger.js");
const { validateBody, validateQuery } = require("../middleware/validate.js");
const { reportIssueSchema, reportIssueQuerySchema } = require("../schemas/issue.schema.js");
const { createRateLimiter } = require("../middleware/rateLimit.js");
const {
  UPLOAD_PROFILES,
  createImageFileFilter,
  createTempFilename,
  verifyAndFinalizeUploadedFile,
  safeUnlinkPath,
  wrapUploadMiddleware,
} = require("../services/uploadSecurityService.js");

const router = express.Router();

// Ensure uploads/issues directory exists
const issuesUploadsDir = path.join(__dirname, "../uploads/issues");
if (!fs.existsSync(issuesUploadsDir)) {
  fs.mkdirSync(issuesUploadsDir, { recursive: true });
}

function buildReportIssueRedirect(req) {
  const rawId = req && req.body && req.body.machineId;
  if (rawId !== undefined && rawId !== null && /^\d+$/.test(String(rawId).trim())) {
    return `/report-issue?machineId=${encodeURIComponent(String(rawId).trim())}`;
  }
  return "/report-issue";
}

// Multer storage for issue photos (strict extension AND MIME + magic bytes check after upload)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, issuesUploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, createTempFilename("issue-"));
  },
});

const upload = multer({
  storage,
  fileFilter: createImageFileFilter(
    UPLOAD_PROFILES.ISSUE_PHOTO,
    "Format de fichier non pris en charge. Veuillez fournir une image valide (JPG, PNG, WEBP, GIF).",
  ),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files: 1,
  },
});

const handleReportPhotoUpload = wrapUploadMiddleware(upload.single("photo"), {
  onErrorRedirect: buildReportIssueRedirect,
});

const reportIssueLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Trop de signalements envoyés depuis cette adresse. Veuillez patienter quelques minutes.",
  redirectUrl: buildReportIssueRedirect,
});

// ******************************************************************************
// GET /report-issue (and GET /report-issue/:machineId): Public reporting page
// ******************************************************************************
router.get(
  ["/", "/:machineId"],
  clearNotification,
  validateQuery(reportIssueQuerySchema, { redirectUrl: "/report-issue" }),
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
      notification: res.locals.notification || null,
    });
  }),
);

// ******************************************************************************
// POST /report-issue: Submit issue report with optional camera photo
// ******************************************************************************
router.post(
  "/",
  reportIssueLimiter,
  handleReportPhotoUpload,
  validateBody(reportIssueSchema, {
    redirectUrl: buildReportIssueRedirect,
  }),
  asyncHandler(async (req, res) => {
    const { machineId, description, reporterName, reporterEmail } = req.body;

    if (req.file) {
      try {
        verifyAndFinalizeUploadedFile(req.file, {
          allowedFormats: UPLOAD_PROFILES.ISSUE_PHOTO,
          targetDir: issuesUploadsDir,
          prefix: "issue-",
        });
      } catch (err) {
        if (req.session) {
          req.session.notification = `Error: ${err.message}`;
        }
        return res.redirect(buildReportIssueRedirect(req));
      }
    }

    if (!machineId) {
      safeUnlinkPath(req.file && req.file.path);
      if (req.session) req.session.notification = "Error: Veuillez sélectionner une machine.";
      return res.redirect("/report-issue");
    }

    if (!description || !description.trim()) {
      safeUnlinkPath(req.file && req.file.path);
      if (req.session) req.session.notification = "Error: Veuillez décrire le problème rencontré.";
      return res.redirect(buildReportIssueRedirect(req));
    }

    let machine;
    let issue;
    try {
      machine = await prisma.machine.findUnique({
        where: { id: parseInt(machineId, 10) },
        include: {
          machinetype: true,
          location: true,
        },
      });

      if (!machine) {
        safeUnlinkPath(req.file && req.file.path);
        if (req.session) req.session.notification = "Error: Machine sélectionnée introuvable.";
        return res.redirect("/report-issue");
      }

      const photoPath = req.file ? `/uploads/issues/${req.file.filename}` : null;

      issue = await prisma.machineIssue.create({
        data: {
          machineId: machine.id,
          description: description.trim(),
          photoPath,
          reporterName: reporterName && reporterName.trim() ? reporterName.trim() : null,
          reporterEmail: reporterEmail && reporterEmail.trim() ? reporterEmail.trim() : null,
          status: "OPEN",
        },
      });
    } catch (err) {
      safeUnlinkPath(req.file && req.file.path);
      throw err;
    }

    logger.logThat(`Nouvel incident signalé sur la machine "${machine.name}" (ID #${issue.id})`);

    // Asynchronously send email notification to admin without trusting Host header in production
    const hostUrl =
      process.env.NODE_ENV === "production"
        ? undefined
        : `${req.protocol}://${req.get("host")}${res.locals.basePath || ""}`;
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
