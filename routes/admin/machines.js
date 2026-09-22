const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const asyncHandler = require("../../middleware/asyncHandler.js");
const clearNotification = require("../../middleware/clearNotification.js");
const isAdmin = require("../../middleware/checkAdmin.js");
const isAuthenticated = require("../../middleware/checkSession.js");
const { invalidateCache } = require("../../middleware/cacheHelper.js");
const { createMaintenanceSchema } = require("../../schemas/issue.schema.js");

router.use(isAuthenticated);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const logger = require("../../utilities/simpleLogger.js");

// Define multer config for machine picture uploads
const uploadsDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// ******************************************************************************
// Route to manage machine types (3D printer, laser cutter...)
// ******************************************************************************

router.get(
  "/manage-types",
  isAdmin,
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/machines/manage-types";

    const machinetypes = await prisma.machineType.findMany({
      orderBy: { id: "asc" },
    });

    res.render("admin/manage-machinetypes", {
      machinetypes,
    });
  }),
);

// ******************************************************************************
// Route to delete a machine type
// ******************************************************************************

router.get(
  "/delete-type/:id",
  isAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await prisma.machineType.delete({
      where: { id: Number(id) },
    });

    invalidateCache(req);
    logger.logThat("Machine type " + result.name + " deleted by " + req.session.username);

    req.session.notification = "Success: Machine type " + result.name + " deleted";
    res.redirect(req.session.lastPage || "/admin/machines/manage-types");
  }),
);

// ******************************************************************************
// Route to create a machine type
// ******************************************************************************

router.post(
  "/create-type",
  isAdmin,
  asyncHandler(async (req, res) => {
    const { name } = req.body;

    const machinetype = await prisma.machineType.create({
      data: { name: name },
    });

    invalidateCache(req);
    logger.logThat("Machine type " + name + " created by " + req.session.username);

    req.session.notification = "Success: Machine type " + name + " created";
    res.redirect("/admin/machines/manage-types");
  }),
);

// ******************************************************************************
// Route to update a machine type
// ******************************************************************************

router.post(
  "/update-type",
  isAdmin,
  asyncHandler(async (req, res) => {
    const { machinetypeid, name } = req.body;

    const updated = await prisma.machineType.update({
      where: { id: Number(machinetypeid) },
      data: { name: name },
    });

    invalidateCache(req);
    logger.logThat("Machine type " + name + " updated by " + req.session.username);
    req.session.notification = "Success: Machine type " + name + " updated";
    res.redirect("/admin/machines/manage-types");
  }),
);

// ******************************************************************************
// Route to manage machines
// ******************************************************************************

router.get(
  ["/", "/manage"],
  clearNotification,
  asyncHandler(async (req, res) => {
    const machines = await prisma.machine.findMany({
      include: {
        machinetype: true,
        location: true,
        access: true,
        category: true,
      },
      orderBy: { id: "asc" },
    });

    const machinetypes = await prisma.machineType.findMany();
    const locations = await prisma.location.findMany();
    const access = await prisma.access.findMany();
    const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });

    req.session.lastPage = "/admin/machines/manage";
    res.render("admin/manage-machines", {
      machines,
      machinetypes,
      locations,
      access,
      categories,
    });
  }),
);

// ******************************************************************************
const moment = require("moment");
const dateService = require("../../services/dateService.js");

function formatDateTime(date) {
  return dateService.formatDateTime(date);
}

function formatDate(date) {
  return dateService.formatDate(date);
}

// ******************************************************************************
// Route to view a machine's full details and usage history
// ******************************************************************************

