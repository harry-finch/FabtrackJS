var express = require("express");
var router = express.Router();

const asyncHandler = require("../middleware/asyncHandler.js");
const isLoggedIn = require("../middleware/checkSession.js");
const { invalidateCache } = require("../middleware/cacheHelper.js");

router.use(isLoggedIn);

const { PrismaClient, ResourceType, ConsumableStatus } = require("@prisma/client");
const prisma = new PrismaClient();
const mailService = require("../services/mailService.js");

// Helper to update consumable stock and status
async function consumeItem(consumableId, quantity) {
  const consumable = await prisma.consumable.findUnique({
    where: { id: Number(consumableId) },
  });
  if (!consumable) return null;

  const newStock = Math.max(0, consumable.stock - Number(quantity));
  let newStatus = ConsumableStatus.AVAILABLE;
  if (newStock <= 0) {
    newStatus = ConsumableStatus.OUT_OF_STOCK;
  } else if (newStock <= consumable.reorderThreshold) {
    newStatus = ConsumableStatus.LOW_STOCK;
  }

  await prisma.consumable.update({
    where: { id: consumable.id },
    data: {
      stock: newStock,
      status: newStatus,
    },
  });

  // Alert admin if stock just reached or fell below reorder threshold
  if (newStock <= consumable.reorderThreshold && (consumable.stock > consumable.reorderThreshold || (consumable.stock > 0 && newStock === 0))) {
    mailService.sendLowStockAlert(consumable, newStock).catch((err) => {
      console.error("[consumeItem] Failed to send low stock alert email:", err);
    });
  }

  return consumable;
}

// ******************************************************************************
// Route to create a history entry (arrival)
// ******************************************************************************

