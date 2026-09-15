const express = require("express");
const router = express.Router();

const asyncHandler = require("../../middleware/asyncHandler.js");
const clearNotification = require("../../middleware/clearNotification.js");
const isAdmin = require("../../middleware/checkAdmin.js");
const { invalidateCache } = require("../../middleware/cacheHelper.js");
const { validateBody } = require("../../middleware/validate.js");
const { addEquipmentSchema, updateEquipmentSchema } = require("../../schemas/equipment.schema.js");
const { returnEquipmentSchema } = require("../../schemas/history.schema.js");

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

    // Fetch all active loans (not yet returned)
    const activeLoansRaw = await prisma.activity.findMany({
      where: {
        resourceType: ResourceType.EQUIPMENT,
        returnedAt: null,
      },
      include: {
        user: true,
        history: {
          include: { workspace: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const equipMap = new Map(equipmentList.map((eq) => [eq.id, eq]));
    const now = new Date();

    const activeLoans = activeLoansRaw.map((act) => {
      const eq = equipMap.get(act.resourceId);
      const isOverdue = act.expectedReturnAt ? new Date(act.expectedReturnAt) < now : false;
      let daysDiff = null;
      if (act.expectedReturnAt) {
        const diffMs = new Date(act.expectedReturnAt) - now;
        daysDiff = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      }

      return {
        id: act.id,
        createdAt: act.createdAt,
        formattedDate: act.createdAt.toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        borrowDurationDays: act.borrowDurationDays || null,
        expectedReturnAt: act.expectedReturnAt,
        formattedExpectedReturn: act.expectedReturnAt
          ? act.expectedReturnAt.toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })
          : "-",
        isOverdue,
        daysDiff,
        user: act.user,
        equipment: eq || null,
        workspace:
          act.history && act.history.workspace
            ? act.history.workspace.name
            : eq && eq.workspace
            ? eq.workspace.name
            : "-",
      };
    });

    const activeBorrowedEquipIds = new Set(activeLoansRaw.map((a) => a.resourceId));
    const equipment = equipmentList.map((eq) => ({
      id: eq.id,
      name: eq.name,
      workspaceId: eq.workspaceId,
      workspace: eq.workspace,
      borrowCount: borrowCounts.get(eq.id) || 0,
      isCurrentlyBorrowed: activeBorrowedEquipIds.has(eq.id),
      currentBorrowers: activeLoans
        .filter((l) => l.equipment && l.equipment.id === eq.id)
        .map((l) => (l.user ? `${l.user.name} ${l.user.surname}` : `Usager #${l.user?.id}`)),
    }));

    res.render("admin/manage-equipment", {
      equipment,
      workspaces,
      activeLoans,
    });
  }),
);

// ******************************************************************************
// Route to create a new equipment / tool
// ******************************************************************************

router.post(
  "/create",
  validateBody(addEquipmentSchema, { redirectUrl: "/admin/equipment/manage" }),
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
  validateBody(updateEquipmentSchema, { redirectUrl: "/admin/equipment/manage" }),
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

// ******************************************************************************
// Route to return borrowed equipment from admin panel
// ******************************************************************************

router.post(
  "/return/:id",
  validateBody(returnEquipmentSchema, { redirectUrl: "/admin/equipment/manage" }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { returnNotes } = req.body;

    const activity = await prisma.activity.findUnique({
      where: { id: Number(id) },
      include: { user: true },
    });

    if (!activity || activity.resourceType !== ResourceType.EQUIPMENT) {
      req.session.notification = "Error: Emprunt introuvable.";
      return res.redirect("/admin/equipment/manage");
    }

    await prisma.activity.update({
      where: { id: Number(id) },
      data: {
        returnedAt: new Date(),
        returnNotes: returnNotes && returnNotes.trim() ? returnNotes.trim() : null,
      },
    });

    const eqItem = await prisma.equipment.findUnique({ where: { id: activity.resourceId } });
    const eqName = eqItem ? eqItem.name : `#${activity.resourceId}`;
    const borrowerName = activity.user ? `${activity.user.name} ${activity.user.surname}` : `usager #${activity.userId}`;

    logger.logThat(`Équipement "${eqName}" restitué par ${borrowerName} (enregistré par l'admin ${req.session.username}).`);
    req.session.notification = `Success: L'équipement "${eqName}" a été marqué comme restitué.`;

    res.redirect(req.headers.referer || "/admin/equipment/manage");
  }),
);

module.exports = router;