router.get(
  "/view/:id",
  clearNotification,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const machine = await prisma.machine.findUnique({
      where: { id: Number(id) },
      include: {
        machinetype: true,
        location: true,
        access: true,
        category: true,
        issues: {
          orderBy: { createdAt: "desc" },
        },
        maintenances: {
          orderBy: { maintenanceDate: "desc" },
        },
      },
    });

    if (!machine) {
      req.session.notification = "Error: Machine not found.";
      return res.redirect("/admin/machines/manage");
    }

    // Fetch usage activities for this machine
    const rawActivities = await prisma.activity.findMany({
      where: {
        resourceId: Number(id),
        resourceType: "MACHINE",
      },
      include: {
        user: true,
        history: {
          include: {
            workspace: true,
            userproject: {
              include: { project: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const usageHistory = rawActivities.map((act) => ({
      id: act.id,
      createdAt: act.createdAt,
      formattedDate: formatDateTime(act.createdAt),
      user: act.user || null,
      workspace: act.history && act.history.workspace ? act.history.workspace.name : "-",
      project: act.history && act.history.userproject && act.history.userproject.project ? act.history.userproject.project : null,
      departure: act.history && act.history.departure ? formatDateTime(act.history.departure) : null,
      comments: act.history ? act.history.comments : null,
    }));

    const uniqueUsersCount = new Set(
      usageHistory.map((u) => (u.user ? u.user.id : null)).filter(Boolean)
    ).size;

    const usageStats = {
      totalSessions: usageHistory.length,
      uniqueUsers: uniqueUsersCount,
      lastUsed: usageHistory.length > 0 ? usageHistory[0].formattedDate : "Never",
    };

    const formattedIssues = (machine.issues || []).map((issue) => ({
      ...issue,
      formattedCreatedAt: formatDateTime(issue.createdAt),
      formattedResolvedAt: issue.resolvedAt ? formatDateTime(issue.resolvedAt) : null,
    }));

    const formattedMaintenances = (machine.maintenances || []).map((m) => ({
      ...m,
      formattedDate: formatDate(m.maintenanceDate),
      formattedCreatedAt: formatDateTime(m.createdAt),
    }));

    const openIssuesCount = formattedIssues.filter((i) => i.status === "OPEN").length;

    // Build unified chronological event stream
    const events = [
      ...formattedIssues.map((i) => ({
        eventId: `issue-${i.id}`,
        kind: "ISSUE",
        rawDate: i.createdAt,
        formattedDate: i.formattedCreatedAt,
        status: i.status,
        author: i.reporterName || i.reporterEmail || "Usager",
        title: "Incident / Panne signalée",
        description: i.description,
        photoPath: i.photoPath,
        resolvedAt: i.resolvedAt,
        formattedResolvedAt: i.formattedResolvedAt,
        resolutionNotes: i.resolutionNotes,
        original: i,
      })),
      ...formattedMaintenances.map((m) => ({
        eventId: `maintenance-${m.id}`,
        kind: "MAINTENANCE",
        rawDate: m.maintenanceDate,
        formattedDate: m.formattedDate,
        status: "COMPLETED",
        author: m.operator,
        title: m.title,
        type: m.type,
        description: m.description,
        partsReplaced: m.partsReplaced,
        cost: m.cost,
        original: m,
      })),
    ].sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate));

    res.render("admin/view-machine", {
      machine,
      usageHistory,
      usageStats,
      issues: formattedIssues,
      maintenances: formattedMaintenances,
      events,
      openIssuesCount,
    });
  }),
);

// Route shortcut to jump directly to machine history section
router.get(
  "/history/:id",
  clearNotification,
  (req, res) => {
    res.redirect(`/admin/machines/view/${req.params.id}#history`);
  },
);

// Route shortcut to jump directly to machine issues section
router.get(
  "/issues/:id",
  clearNotification,
  (req, res) => {
    res.redirect(`/admin/machines/view/${req.params.id}#issues`);
  },
);

// ******************************************************************************
// POST /admin/machines/issues/:issueId/status: Update issue status (RESOLVED / OPEN)
// ******************************************************************************
router.post(
  "/issues/:issueId/status",
  asyncHandler(async (req, res) => {
    const { issueId } = req.params;
    const { status, resolutionNotes, machineId } = req.body;

    const currentIssue = await prisma.machineIssue.findUnique({
      where: { id: Number(issueId) },
    });

    if (!currentIssue) {
      req.session.notification = "Error: Incident introuvable.";
      return res.redirect(machineId ? `/admin/machines/view/${machineId}#issues` : "/admin/machines/manage");
    }

    const newStatus = status === "RESOLVED" ? "RESOLVED" : "OPEN";
    await prisma.machineIssue.update({
      where: { id: Number(issueId) },
      data: {
        status: newStatus,
        resolvedAt: newStatus === "RESOLVED" ? new Date() : null,
        resolutionNotes: resolutionNotes !== undefined ? resolutionNotes.trim() || null : currentIssue.resolutionNotes,
      },
    });

    logger.logThat(`Statut de l'incident #${issueId} modifié en "${newStatus}" pour la machine #${currentIssue.machineId}`);

    req.session.notification =
      newStatus === "RESOLVED"
        ? "Success: Incident marqué comme résolu."
        : "Success: Incident rouvert.";

    res.redirect(`/admin/machines/view/${currentIssue.machineId}#issues`);
  }),
);

// ******************************************************************************
// POST /admin/machines/issues/:issueId/delete: Delete an issue report
// ******************************************************************************
router.post(
  "/issues/:issueId/delete",
  isAdmin,
  asyncHandler(async (req, res) => {
    const { issueId } = req.params;
    const currentIssue = await prisma.machineIssue.findUnique({
      where: { id: Number(issueId) },
    });

    if (!currentIssue) {
      req.session.notification = "Error: Incident introuvable.";
      return res.redirect("/admin/machines/manage");
    }

    const targetMachineId = currentIssue.machineId;

    if (currentIssue.photoPath) {
      const fullPhotoPath = path.join(__dirname, "../../", currentIssue.photoPath);
      if (fs.existsSync(fullPhotoPath)) {
        try {
          fs.unlinkSync(fullPhotoPath);
        } catch (e) {
          console.error("Failed to delete issue photo file:", e);
        }
      }
    }

    await prisma.machineIssue.delete({
      where: { id: Number(issueId) },
    });

    logger.logThat(`Signalement d'incident #${issueId} supprimé pour la machine #${targetMachineId}`);

    req.session.notification = "Success: Signalement d'incident supprimé.";
    res.redirect(`/admin/machines/view/${targetMachineId}#issues`);
  }),
);

// ******************************************************************************
// POST /admin/machines/maintenance/create: Log a machine maintenance operation
// Accessible to all logged-in staff and admins
// ******************************************************************************
router.post(
  "/maintenance/create",
  isAuthenticated,
  asyncHandler(async (req, res) => {
    const parsed = createMaintenanceSchema.safeParse(req.body);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map((i) => i.message).join(" ");
      req.session.notification = `Error: ${errorMsg}`;
      return res.redirect(req.body.machineId ? `/admin/machines/view/${req.body.machineId}#issues` : "/admin/machines/manage");
    }

    const { machineId, title, type, description, operator, partsReplaced, cost, maintenanceDate, resolveOpenIssues } = parsed.data;
    const author = operator && operator.trim() ? operator.trim() : (req.session.username || "Staff");

    const machine = await prisma.machine.findUnique({ where: { id: machineId } });
    if (!machine) {
      req.session.notification = "Error: Machine introuvable.";
      return res.redirect("/admin/machines/manage");
    }

    const opDate = maintenanceDate || new Date();

    const maintenance = await prisma.machineMaintenance.create({
      data: {
        machineId,
        title,
        type: type || "PREVENTIVE",
        description: description || null,
        operator: author,
        partsReplaced: partsReplaced || null,
        cost: cost !== null && cost !== undefined ? Number(cost) : null,
        maintenanceDate: opDate,
      },
    });

    // Automatically update lastMaintenance on machine
    await prisma.machine.update({
      where: { id: machineId },
      data: {
        lastMaintenance: opDate,
      },
    });

    // Optionally resolve open issues if requested
    if (resolveOpenIssues) {
      await prisma.machineIssue.updateMany({
        where: { machineId, status: "OPEN" },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
          resolutionNotes: `Résolu par l'opération de maintenance : "${title}" (${author})`,
        },
      });
    }

    invalidateCache(req);
    logger.logThat(`Maintenance enregistrée sur "${machine.name}" (#${machineId}) : "${title}" par ${author}`);
    req.session.notification = `Success: Opération de maintenance enregistrée pour "${machine.name}".`;

    res.redirect(`/admin/machines/view/${machineId}#issues`);
  }),
);

// ******************************************************************************
// POST /admin/machines/maintenance/:maintenanceId/delete: Delete a maintenance log
// ******************************************************************************
router.post(
  "/maintenance/:maintenanceId/delete",
  isAdmin,
  asyncHandler(async (req, res) => {
    const { maintenanceId } = req.params;
    const current = await prisma.machineMaintenance.findUnique({
      where: { id: Number(maintenanceId) },
    });

    if (!current) {
      req.session.notification = "Error: Enregistrement de maintenance introuvable.";
      return res.redirect("/admin/machines/manage");
    }

    const targetMachineId = current.machineId;
    await prisma.machineMaintenance.delete({
      where: { id: Number(maintenanceId) },
    });

    // Recalculate last maintenance date from remaining records if any
    const latestMaintenance = await prisma.machineMaintenance.findFirst({
      where: { machineId: targetMachineId },
      orderBy: { maintenanceDate: "desc" },
    });

    await prisma.machine.update({
      where: { id: targetMachineId },
      data: {
        lastMaintenance: latestMaintenance ? latestMaintenance.maintenanceDate : null,
      },
    });

    invalidateCache(req);
    logger.logThat(`Maintenance #${maintenanceId} supprimée pour la machine #${targetMachineId}`);
    req.session.notification = "Success: Enregistrement de maintenance supprimé.";
    res.redirect(`/admin/machines/view/${targetMachineId}#issues`);
  }),
);

// ******************************************************************************
// Route to create a machine
// ******************************************************************************

router.post(
  "/create",
  isAdmin,
  upload.any(),
  asyncHandler(async (req, res) => {
    const {
      name,
      machinetypeId,
      categoryId,
      make,
      model,
      serialNumber,
      serialnum,
      internalReference,
      locationId,
      purchaseDate,
      lastMaintenance,
      warrantyExpiry,
      picture,
      documentation,
      accessId,
    } = req.body;

    let picturePath = picture || null;
    if (req.files && req.files.length > 0) {
      picturePath = "/uploads/" + req.files[0].filename;
    }

    const machineName = name && name.trim() !== "" ? name.trim() : `${make} ${model}`;
    const serial = (serialNumber || serialnum || "").trim() || null;
    const parsedCategoryId = categoryId && categoryId !== "" && categoryId !== "null" ? Number(categoryId) : null;

    try {
      const newMachine = await prisma.machine.create({
        data: {
          name: machineName,
          machinetypeId: Number(machinetypeId),
          categoryId: parsedCategoryId,
          make: make || "Generic",
          model: model || "Standard",
          serialNumber: serial,
          internalReference: internalReference ? Number(internalReference) : null,
          locationId: locationId && locationId !== "" ? Number(locationId) : null,
          purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
          lastMaintenance: lastMaintenance ? new Date(lastMaintenance) : null,
          warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
          picture: picturePath,
          documentation: documentation || null,
          accessId: Number(accessId),
        },
      });

      invalidateCache(req);
      logger.logThat("Machine " + newMachine.name + " created by " + req.session.username);
      req.session.notification = "Success: Machine " + newMachine.name + " created";

      res.redirect("/admin/machines/manage");
    } catch (error) {
      console.error("Error creating machine:", error);
      req.session.notification = "Error: Failed to create machine. Please verify inputs (e.g. unique serial number).";
      res.redirect("/admin/machines/manage");
    }
  }),
);

// ******************************************************************************
// Route to edit a machine
// ******************************************************************************

router.get(
  "/edit/:id",
  isAdmin,
  clearNotification,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const machine = await prisma.machine.findUnique({
      where: { id: Number(id) },
      include: {
        machinetype: true,
        location: true,
        access: true,
        category: true,
      },
    });

    if (!machine) {
      req.session.notification = "Error: Machine not found.";
      return res.redirect("/admin/machines/manage");
    }

    const machinetypes = await prisma.machineType.findMany();
    const locations = await prisma.location.findMany();
    const access = await prisma.access.findMany();
    const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });

    res.render("admin/edit-machine", {
      machine,
      machinetypes,
      locations,
      access,
      categories,
    });
  }),
);