router.post(
  "/create",
  asyncHandler(async (req, res) => {
    let { userid, projecttype, projectid, userprojectid, documentation, comments, teachingUnitId, unregisteredUeName, unregisteredUeContact, repairObject, workshopId } = req.body;

    const parsedUserId = Number(userid);
    if (!parsedUserId || isNaN(parsedUserId)) {
      req.session.notification = "Error: Invalid user selected.";
      return res.redirect("/fabtrack");
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: parsedUserId },
    });

    if (!targetUser) {
      req.session.notification = "Error: Utilisateur introuvable.";
      return res.redirect("/fabtrack");
    }

    if (!targetUser.termsAccepted) {
      req.session.notification = `Warning: ${targetUser.name} ${targetUser.surname} n'a pas encore signé la charte d'utilisation et ne peut pas accéder au lab.`;
      return res.redirect("/fabtrack");
    }

    const cleanRepairObject = repairObject && repairObject.trim() ? repairObject.trim() : null;
    let parsedWorkshopId = null;
    if (workshopId && workshopId !== "null" && workshopId !== "") {
      const num = Number(workshopId);
      if (!isNaN(num) && num > 0) {
        parsedWorkshopId = num;
      }
    }

    let parsedTeachingUnitId = null;
    let parsedUnregisteredUeName = null;
    let parsedUnregisteredUeContact = null;

    if (teachingUnitId === "unregistered") {
      parsedTeachingUnitId = null;
      parsedUnregisteredUeName = unregisteredUeName && unregisteredUeName.trim() ? unregisteredUeName.trim() : "UE non-enregistrée";
      parsedUnregisteredUeContact = unregisteredUeContact && unregisteredUeContact.trim() ? unregisteredUeContact.trim() : null;
    } else if (teachingUnitId && teachingUnitId !== "null" && teachingUnitId !== "") {
      const num = Number(teachingUnitId);
      if (!isNaN(num)) {
        parsedTeachingUnitId = num;
      }
    }

    // Checking if the user is already here to avoid conflicts
    const alreadyHere = await prisma.history.findMany({
      where: {
        userId: parsedUserId,
        departure: null,
      },
    });

    if (alreadyHere.length === 0) {
      let attendedWorkshop = null;
      if (parsedWorkshopId) {
        attendedWorkshop = await prisma.workshop.findUnique({
          where: { id: parsedWorkshopId },
          include: { access: true },
        });
      }

      if (!projectid || projectid === "null" || projectid === "") {
        if (attendedWorkshop) {
          // Create or retrieve project for this workshop
          const uniqueSlug = `workshop://${encodeURIComponent(attendedWorkshop.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50))}-${attendedWorkshop.id}`;
          let project = await prisma.project.findFirst({
            where: { url: uniqueSlug },
          });
          if (!project) {
            project = await prisma.project.create({
              data: {
                url: uniqueSlug,
                projecttypeId: projecttype ? Number(projecttype) : 1,
              },
            });
          }
          projectid = project.id;
        } else if (cleanRepairObject) {
          // Create synthetic project for Repair Café item
          const uniqueSlug = `repair-cafe://${encodeURIComponent(cleanRepairObject.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50))}-${Date.now()}`;
          const project = await prisma.project.create({
            data: {
              url: uniqueSlug,
              projecttypeId: projecttype ? Number(projecttype) : 1,
            },
          });
          projectid = project.id;
        } else if (documentation && documentation.trim() !== "") {
          // If project does not exist in the db, create the project
          const project = await prisma.project.create({
            data: {
              url: documentation.trim(),
              projecttypeId: projecttype ? Number(projecttype) : 1,
              teachingUnitId: parsedTeachingUnitId,
              unregisteredUeName: parsedUnregisteredUeName,
              unregisteredUeContact: parsedUnregisteredUeContact,
            },
          });
          projectid = project.id;
        }
      } else if (parsedTeachingUnitId) {
        // If project exists, update its teachingUnitId if provided
        try {
          await prisma.project.update({
            where: { id: Number(projectid) },
            data: {
              teachingUnitId: parsedTeachingUnitId,
              unregisteredUeName: null,
              unregisteredUeContact: null,
            },
          });
        } catch (e) {
          console.error("Error updating project teachingUnitId:", e);
        }
      } else if (parsedUnregisteredUeName) {
        try {
          await prisma.project.update({
            where: { id: Number(projectid) },
            data: {
              teachingUnitId: null,
              unregisteredUeName: parsedUnregisteredUeName,
              unregisteredUeContact: parsedUnregisteredUeContact,
            },
          });
        } catch (e) {
          console.error("Error updating project unregistered UE:", e);
        }
      }

      // Associate project with user if not already linked
      if (projectid && projectid !== "null" && (!userprojectid || userprojectid === "null" || userprojectid === "")) {
        const existingUP = await prisma.userProject.findFirst({
          where: {
            userId: parsedUserId,
            projectId: Number(projectid),
          },
        });

        if (existingUP) {
          userprojectid = existingUP.id;
        } else {
          const userproject = await prisma.userProject.create({
            data: {
              userId: parsedUserId,
              projectId: Number(projectid),
            },
          });
          userprojectid = userproject.id;
        }
      }

      const activeWorkspaceId =
        req.session.selectedWorkspace && req.session.selectedWorkspace.id > 0
          ? req.session.selectedWorkspace.id
          : null;

      await prisma.history.create({
        data: {
          userId: parsedUserId,
          userprojectId: userprojectid && userprojectid !== "null" ? Number(userprojectid) : null,
          teachingUnitId: parsedTeachingUnitId,
          unregisteredUeName: parsedUnregisteredUeName,
          unregisteredUeContact: parsedUnregisteredUeContact,
          comments: comments || null,
          workspaceId: activeWorkspaceId,
          repairObject: cleanRepairObject,
          repairStatus: cleanRepairObject ? "PENDING" : null,
          workshopId: parsedWorkshopId,
        },
      });

      // Automatically award workshop badge and machine habilitation to user
      if (parsedWorkshopId && attendedWorkshop) {
        try {
          const workshopService = require("../services/workshopService.js");
          await workshopService.awardWorkshopBadge(
            parsedUserId,
            parsedWorkshopId,
            req.session.username || "Atelier Fabtrack",
          );
          req.session.notification = `Success: Usager enregistré à l'atelier "${attendedWorkshop.name}" ! Le badge a été automatiquement ajouté à son profil.`;
        } catch (err) {
          console.error("Error awarding workshop badge during check-in:", err);
          req.session.notification = "Success: User is now in the lab (erreur lors de l'attribution du badge).";
        }
      } else {
        req.session.notification = "Success: User is now in the lab!";
      }
    } else {
      req.session.notification = "Error: User is already in the lab!";
    }
    res.redirect("/fabtrack");
  }),
);

// ******************************************************************************
// Route to close a history entry (departure)
// ******************************************************************************

