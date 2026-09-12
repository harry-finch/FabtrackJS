const express = require("express");
const router = express.Router();
const moment = require("moment");

const asyncHandler = require("../../middleware/asyncHandler.js");
const clearNotification = require("../../middleware/clearNotification.js");
const isAdmin = require("../../middleware/checkAdmin.js");

router.use(isAdmin);

const { PrismaClient, ResourceType } = require("@prisma/client");
const prisma = new PrismaClient();

// ******************************************************************************
// Route to manage Teaching Units (UE) & View Refacturation
// ******************************************************************************

router.get(
  "/",
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/ue";

    // 1. Fetch all Teaching Units with related projects and visits
    const teachingUnits = await prisma.teachingUnit.findMany({
      orderBy: { code: "asc" },
      include: {
        projects: true,
        historyEntries: {
          select: {
            id: true,
            userId: true,
            user: { select: { id: true, name: true, surname: true, email: true } },
          },
        },
      },
    });

    // 2. Fetch all Consumable Activities associated with history entries that have a teachingUnitId OR an unregisteredUeName
    const ueActivities = await prisma.activity.findMany({
      where: {
        resourceType: ResourceType.CONSUMABLE,
        history: {
          OR: [
            { teachingUnitId: { not: null } },
            { unregisteredUeName: { not: null } },
          ],
        },
      },
      include: {
        history: {
          include: {
            teachingUnit: true,
            user: true,
            userproject: {
              include: {
                project: true,
              },
            },
          },
        },
        user: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Fetch consumables to map costs and units
    const consumables = await prisma.consumable.findMany();
    const consumableMap = new Map();
    consumables.forEach((c) => consumableMap.set(c.id, c));

    // Enrich activities with consumable details and computed cost
    const enrichedActivities = ueActivities.map((act) => {
      const consumable = consumableMap.get(act.resourceId);
      const qty = act.quantity || 1;
      const unitCost = consumable ? Number(consumable.cost) : 0;
      const unitStr = consumable ? consumable.unit || "u" : "u";
      const total = Number((unitCost * qty).toFixed(2));
      const isUnregistered = !act.history || !act.history.teachingUnitId;

      return {
        id: act.id,
        rawDate: moment(act.createdAt).format("YYYY-MM-DD"),
        date: moment(act.createdAt).format("DD/MM/YYYY"),
        ueId: act.history && act.history.teachingUnitId,
        isUnregistered,
        ueCode: !isUnregistered && act.history.teachingUnit
          ? act.history.teachingUnit.code
          : (act.history ? act.history.unregisteredUeName || "Non-enregistrée" : "N/A"),
        ueName: !isUnregistered && act.history.teachingUnit
          ? act.history.teachingUnit.name
          : (act.history ? act.history.unregisteredUeName || "UE en attente de régularisation" : "N/A"),
        ueDepartment: !isUnregistered && act.history.teachingUnit
          ? act.history.teachingUnit.department || ""
          : (act.history && act.history.unregisteredUeContact ? `Contact: ${act.history.unregisteredUeContact}` : "En attente"),
        studentName: act.user ? `${act.user.name} ${act.user.surname}` : "Inconnu",
        studentEmail: act.user ? act.user.email : "",
        projectUrl: act.history && act.history.userproject && act.history.userproject.project ? act.history.userproject.project.url : (act.history && act.history.comments ? act.history.comments : "N/A"),
        consumableName: consumable ? consumable.name : `Consommable #${act.resourceId}`,
        quantity: qty,
        unit: unitStr,
        unitCost,
        totalCost: total,
      };
    });

    // 3. Fetch all pending unregistered visits
    const pendingHistories = await prisma.history.findMany({
      where: {
        teachingUnitId: null,
        unregisteredUeName: { not: null },
      },
      include: {
        user: true,
        userproject: {
          include: { project: true },
        },
        activities: {
          where: { resourceType: ResourceType.CONSUMABLE },
        },
      },
      orderBy: { arrival: "desc" },
    });

    const pendingList = pendingHistories.map((hist) => {
      let costSum = 0;
      hist.activities.forEach((act) => {
        const c = consumableMap.get(act.resourceId);
        const uCost = c ? Number(c.cost) : 0;
        costSum += uCost * (act.quantity || 1);
      });

      return {
        id: hist.id,
        date: moment(hist.arrival).format("DD/MM/YYYY"),
        studentName: hist.user ? `${hist.user.name} ${hist.user.surname}` : "Inconnu",
        studentEmail: hist.user ? hist.user.email : "",
        projectUrl: hist.userproject && hist.userproject.project ? hist.userproject.project.url : (hist.comments || "N/A"),
        unregisteredUeName: hist.unregisteredUeName,
        unregisteredUeContact: hist.unregisteredUeContact || "",
        consumablesCount: hist.activities.length,
        totalCost: Number(costSum.toFixed(2)),
      };
    });

    const pendingTotalCost = pendingList.reduce((acc, item) => acc + item.totalCost, 0);

    // Aggregate stats per Teaching Unit
    const statsByUe = new Map();
    teachingUnits.forEach((ue) => {
      statsByUe.set(ue.id, {
        totalCost: 0,
        totalActivities: 0,
        distinctStudents: new Set(),
      });
    });

    enrichedActivities.forEach((act) => {
      if (act.ueId && statsByUe.has(act.ueId)) {
        const stats = statsByUe.get(act.ueId);
        stats.totalCost += act.totalCost;
        stats.totalActivities += 1;
        if (act.studentEmail) stats.distinctStudents.add(act.studentEmail);
      }
    });

    const enrichedTeachingUnits = teachingUnits.map((ue) => {
      const stats = statsByUe.get(ue.id) || { totalCost: 0, totalActivities: 0, distinctStudents: new Set() };
      return {
        ...ue,
        projectsCount: ue.projects.length,
        visitsCount: ue.historyEntries.length,
        totalCost: Number(stats.totalCost.toFixed(2)),
        activitiesCount: stats.totalActivities,
        studentsCount: stats.distinctStudents.size,
      };
    });

    // Global summary totals
    const grandTotalCost = enrichedActivities.reduce((acc, act) => acc + act.totalCost, 0);
    const activeUeCount = enrichedTeachingUnits.filter((ue) => ue.active).length;
    const totalActivitiesCount = enrichedActivities.length;

    res.render("admin/manage-teaching-units", {
      teachingUnits: enrichedTeachingUnits,
      activities: enrichedActivities,
      pendingList,
      pendingCount: pendingList.length,
      pendingTotalCost: Number(pendingTotalCost.toFixed(2)),
      grandTotalCost: Number(grandTotalCost.toFixed(2)),
      activeUeCount,
      totalActivitiesCount,
    });
  }),
);

// ******************************************************************************
// Route to create a new Teaching Unit (UE)
// ******************************************************************************

router.post(
  "/create",
  asyncHandler(async (req, res) => {
    const { code, name, department, responsibleEmail } = req.body;

    if (!code || !name) {
      req.session.notification = "Error: Le code et l'intitulé de l'UE sont obligatoires.";
      return res.redirect("/admin/ue");
    }

    try {
      await prisma.teachingUnit.create({
        data: {
          code: code.trim().toUpperCase(),
          name: name.trim(),
          department: department ? department.trim() : null,
          responsibleEmail: responsibleEmail ? responsibleEmail.trim() : null,
          active: true,
        },
      });

      req.session.notification = `Success: L'UE ${code.toUpperCase()} a été créée avec succès.`;
    } catch (error) {
      console.error("Error creating teaching unit:", error);
      if (error.code === "P2002") {
        req.session.notification = `Error: Une UE avec le code ${code.toUpperCase()} existe déjà.`;
      } else {
        req.session.notification = "Error: Impossible de créer l'UE.";
      }
    }

    res.redirect("/admin/ue");
  }),
);

// ******************************************************************************
// Route to update a Teaching Unit (UE)
// ******************************************************************************

router.post(
  "/update/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { code, name, department, responsibleEmail, active } = req.body;

    try {
      await prisma.teachingUnit.update({
        where: { id: Number(id) },
        data: {
          code: code ? code.trim().toUpperCase() : undefined,
          name: name ? name.trim() : undefined,
          department: department ? department.trim() : null,
          responsibleEmail: responsibleEmail ? responsibleEmail.trim() : null,
          active: active === "true" || active === "on" || active === true,
        },
      });

      req.session.notification = "Success: L'UE a été mise à jour avec succès.";
    } catch (error) {
      console.error("Error updating teaching unit:", error);
      req.session.notification = "Error: Échec de la mise à jour de l'UE.";
    }

    res.redirect("/admin/ue");
  }),
);

