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

    // 2. Fetch all Consumable Activities associated with history entries that have a teachingUnitId
    const ueActivities = await prisma.activity.findMany({
      where: {
        resourceType: ResourceType.CONSUMABLE,
        history: {
          teachingUnitId: { not: null },
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

      return {
        id: act.id,
        date: moment(act.createdAt).format("DD/MM/YYYY HH:mm"),
        ueId: act.history && act.history.teachingUnitId,
        ueCode: act.history && act.history.teachingUnit ? act.history.teachingUnit.code : "N/A",
        ueName: act.history && act.history.teachingUnit ? act.history.teachingUnit.name : "N/A",
        ueDepartment: act.history && act.history.teachingUnit ? act.history.teachingUnit.department : "",
        studentName: act.user ? `${act.user.name} ${act.user.surname}` : "Inconnu",
        studentEmail: act.user ? act.user.email : "",
        projectUrl: act.history && act.history.userproject && act.history.userproject.project ? act.history.userproject.project.url : "N/A",
        consumableName: consumable ? consumable.name : `Consommable #${act.resourceId}`,
        quantity: qty,
        unit: unitStr,
        unitCost,
        totalCost: total,
      };
    });

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
      if (statsByUe.has(act.ueId)) {
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
    const grandTotalCost = enrichedTeachingUnits.reduce((acc, ue) => acc + ue.totalCost, 0);
    const activeUeCount = enrichedTeachingUnits.filter((ue) => ue.active).length;
    const totalActivitiesCount = enrichedActivities.length;

    res.render("admin/manage-teaching-units", {
      teachingUnits: enrichedTeachingUnits,
      activities: enrichedActivities,
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
// Route to export CSV of all UE consumptions for billing
// ******************************************************************************

router.get(
  "/export-csv",
  asyncHandler(async (req, res) => {
    const ueActivities = await prisma.activity.findMany({
      where: {
        resourceType: ResourceType.CONSUMABLE,
        history: {
          teachingUnitId: { not: null },
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

    const consumables = await prisma.consumable.findMany();
    const consumableMap = new Map();
    consumables.forEach((c) => consumableMap.set(c.id, c));

    // CSV header with UTF-8 BOM for Microsoft Excel
    let csv = "\uFEFF";
    csv += "Code UE;Intitulé UE;Département;Responsable UE;Date Activité;Nom Étudiant;Email Étudiant;Projet;Matériau Consommé;Quantité;Unité;Prix Unitaire (€);Total Imputé (€)\r\n";

    ueActivities.forEach((act) => {
      const consumable = consumableMap.get(act.resourceId);
      const ue = act.history && act.history.teachingUnit ? act.history.teachingUnit : null;
      const user = act.user;
      const project = act.history && act.history.userproject && act.history.userproject.project ? act.history.userproject.project : null;

      const code = ue ? ue.code : "N/A";
      const name = ue ? `"${ue.name.replace(/"/g, '""')}"` : "";
      const department = ue && ue.department ? `"${ue.department.replace(/"/g, '""')}"` : "";
      const respEmail = ue && ue.responsibleEmail ? ue.responsibleEmail : "";
      const dateStr = moment(act.createdAt).format("DD/MM/YYYY HH:mm");
      const student = user ? `"${(user.name + " " + user.surname).replace(/"/g, '""')}"` : "Inconnu";
      const studentEmail = user ? user.email : "";
      const projectUrl = project ? `"${project.url.replace(/"/g, '""')}"` : "";
      const consumableName = consumable ? `"${consumable.name.replace(/"/g, '""')}"` : `Consommable #${act.resourceId}`;
      const qty = act.quantity || 1;
      const unit = consumable ? consumable.unit || "u" : "u";
      const unitCost = consumable ? Number(consumable.cost) : 0;
      const total = Number((unitCost * qty).toFixed(2));

      csv += `${code};${name};${department};${respEmail};${dateStr};${student};${studentEmail};${projectUrl};${consumableName};${qty};${unit};${unitCost.toFixed(4).replace(".", ",")};${total.toFixed(2).replace(".", ",")}\r\n`;
    });

    const todayStr = moment().format("YYYY-MM-DD");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="refacturation_ue_sorbonne_${todayStr}.csv"`);
    res.send(csv);
  }),
);

module.exports = router;