router.get(
  "/exit/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const now = new Date();

    await prisma.history.update({
      where: {
        id: Number(id),
      },
      data: {
        departure: now,
      },
    });

    req.session.notification = "Success: User has left the lab!";
    res.redirect("/fabtrack");
  }),
);

// ******************************************************************************
// Route to close a Repair Café history entry with outcome evaluation
// ******************************************************************************

router.post(
  "/exit-repair",
  asyncHandler(async (req, res) => {
    const { historyid, repairStatus, repairNotes } = req.body;
    const repairCafeService = require("../services/repairCafeService.js");

    try {
      await repairCafeService.recordRepairExit(historyid, { repairStatus, repairNotes });
      req.session.notification = "Success: Bilan de réparation enregistré et sortie validée !";
    } catch (err) {
      console.error("Error recording repair exit:", err);
      req.session.notification = "Error: Impossible d'enregistrer la sortie Repair Café.";
    }

    res.redirect("/fabtrack");
  }),
);

// ******************************************************************************
// Route to delete a history entry
// ******************************************************************************

router.get(
  "/delete/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
      await prisma.history.delete({
        where: { id: Number(id) },
      });
      req.session.notification = "Success: History entry deleted.";
    } catch (error) {
      console.error("Error deleting history entry:", error);
      req.session.notification = "Error: Failed to delete history entry.";
    }

    res.redirect(req.session.lastPage || "/admin/view-history");
  }),
);

// ******************************************************************************
// Route to update a history entry
// ******************************************************************************

router.post(
  "/update",
  asyncHandler(async (req, res) => {
    const { historyid, arrival, departure, workspaceId, comments } = req.body;

    try {
      await prisma.history.update({
        where: { id: Number(historyid) },
        data: {
          arrival: arrival ? new Date(arrival) : undefined,
          departure: departure ? new Date(departure) : null,
          workspaceId: workspaceId ? Number(workspaceId) : null,
          comments: comments || null,
        },
      });

      req.session.notification = "Success: History entry updated.";
    } catch (error) {
      console.error("Error updating history entry:", error);
      req.session.notification = "Error: Failed to update history entry.";
    }

    res.redirect(req.session.lastPage || "/admin/view-history");
  }),
);

// ******************************************************************************
// Route to update a history entry's comments (e.g. from kiosk modal)
// ******************************************************************************

router.post(
  "/update-comment",
  asyncHandler(async (req, res) => {
    if (req.session.role === "staff") {
      req.session.notification = "Warning: La modification des commentaires est réservée aux médiateurs.";
      return res.redirect(req.session.lastPage || "/fabtrack");
    }

    const { historyid, comments } = req.body;

    if (!historyid) {
      req.session.notification = "Error: Identifiant de session manquant.";
      return res.redirect(req.session.lastPage || "/fabtrack");
    }

    try {
      const trimmedComments = comments && typeof comments === "string" ? comments.trim() : null;
      await prisma.history.update({
        where: { id: Number(historyid) },
        data: {
          comments: trimmedComments && trimmedComments.length > 0 ? trimmedComments : null,
        },
      });

      req.session.notification = "Success: Commentaire mis à jour avec succès.";
    } catch (error) {
      console.error("Error updating history comment:", error);
      req.session.notification = "Error: Impossible de mettre à jour le commentaire.";
    }

    res.redirect(req.session.lastPage || "/fabtrack");
  }),
);


// ******************************************************************************
// Route to unarchive a project
// ******************************************************************************

router.get(
  "/project/unarchive/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    await prisma.project.update({
      where: { id: Number(id) },
      data: { active: true },
    });

    req.session.notification = "Success: Project unarchived!";
    res.redirect(req.session.lastPage || "/fabtrack");
  }),
);

// ******************************************************************************
// Route to archive a project
// ******************************************************************************

router.get(
  "/project/archive/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    await prisma.project.update({
      where: { id: Number(id) },
      data: { active: false },
    });

    req.session.notification = "Success: Project archived!";
    res.redirect(req.session.lastPage || "/fabtrack");
  }),
);

// ******************************************************************************
// Route to add an activity associated with a history entry (Machines / Equipment / Consumables)
// ******************************************************************************