// ******************************************************************************
// Route to toggle active status of a Teaching Unit (UE)
// ******************************************************************************

router.post(
  "/toggle/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
      const ue = await prisma.teachingUnit.findUnique({
        where: { id: Number(id) },
      });

      if (ue) {
        const updated = await prisma.teachingUnit.update({
          where: { id: Number(id) },
          data: { active: !ue.active },
        });

        req.session.notification = `Success: L'UE ${updated.code} est désormais ${updated.active ? "active (habilitée)" : "désactivée (archivée)"}.`;
      }
    } catch (error) {
      console.error("Error toggling teaching unit:", error);
      req.session.notification = "Error: Échec de modification du statut.";
    }

    res.redirect("/admin/ue");
  }),
);

// ******************************************************************************
// Route to regularize an unregistered UE visit/project
// ******************************************************************************

router.post(
  "/regularize",
  asyncHandler(async (req, res) => {
    const { historyId, unregisteredName, regularizeAction, targetUeId, newCode, newName, newDepartment, newResponsibleEmail } = req.body;

    let finalUeId = null;

    if (regularizeAction === "existing") {
      if (!targetUeId) {
        req.session.notification = "Error: Veuillez sélectionner une UE existante.";
        return res.redirect("/admin/ue");
      }
      finalUeId = Number(targetUeId);
    } else if (regularizeAction === "new") {
      if (!newCode || !newName) {
        req.session.notification = "Error: Le code et l'intitulé de la nouvelle UE sont obligatoires.";
        return res.redirect("/admin/ue");
      }
      try {
        const createdUe = await prisma.teachingUnit.create({
          data: {
            code: newCode.trim().toUpperCase(),
            name: newName.trim(),
            department: newDepartment ? newDepartment.trim() : null,
            responsibleEmail: newResponsibleEmail ? newResponsibleEmail.trim() : null,
            active: true,
          },
        });
        finalUeId = createdUe.id;
      } catch (err) {
        console.error("Error creating new UE during regularization:", err);
        if (err.code === "P2002") {
          req.session.notification = `Error: Une UE avec le code ${newCode.toUpperCase()} existe déjà. Veuillez l'associer via l'option 'Associer à une UE existante'.`;
        } else {
          req.session.notification = "Error: Impossible de créer la nouvelle UE.";
        }
        return res.redirect("/admin/ue");
      }
    } else {
      req.session.notification = "Error: Action de régularisation non reconnue.";
      return res.redirect("/admin/ue");
    }

    const targetUe = await prisma.teachingUnit.findUnique({ where: { id: finalUeId } });

    if (!targetUe) {
      req.session.notification = "Error: UE cible introuvable.";
      return res.redirect("/admin/ue");
    }

    let updatedHistoriesCount = 0;

    if (unregisteredName) {
      const resHist = await prisma.history.updateMany({
        where: {
          unregisteredUeName: unregisteredName,
        },
        data: {
          teachingUnitId: finalUeId,
          unregisteredUeName: null,
          unregisteredUeContact: null,
        },
      });
      updatedHistoriesCount = resHist.count;

      await prisma.project.updateMany({
        where: {
          unregisteredUeName: unregisteredName,
        },
        data: {
          teachingUnitId: finalUeId,
          unregisteredUeName: null,
          unregisteredUeContact: null,
        },
      });
    } else if (historyId) {
      await prisma.history.update({
        where: { id: Number(historyId) },
        data: {
          teachingUnitId: finalUeId,
          unregisteredUeName: null,
          unregisteredUeContact: null,
        },
      });
      updatedHistoriesCount = 1;
    }

    req.session.notification = `Success: Situation régularisée avec succès ! ${updatedHistoriesCount} visite(s) rattachée(s) à l'UE ${targetUe.code} — ${targetUe.name}.`;
    res.redirect("/admin/ue");
  }),
);