// ******************************************************************************
// Route to update a machine
// ******************************************************************************

router.post(
  "/update",
  isAdmin,
  upload.any(),
  asyncHandler(async (req, res) => {
    const {
      machineid,
      name,
      machinetypeId,
      categoryId,
      make,
      model,
      serialNumber,
      internalReference,
      locationId,
      purchaseDate,
      lastMaintenance,
      warrantyExpiry,
      documentation,
      accessId,
    } = req.body;

    const targetId = Number(machineid || req.body.id);
    if (!targetId || isNaN(targetId)) {
      req.session.notification = "Error: Invalid machine ID provided.";
      return res.redirect("/admin/machines/manage");
    }

    const existing = await prisma.machine.findUnique({
      where: { id: targetId },
    });

    if (!existing) {
      req.session.notification = "Error: Machine not found.";
      return res.redirect("/admin/machines/manage");
    }

    let picturePath = existing.picture;
    if (req.files && req.files.length > 0) {
      picturePath = "/uploads/" + req.files[0].filename;
    }

    const machineName = name && name.trim() !== "" ? name.trim() : `${make} ${model}`;
    const serial = (serialNumber || "").trim() || null;
    const parsedCategoryId = categoryId && categoryId !== "" && categoryId !== "null" ? Number(categoryId) : null;

    try {
      const updated = await prisma.machine.update({
        where: { id: targetId },
        data: {
          name: machineName,
          machinetypeId: Number(machinetypeId),
          categoryId: parsedCategoryId,
          make: make || existing.make,
          model: model || existing.model,
          serialNumber: serial,
          internalReference: internalReference ? Number(internalReference) : null,
          locationId: locationId && locationId !== "" ? Number(locationId) : null,
          purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
          lastMaintenance: lastMaintenance ? new Date(lastMaintenance) : null,
          warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
          picture: picturePath,
          documentation: documentation || null,
          accessId: Number(accessId),
        },
      });

      invalidateCache(req);
      logger.logThat("Machine " + updated.name + " updated by " + req.session.username);
      req.session.notification = "Success: Machine " + updated.name + " updated";

      res.redirect("/admin/machines/manage");
    } catch (error) {
      console.error("Error updating machine:", error);
      req.session.notification = "Error: Failed to update machine.";
      res.redirect("/admin/machines/manage");
    }
  }),
);

// ******************************************************************************
// Route to delete a machine
// ******************************************************************************

router.get(
  "/delete/:id",
  isAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
      const result = await prisma.machine.delete({
        where: { id: Number(id) },
      });

      invalidateCache(req);
      logger.logThat("Machine " + result.name + " deleted by " + req.session.username);
      req.session.notification = "Success: Machine " + result.name + " deleted";
    } catch (error) {
      console.error("Error deleting machine:", error);
      req.session.notification = "Error: Failed to delete machine.";
    }

    res.redirect("/admin/machines/manage");
  }),
);

module.exports = router;
