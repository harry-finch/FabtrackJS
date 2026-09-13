var express = require("express");
var router = express.Router();

const asyncHandler = require("../../middleware/asyncHandler.js");
const clearNotification = require("../../middleware/clearNotification.js");
const isAdmin = require("../../middleware/checkAdmin.js");
const { invalidateCache } = require("../../middleware/cacheHelper.js");
const logger = require("../../utilities/simpleLogger.js");

router.use(isAdmin);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const dateService = require("../../services/dateService.js");

function formatDateTime(date) {
  return dateService.formatDateTime(date);
}

// ******************************************************************************
// Route to manage workshops
// ******************************************************************************

router.get(
  "/manage",
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/workshops/manage";

    const workshops = await prisma.workshop.findMany({
      include: {
        access: true,
        interests: {
          include: { user: true },
          orderBy: { createdAt: "desc" },
        },
        completions: {
          include: { user: true },
          orderBy: { awardedAt: "desc" },
        },
      },
      orderBy: { name: "asc" },
    });

    // Format dates for display
    workshops.forEach((ws) => {
      ws.formattedCreatedAt = formatDateTime(ws.createdAt);
      ws.interests.forEach((item) => {
        item.formattedDate = formatDateTime(item.createdAt);
      });
      ws.completions.forEach((item) => {
        item.formattedDate = formatDateTime(item.awardedAt);
      });
    });

    const accessLevels = await prisma.access.findMany({
      orderBy: { name: "asc" },
    });

    res.render("admin/manage-workshops", {
      workshops,
      accessLevels,
    });
  }),
);

// ******************************************************************************
// Route to create a workshop
// ******************************************************************************

router.post(
  "/create",
  clearNotification,
  asyncHandler(async (req, res) => {
    const { name, description, accessId } = req.body;

    try {
      const workshop = await prisma.workshop.create({
        data: {
          name: name.trim(),
          description: description ? description.trim() : null,
          accessId: accessId && accessId !== "" ? Number(accessId) : null,
        },
      });

      await logger.logThat(`Workshop ${workshop.name} created by ${req.session.username}`);
      req.session.notification = `Success: L'atelier "${workshop.name}" a été créé avec succès.`;
    } catch (error) {
      console.error("Error creating workshop:", error);
      req.session.notification = error.code === "P2002"
        ? "Error: Un atelier portant ce nom existe déjà."
        : "Error: Impossible de créer l'atelier.";
    }

    res.redirect(req.session.lastPage || "/admin/workshops/manage");
  }),
);

// ******************************************************************************
// Route to update a workshop
// ******************************************************************************

router.post(
  "/update",
  clearNotification,
  asyncHandler(async (req, res) => {
    const { workshopid, name, description, accessId } = req.body;

    try {
      const workshop = await prisma.workshop.update({
        where: { id: Number(workshopid) },
        data: {
          name: name.trim(),
          description: description ? description.trim() : null,
          accessId: accessId && accessId !== "" ? Number(accessId) : null,
        },
      });

      await logger.logThat(`Workshop ${workshop.name} updated by ${req.session.username}`);
      req.session.notification = `Success: L'atelier "${workshop.name}" a été mis à jour avec succès.`;
    } catch (error) {
      console.error("Error updating workshop:", error);
      req.session.notification = "Error: Impossible de mettre à jour l'atelier.";
    }

    res.redirect(req.session.lastPage || "/admin/workshops/manage");
  }),
);

// ******************************************************************************
// Route to delete a workshop
// ******************************************************************************

router.get(
  "/delete/:id",
  clearNotification,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
      const workshop = await prisma.workshop.delete({
        where: { id: Number(id) },
      });

      await logger.logThat(`Workshop ${workshop.name} deleted by ${req.session.username}`);
      req.session.notification = `Success: L'atelier "${workshop.name}" a été supprimé.`;
    } catch (error) {
      console.error("Error deleting workshop:", error);
      req.session.notification = "Error: Impossible de supprimer l'atelier.";
    }

    res.redirect(req.session.lastPage || "/admin/workshops/manage");
  }),
);

// ******************************************************************************
// Route to award badge / validate completed workshop
// ******************************************************************************

router.post(
  "/award-badge",
  clearNotification,
  asyncHandler(async (req, res) => {
    const { userId, workshopId, removeInterest } = req.body;
    const uId = Number(userId);
    const wId = Number(workshopId);

    try {
      // 1. Award badge / record completion
      await prisma.userWorkshopCompletion.upsert({
        where: {
          userId_workshopId: {
            userId: uId,
            workshopId: wId,
          },
        },
        create: {
          userId: uId,
          workshopId: wId,
          awardedBy: req.session.username || "Staff",
        },
        update: {
          awardedAt: new Date(),
          awardedBy: req.session.username || "Staff",
        },
      });

      // 2. Remove interest if requested (default behavior when workshop completed)
      if (removeInterest === "true" || removeInterest === true || removeInterest === "1") {
        await prisma.userWorkshopInterest.deleteMany({
          where: {
            userId: uId,
            workshopId: wId,
          },
        });
      }

      const workshop = await prisma.workshop.findUnique({ where: { id: wId } });
      const user = await prisma.user.findUnique({ where: { id: uId } });

      await logger.logThat(`Badge for workshop "${workshop ? workshop.name : wId}" awarded to ${user ? user.name + " " + user.surname : uId} by ${req.session.username}`);
      req.session.notification = `Success: Badge d'atelier attribué à ${user ? user.name + " " + user.surname : "l'utilisateur"} !`;
    } catch (error) {
      console.error("Error awarding workshop badge:", error);
      req.session.notification = "Error: Impossible d'attribuer le badge d'atelier.";
    }

    res.redirect(req.session.lastPage || "/admin/workshops/manage");
  }),
);

// ******************************************************************************
// Route to remove interest
// ******************************************************************************

router.get(
  "/remove-interest/:workshopId/:userId",
  asyncHandler(async (req, res) => {
    const { workshopId, userId } = req.params;

    try {
      await prisma.userWorkshopInterest.deleteMany({
        where: {
          workshopId: Number(workshopId),
          userId: Number(userId),
        },
      });

      req.session.notification = "Success: Intérêt pour l'atelier retiré.";
    } catch (error) {
      console.error("Error removing interest:", error);
      req.session.notification = "Error: Impossible de retirer l'intérêt.";
    }

    res.redirect(req.session.lastPage || "/admin/workshops/manage");
  }),
);

// ******************************************************************************
// Route to add interest directly from admin
// ******************************************************************************

router.post(
  "/add-interest",
  asyncHandler(async (req, res) => {
    const { userId, workshopId } = req.body;

    try {
      await prisma.userWorkshopInterest.upsert({
        where: {
          userId_workshopId: {
            userId: Number(userId),
            workshopId: Number(workshopId),
          },
        },
        create: {
          userId: Number(userId),
          workshopId: Number(workshopId),
        },
        update: {},
      });

      req.session.notification = "Success: Intérêt enregistré pour l'utilisateur.";
    } catch (error) {
      console.error("Error adding interest:", error);
      req.session.notification = "Error: Impossible d'enregistrer l'intérêt.";
    }

    res.redirect(req.session.lastPage || "/admin/workshops/manage");
  }),
);

module.exports = router;