// ******************************************************************************
// Route to export CSV of all UE consumptions for billing
// ******************************************************************************

router.get(
  "/export-csv",
  asyncHandler(async (req, res) => {
    const { ueId, startDate, endDate } = req.query;

    const whereConditions = {
      resourceType: ResourceType.CONSUMABLE,
    };

    // Filter by UE if specified
    if (ueId === "unregistered") {
      whereConditions.history = {
        unregisteredUeName: { not: null },
        teachingUnitId: null,
      };
    } else if (ueId && ueId !== "all") {
      whereConditions.history = {
        teachingUnitId: Number(ueId),
      };
    } else {
      whereConditions.history = {
        OR: [
          { teachingUnitId: { not: null } },
          { unregisteredUeName: { not: null } },
        ],
      };
    }

    // Filter by date range if specified
    if (startDate || endDate) {
      whereConditions.createdAt = {};
      if (startDate) {
        whereConditions.createdAt.gte = new Date(`${startDate}T00:00:00.000`);
      }
      if (endDate) {
        whereConditions.createdAt.lte = new Date(`${endDate}T23:59:59.999`);
      }
    }

    const ueActivities = await prisma.activity.findMany({
      where: whereConditions,
      include: {
        history: {
          include: {
            teachingUnit: true,
            user: true,
            userproject: {
              include: {
                project: true,
              },
            },
          },
        },
        user: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const consumables = await prisma.consumable.findMany();
    const consumableMap = new Map();
    consumables.forEach((c) => consumableMap.set(c.id, c));

    // CSV header with UTF-8 BOM for Microsoft Excel
    let csv = "\uFEFF";
    csv += "Code UE;Intitulé UE;Département;Responsable UE;Statut Régularisation;Date Activité;Nom Étudiant;Email Étudiant;Projet;Matériau Consommé;Quantité;Unité;Prix Unitaire (€);Total Imputé (€)\r\n";

    ueActivities.forEach((act) => {
      const consumable = consumableMap.get(act.resourceId);
      const ue = act.history && act.history.teachingUnit ? act.history.teachingUnit : null;
      const user = act.user;
      const project = act.history && act.history.userproject && act.history.userproject.project ? act.history.userproject.project : null;

      const isUnregistered = !ue;
      const code = ue ? ue.code : (act.history && act.history.unregisteredUeName ? act.history.unregisteredUeName : "N/A");
      const name = ue ? `"${ue.name.replace(/"/g, '""')}"` : `"UE non-enregistrée"`;
      const department = ue && ue.department ? `"${ue.department.replace(/"/g, '""')}"` : "";
      const respEmail = ue && ue.responsibleEmail ? ue.responsibleEmail : (act.history && act.history.unregisteredUeContact ? act.history.unregisteredUeContact : "");
      const regStatus = isUnregistered ? "En attente de régularisation" : "Validée";
      const dateStr = moment(act.createdAt).format("DD/MM/YYYY HH:mm");
      const student = user ? `"${(user.name + " " + user.surname).replace(/"/g, '""')}"` : "Inconnu";
      const studentEmail = user ? user.email : "";
      const projectUrl = project ? `"${project.url.replace(/"/g, '""')}"` : (act.history && act.history.comments ? `"${act.history.comments.replace(/"/g, '""')}"` : "");
      const consumableName = consumable ? `"${consumable.name.replace(/"/g, '""')}"` : `Consommable #${act.resourceId}`;
      const qty = act.quantity || 1;
      const unit = consumable ? consumable.unit || "u" : "u";
      const unitCost = consumable ? Number(consumable.cost) : 0;
      const total = Number((unitCost * qty).toFixed(2));

      csv += `${code};${name};${department};${respEmail};${regStatus};${dateStr};${student};${studentEmail};${projectUrl};${consumableName};${qty};${unit};${unitCost.toFixed(4).replace(".", ",")};${total.toFixed(2).replace(".", ",")}\r\n`;
    });

    // Meaningful filename reflecting applied filters
    const filenameParts = ["refacturation_ue"];
    if (ueId && ueId !== "all") {
      if (ueId === "unregistered") {
        filenameParts.push("non_enregistrees");
      } else {
        const u = await prisma.teachingUnit.findUnique({ where: { id: Number(ueId) } });
        if (u) filenameParts.push(u.code.toLowerCase().replace(/[^a-z0-9]/g, "_"));
      }
    }
    if (startDate) filenameParts.push(`du_${startDate}`);
    if (endDate) filenameParts.push(`au_${endDate}`);
    if (!startDate && !endDate && (!ueId || ueId === "all")) {
      filenameParts.push(moment().format("YYYY-MM-DD"));
    }

    const finalFilename = `${filenameParts.join("_")}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${finalFilename}"`);
    res.send(csv);
  }),
);

module.exports = router;
