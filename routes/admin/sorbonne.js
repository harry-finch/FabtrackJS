const express = require("express");
const router = express.Router();
const moment = require("moment");

const asyncHandler = require("../../middleware/asyncHandler.js");
const clearNotification = require("../../middleware/clearNotification.js");
const isAdmin = require("../../middleware/checkAdmin.js");
const sorbonneService = require("../../services/sorbonneService.js");

router.use(isAdmin);

// ******************************************************************************
// Route to view Sorbonne Projects Consumptions & Billing
// ******************************************************************************

router.get(
  "/",
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/sorbonne";

    const { entity, status, startDate, endDate } = req.query;

    const selectedEntity = entity || "all";
    const selectedStatus = status || "all";

    const [consumptionData, entities] = await Promise.all([
      sorbonneService.getSorbonneConsumptions({
        entity: selectedEntity,
        status: selectedStatus,
      }),
      sorbonneService.getDistinctEntities(),
    ]);

    // Apply date range filter in memory if provided
    let filteredActivities = consumptionData.activities;
    if (startDate) {
      const start = new Date(`${startDate}T00:00:00.000`);
      filteredActivities = filteredActivities.filter((a) => new Date(a.createdAt) >= start);
    }
    if (endDate) {
      const end = new Date(`${endDate}T23:59:59.999`);
      filteredActivities = filteredActivities.filter((a) => new Date(a.createdAt) <= end);
    }

    res.render("admin/manage-sorbonne-projects", {
      title: "Gestion des Projets Sorbonne & Facturation",
      activities: filteredActivities,
      entitySummary: consumptionData.entitySummary,
      entities,
      selectedEntity,
      selectedStatus,
      startDate: startDate || "",
      endDate: endDate || "",
      pendingTotalCost: consumptionData.pendingTotalCost,
      settledTotalCost: consumptionData.settledTotalCost,
      grandTotalCost: consumptionData.grandTotalCost,
      activeEntitiesCount: entities.length,
      notification: req.session.notification || "",
    });
  }),
);

// ******************************************************************************
// Route to toggle settled status of an activity
// ******************************************************************************

router.post(
  "/toggle-settled/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const username = req.session ? req.session.username || "Staff" : "Staff";

    const updated = await sorbonneService.toggleSettled(id, username);

    if (!updated) {
      req.session.notification = "Error: Activité introuvable.";
    } else {
      const stateLabel = updated.settled ? "réglée" : "en attente de règlement";
      req.session.notification = `Success: Consommation #${id} marquée comme ${stateLabel}.`;
    }

    const redirectUrl = req.headers.referer || "/admin/sorbonne";
    res.redirect(redirectUrl);
  }),
);

// ******************************************************************************
// Route to settle all pending consumptions for an entity
// ******************************************************************************

router.post(
  "/settle-entity",
  asyncHandler(async (req, res) => {
    const { entity } = req.body;
    const username = req.session ? req.session.username || "Staff" : "Staff";

    if (!entity || !entity.trim()) {
      req.session.notification = "Error: Entité non spécifiée.";
      return res.redirect("/admin/sorbonne");
    }

    const settledCount = await sorbonneService.settleEntity(entity.trim(), username);

    if (settledCount > 0) {
      req.session.notification = `Success: ${settledCount} consommation(s) marquée(s) comme réglée(s) pour "${entity.trim()}".`;
    } else {
      req.session.notification = `Info: Aucune consommation en attente pour "${entity.trim()}".`;
    }

    const redirectUrl = req.headers.referer || "/admin/sorbonne";
    res.redirect(redirectUrl);
  }),
);

// ******************************************************************************
// Route to export CSV of Sorbonne Consumptions
// ******************************************************************************

router.get(
  "/export-csv",
  asyncHandler(async (req, res) => {
    const { entity, status, startDate, endDate } = req.query;

    const consumptionData = await sorbonneService.getSorbonneConsumptions({
      entity: entity || "all",
      status: status || "all",
    });

    let activities = consumptionData.activities;
    if (startDate) {
      const start = new Date(`${startDate}T00:00:00.000`);
      activities = activities.filter((a) => new Date(a.createdAt) >= start);
    }
    if (endDate) {
      const end = new Date(`${endDate}T23:59:59.999`);
      activities = activities.filter((a) => new Date(a.createdAt) <= end);
    }

    // CSV header with UTF-8 BOM for Microsoft Excel
    let csv = "\uFEFF";
    csv += "Entité / UFR;Statut Règlement;Date Règlement;Réglé Par;Date Consommation;Usager;Email Usager;Projet;Consommable;Quantité;Unité;Prix Unitaire (€);Total (€)\r\n";

    activities.forEach((act) => {
      const entityStr = `"${(act.sorbonneEntity || "").replace(/"/g, '""')}"`;
      const statusStr = act.settled ? "Réglé" : "À régler";
      const settledDate = act.settledAtFormatted || "";
      const settledBy = act.settledBy ? `"${act.settledBy.replace(/"/g, '""')}"` : "";
      const dateStr = act.formattedDate || moment(act.createdAt).format("DD/MM/YYYY HH:mm");
      const userStr = `"${(act.userName || "").replace(/"/g, '""')}"`;
      const emailStr = act.userEmail || "";
      const projStr = `"${(act.projectUrl || "").replace(/"/g, '""')}"`;
      const consumableStr = `"${(act.consumableName || "").replace(/"/g, '""')}"`;
      const qty = act.quantity || 1;
      const unit = act.consumableUnit || "u";
      const unitCost = act.unitCost || 0;
      const totalCost = act.totalCost || 0;

      csv += `${entityStr};${statusStr};${settledDate};${settledBy};${dateStr};${userStr};${emailStr};${projStr};${consumableStr};${qty};${unit};${unitCost.toFixed(4).replace(".", ",")};${totalCost.toFixed(2).replace(".", ",")}\r\n`;
    });

    const filenameParts = ["facturation_sorbonne"];
    if (entity && entity !== "all") {
      filenameParts.push(entity.toLowerCase().replace(/[^a-z0-9]/g, "_"));
    }
    if (status && status !== "all") {
      filenameParts.push(status);
    }
    if (startDate) filenameParts.push(`du_${startDate}`);
    if (endDate) filenameParts.push(`au_${endDate}`);
    if (!startDate && !endDate && (!entity || entity === "all") && (!status || status === "all")) {
      filenameParts.push(moment().format("YYYY-MM-DD"));
    }

    const finalFilename = `${filenameParts.join("_")}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${finalFilename}"`);
    res.send(csv);
  }),
);

module.exports = router;