router.post(
  "/activity",
  asyncHandler(async (req, res) => {
    if (req.session.role === "staff") {
      req.session.notification = "Warning: Les ajouts d'activités sont réservés aux médiateurs.";
      return res.redirect("/fabtrack");
    }

    const { activityhistoryid, activityuserid, machineId, equipmentId, consumable, quantity } = req.body;

    const histId = activityhistoryid && activityhistoryid !== "null" ? Number(activityhistoryid) : null;
    const usrId = activityuserid && activityuserid !== "null" ? Number(activityuserid) : null;

    let recordedCount = 0;

    // 1. Machine Usage
    if (machineId && machineId !== "" && machineId !== "null") {
      await prisma.activity.create({
        data: {
          historyId: histId,
          userId: usrId,
          resourceId: Number(machineId),
          resourceType: ResourceType.MACHINE,
        },
      });
      recordedCount++;
    }

    // 2. Equipment Borrow
    if (equipmentId && equipmentId !== "" && equipmentId !== "null") {
      await prisma.activity.create({
        data: {
          historyId: histId,
          userId: usrId,
          resourceId: Number(equipmentId),
          resourceType: ResourceType.EQUIPMENT,
        },
      });
      recordedCount++;
    }

    // 3. Consumable Usage
    if (consumable && consumable !== "" && consumable !== "null") {
      const qty = parseInt(quantity, 10) || 1;
      const consumed = await consumeItem(consumable, qty);

      if (consumed) {
        const totalPrice = Number((Number(consumed.cost) * qty).toFixed(2));

        // Check if this history entry is associated with a Teaching Unit (UE)
        let isCoveredByUe = false;
        let ueInfo = null;
        if (histId) {
          const histEntry = await prisma.history.findUnique({
            where: { id: histId },
            include: { teachingUnit: true },
          });
          if (histEntry) {
            if (histEntry.teachingUnit) {
              isCoveredByUe = true;
              ueInfo = histEntry.teachingUnit;
            } else if (histEntry.unregisteredUeName) {
              isCoveredByUe = true;
              ueInfo = {
                code: histEntry.unregisteredUeName,
                name: histEntry.unregisteredUeName,
                isUnregistered: true,
              };
            }
          }
        }

        // Decrement user balance ONLY if NOT covered by a Teaching Unit (UE)
        if (usrId && !isCoveredByUe) {
          await prisma.user.update({
            where: { id: usrId },
            data: { balance: { decrement: totalPrice } },
          });
        }

        await prisma.activity.create({
          data: {
            historyId: histId,
            userId: usrId,
            resourceId: Number(consumable),
            resourceType: ResourceType.CONSUMABLE,
            quantity: qty,
          },
        });
        recordedCount++;

        if (isCoveredByUe) {
          if (ueInfo && ueInfo.isUnregistered) {
            req.session.notification = `Success: Activité enregistrée. Prise en charge UE non-enregistrée (${ueInfo.code}) : solde étudiant non débité (${totalPrice.toFixed(2)} € en attente de régularisation).`;
          } else {
            req.session.notification = `Success: Activité enregistrée. Prise en charge UE (${ueInfo.code}) : solde étudiant non débité (${totalPrice.toFixed(2)} € imputés à l'UE).`;
          }
        }
      }
    }

    if (recordedCount > 0) {
      if (!req.session.notification) {
        req.session.notification = "Success: Lab activity recorded successfully!";
      }
    } else {
      req.session.notification = "Warning: No resource was selected for this activity.";
    }

    res.redirect(req.session.lastPage || "/fabtrack");
  }),
);

// ******************************************************************************
// Route to clear a user's debt
// ******************************************************************************

router.get(
  "/cleardebt/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    await prisma.user.update({
      where: { id: Number(id) },
      data: { balance: 0.0 },
    });

    req.session.notification = "Success: Debt paid!";
    res.redirect(req.session.lastPage || "/fabtrack");
  }),
);

// ******************************************************************************
// Route to credit a user's account
// ******************************************************************************

router.post(
  "/credit",
  asyncHandler(async (req, res) => {
    const { userid, money } = req.body;

    await prisma.user.update({
      where: { id: Number(userid) },
      data: { balance: { increment: Number(money) } },
    });

    req.session.notification = "Success: Account credited!";
    res.redirect(req.session.lastPage || "/fabtrack");
  }),
);

module.exports = router;
