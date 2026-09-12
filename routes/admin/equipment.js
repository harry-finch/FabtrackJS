const express = require("express");
const router = express.Router();

const asyncHandler = require("../../middleware/asyncHandler.js");
const clearNotification = require("../../middleware/clearNotification.js");
const isAdmin = require("../../middleware/checkAdmin.js");
const { invalidateCache } = require("../../middleware/cacheHelper.js");

router.use(isAdmin);

const { PrismaClient, ResourceType } = require("@prisma/client");
const prisma = new PrismaClient();

const logger = require("../../utilities/simpleLogger.js");

// ******************************************************************************
// Route to manage equipment / tools
// ******************************************************************************

router.get(
  "/manage",
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/equipment/manage";

    const workspaces = await prisma.workspace.findMany({
      orderBy: { name: "asc" },
    });

    const equipmentList = await prisma.equipment.findMany({
      include: { workspace: true },
      orderBy: { name: "asc" },
    });

    // Count borrow activities for each equipment
    const activities = await prisma.activity.findMany({
      where: { resourceType: ResourceType.EQUIPMENT },
      select: { resourceId: true },
    });

    const borrowCounts = new Map();
    activities.forEach((act) => {
      borrowCounts.set(act.resourceId, (borrowCounts.get(act.resourceId) || 0) + 1);
    });

    const equipment = equipmentList.map((eq) => ({
      id: eq.id,
      name: eq.name,
      workspaceId: eq.workspaceId,
      workspace: eq.workspace,
      borrowCount: borrowCounts.get(eq.id) || 0,
    }));

    res.render("admin/manage-equipment", {
      equipment,
      workspaces,
    });
  }),
);

// ******************************************************************************
// Route to create a new equipment / tool
// ******************************************************************************

router.post(
  "/create",
  asyncHandler(async (req, res) => {
    const { name, workspaceId } = req.body;

    if (!name || !name.trim()) {
      req.session.notification = "Error: Le nom de l'équipement ne peut pas être vide.";
      return res.redirect("/admin/equipment/manage");
    }

    const trimmedName = name.trim();
    const wsId = workspaceId && workspaceId !== "" ? Number(workspaceId) : null;

    try {
      const existing = await prisma.equipment.findUnique({
        where: { name: trimmedName },
      });

      if (existing) {
        req.session.notification = "Error: Un équipement portant ce nom existe déjà.";
        return res.redirect("/admin/equipment/manage");
      }

      const item = await prisma.equipment.create({
        data: {
          name: trimmedName,
          workspaceId: wsId,
        },
      });

      invalidateCache(req);
      logger.logThat(`Equipment ${trimmedName} created by ${req.session.username}`);
      req.session.notification = `Success: Équipement "${trimmedName}" ajouté avec succès`;
    } catch (error) {
      console.error("Error creating equipment:", error);
      req.session.notification = "Error: Impossible d'ajouter cet équipement";
    }

    res.redirect("/admin/equipment/manage");
  }),
);

// ******************************************************************************
// Route to update an equipment / tool
// ******************************************************************************

router.post(
  "/update",
  asyncHandler(async (req, res) => {
    const { id, name, workspaceId } = req.body;

    if (!id || !name || !name.trim()) {
      req.session.notification = "Error: Nom d'équipement invalide.";
      return res.redirect("/admin/equipment/manage");
    }

    const trimmedName = name.trim();
    const equipId = Number(id);
    const wsId = workspaceId && workspaceId !== "" ? Number(workspaceId) : null;

    try {
      const existing = await prisma.equipment.findFirst({
        where: {
          name: trimmedName,
          NOT: { id: equipId },
        },
      });

      if (existing) {
        req.session.notification = "Error: Un autre équipement porte déjà ce nom.";
        return res.redirect("/admin/equipment/manage");
      }

      const updated = await prisma.equipment.update({
        where: { id: equipId },
        data: {
          name: trimmedName,
          workspaceId: wsId,
        },
      });

      invalidateCache(req);
      logger.logThat(`Equipment #${equipId} updated by ${req.session.username}`);
      req.session.notification = `Success: Équipement "${trimmedName}" mis à jour`;
    } catch (error) {
      console.error("Error updating equipment:", error);
      req.session.notification = "Error: Impossible de mettre à jour cet équipement";
    }

    res.redirect("/admin/equipment/manage");
  }),
);

// ******************************************************************************
// Route to delete an equipment / tool
// ******************************************************************************

router.get(
  "/delete/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const equipId = Number(id);

    try {
      const item = await prisma.equipment.findUnique({
        where: { id: equipId },
      });

      if (!item) {
        req.session.notification = "Error: Équipement introuvable.";
        return res.redirect("/admin/equipment/manage");
      }

      // Check if activities are linked to this equipment
      const linkedActivities = await prisma.activity.count({
        where: {
          resourceType: ResourceType.EQUIPMENT,
          resourceId: equipId,
        },
      });

      if (linkedActivities > 0) {
        // Unlink or inform
        await prisma.activity.deleteMany({
          where: {
            resourceType: ResourceType.EQUIPMENT,
            resourceId: equipId,
          },
        });
      }

      await prisma.equipment.delete({
        where: { id: equipId },
      });

      invalidateCache(req);
      logger.logThat(`Equipment ${item.name} deleted by ${req.session.username}`);
      req.session.notification = `Success: Équipement "${item.name}" supprimé`;
    } catch (error) {
      console.error("Error deleting equipment:", error);
      req.session.notification = "Error: Impossible de supprimer cet équipement";
    }

    res.redirect(req.session.lastPage || "/admin/equipment/manage");
  }),
);

module.exports = router;
