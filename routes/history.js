var express = require("express");
var router = express.Router();

const asyncHandler = require("../middleware/asyncHandler.js");
const isLoggedIn = require("../middleware/checkSession.js");
const requireRoles = require("../middleware/requireRoles.js");
const { isApiOrAjaxRequest } = requireRoles;
const { invalidateCache } = require("../middleware/cacheHelper.js");
const { validateBody, validateParams } = require("../middleware/validate.js");
const { idParamSchema } = require("../schemas/common.schema.js");
const {
  createVisitSchema,
  creditSchema,
  adjustBalanceSchema,
  activitySchema,
  returnEquipmentSchema,
  updateCommentSchema,
  exitRepairSchema,
  updateHistorySchema,
} = require("../schemas/history.schema.js");

router.use(isLoggedIn);

const { prisma, ResourceType } = require("../utilities/db.js");
const mailService = require("../services/mailService.js");
const balanceService = require("../services/balanceService.js");
const { computeConsumableStatus } = require("../services/consumableStatusHelper.js");
const equipmentLoanService = require("../services/equipmentLoanService.js");
const realtimeService = require("../services/realtimeService.js");
const logger = require("../utilities/simpleLogger.js");

function respondKioskMutation(req, res, { ok, type, message, redirectUrl = "/fabtrack", workspaceId = null, action = "update", entity = "history" }) {
  if (ok) {
    realtimeService.publish("kiosk", { workspaceId, action });
    realtimeService.publish("admin", { entity, action });
  }
  const prefix = type === "error" ? "Error" : type === "warning" ? "Warning" : type === "info" ? "Info" : "Success";
  if (isApiOrAjaxRequest(req)) {
    return res.status(ok ? 200 : 400).json({ ok: Boolean(ok), type: type || (ok ? "success" : "error"), message });
  }
  if (req.session && message) {
    req.session.notification = /^(Success|Error|Warning|Info)\s*:/i.test(message) ? message : `${prefix}: ${message}`;
  }
  return res.redirect(redirectUrl);
}

// Helper to update consumable stock and status inside an active Prisma transaction (or default client)
async function consumeItemTx(tx, consumableId, quantity) {
  const consumable = await tx.consumable.findUnique({
    where: { id: Number(consumableId) },
  });
  if (!consumable) return null;

  const newStock = Math.max(0, consumable.stock - Number(quantity));
  const newStatus = computeConsumableStatus(newStock, consumable.reorderThreshold);

  await tx.consumable.update({
    where: { id: consumable.id },
    data: {
      stock: newStock,
      status: newStatus,
    },
  });

  const shouldAlertLowStock =
    newStock <= consumable.reorderThreshold &&
    (consumable.stock > consumable.reorderThreshold || (consumable.stock > 0 && newStock === 0));

  return { consumable, newStock, shouldAlertLowStock };
}

// ******************************************************************************
// Route to create a history entry (arrival)
// ******************************************************************************

router.post(
  "/create",
  validateBody(createVisitSchema, { redirectUrl: "/fabtrack" }),
  asyncHandler(async (req, res) => {
    let { userid, projecttype, projectid, userprojectid, documentation, comments, teachingUnitId, unregisteredUeName, unregisteredUeContact, repairObject, workshopId, sorbonneEntity } = req.body;

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
    const cleanSorbonneEntity = sorbonneEntity && sorbonneEntity.trim() ? sorbonneEntity.trim() : null;
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

    const activeWorkspaceId =
      req.session.selectedWorkspace && req.session.selectedWorkspace.id > 0
        ? req.session.selectedWorkspace.id
        : null;

    const runCheckIn = async (tx) => {
      // Checking if the user is already here to avoid conflicts
      const alreadyHere = await tx.history.findMany({
        where: {
          userId: parsedUserId,
          departure: null,
        },
      });

      if (alreadyHere.length > 0) {
        return { alreadyHere: true };
      }

      let attendedWorkshop = null;
      if (parsedWorkshopId) {
        attendedWorkshop = await tx.workshop.findUnique({
          where: { id: parsedWorkshopId },
          include: { access: true },
        });
      }

      let resolvedProjectId = projectid && projectid !== "null" && projectid !== "" ? Number(projectid) : null;
      let resolvedUserProjectId =
        userprojectid && userprojectid !== "null" && userprojectid !== "" ? Number(userprojectid) : null;

      // Verify ownership when an explicit userprojectid is submitted
      if (resolvedUserProjectId) {
        const ownedUP = await tx.userProject.findFirst({
          where: { id: resolvedUserProjectId, userId: parsedUserId },
          select: { id: true, projectId: true },
        });
        if (!ownedUP) {
          resolvedUserProjectId = null;
        } else if (!resolvedProjectId) {
          resolvedProjectId = ownedUP.projectId;
        }
      }

      if (!resolvedProjectId) {
        if (attendedWorkshop) {
          const uniqueSlug = `workshop://${encodeURIComponent(attendedWorkshop.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50))}-${attendedWorkshop.id}`;
          let project = await tx.project.findUnique({
            where: { url: uniqueSlug },
          });
          if (!project) {
            project = await tx.project.create({
              data: {
                url: uniqueSlug,
                projecttypeId: projecttype ? Number(projecttype) : 1,
              },
            });
          }
          resolvedProjectId = project.id;
        } else if (cleanRepairObject) {
          const uniqueSlug = `repair-cafe://${encodeURIComponent(cleanRepairObject.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50))}-${Date.now()}`;
          const project = await tx.project.create({
            data: {
              url: uniqueSlug,
              projecttypeId: projecttype ? Number(projecttype) : 1,
            },
          });
          resolvedProjectId = project.id;
        } else if (documentation && documentation.trim() !== "") {
          const cleanDoc = documentation.trim();
          let project = await tx.project.findUnique({
            where: { url: cleanDoc },
          });
          if (!project) {
            project = await tx.project.create({
              data: {
                url: cleanDoc,
                projecttypeId: projecttype ? Number(projecttype) : 1,
                teachingUnitId: parsedTeachingUnitId,
                unregisteredUeName: parsedUnregisteredUeName,
                unregisteredUeContact: parsedUnregisteredUeContact,
                sorbonneEntity: cleanSorbonneEntity,
              },
            });
          }
          resolvedProjectId = project.id;
        }
      } else if (parsedTeachingUnitId) {
        await tx.project.update({
          where: { id: resolvedProjectId },
          data: {
            teachingUnitId: parsedTeachingUnitId,
            unregisteredUeName: null,
            unregisteredUeContact: null,
          },
        });
      } else if (parsedUnregisteredUeName) {
        await tx.project.update({
          where: { id: resolvedProjectId },
          data: {
            teachingUnitId: null,
            unregisteredUeName: parsedUnregisteredUeName,
            unregisteredUeContact: parsedUnregisteredUeContact,
          },
        });
      }

      if (cleanSorbonneEntity && resolvedProjectId) {
        await tx.project.update({
          where: { id: resolvedProjectId },
          data: {
            sorbonneEntity: cleanSorbonneEntity,
          },
        });
      }

      let resolvedSorbonneEntity = cleanSorbonneEntity;
      if (!resolvedSorbonneEntity && resolvedProjectId) {
        const existingProj = await tx.project.findUnique({
          where: { id: resolvedProjectId },
          select: { sorbonneEntity: true },
        });
        if (existingProj && existingProj.sorbonneEntity) {
          resolvedSorbonneEntity = existingProj.sorbonneEntity;
        }
      }

      if (resolvedProjectId && !resolvedUserProjectId) {
        const existingUP = await tx.userProject.findFirst({
          where: {
            userId: parsedUserId,
            projectId: resolvedProjectId,
          },
        });

        if (existingUP) {
          resolvedUserProjectId = existingUP.id;
        } else {
          const userproject = await tx.userProject.create({
            data: {
              userId: parsedUserId,
              projectId: resolvedProjectId,
            },
          });
          resolvedUserProjectId = userproject.id;
        }
      }

      await tx.history.create({
        data: {
          userId: parsedUserId,
          userprojectId: resolvedUserProjectId,
          teachingUnitId: parsedTeachingUnitId,
          unregisteredUeName: parsedUnregisteredUeName,
          unregisteredUeContact: parsedUnregisteredUeContact,
          sorbonneEntity: resolvedSorbonneEntity,
          comments: comments || null,
          workspaceId: activeWorkspaceId,
          repairObject: cleanRepairObject,
          repairStatus: cleanRepairObject ? "PENDING" : null,
          workshopId: parsedWorkshopId,
        },
      });

      return { alreadyHere: false, attendedWorkshop };
    };

    const checkInOutcome =
      typeof prisma.$transaction === "function"
        ? await prisma.$transaction(runCheckIn)
        : await runCheckIn(prisma);

    if (!checkInOutcome.alreadyHere) {
      const { attendedWorkshop } = checkInOutcome;
      let msg = "Contributeur enregistré comme présent dans le lab !";
      // Automatically award workshop badge and machine habilitation to user
      if (parsedWorkshopId && attendedWorkshop) {
        try {
          const workshopService = require("../services/workshopService.js");
          await workshopService.awardWorkshopBadge(
            parsedUserId,
            parsedWorkshopId,
            req.session.username || "Atelier Fabtrack",
          );
          msg = `Contributeur enregistré à l'atelier "${attendedWorkshop.name}" ! Le badge a été automatiquement ajouté à son profil.`;
        } catch (err) {
          console.error("Error awarding workshop badge during check-in:", err);
          msg = "Contributeur enregistré dans le lab (erreur lors de l'attribution du badge).";
        }
      }
      return respondKioskMutation(req, res, {
        ok: true,
        type: "success",
        message: msg,
        redirectUrl: "/fabtrack",
        workspaceId: activeWorkspaceId,
        action: "checkin",
      });
    }
    return respondKioskMutation(req, res, {
      ok: false,
      type: "error",
      message: "Ce contributeur est déjà enregistré comme présent dans le lab !",
      redirectUrl: "/fabtrack",
      workspaceId: activeWorkspaceId,
      action: "checkin",
    });
  }),
);

// ******************************************************************************
// Route to close a history entry (departure)
// ******************************************************************************

router.post(
  "/exit/:id",
  validateParams(idParamSchema, { redirectUrl: "/fabtrack" }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const now = new Date();

    const updated = await prisma.history.update({
      where: {
        id: Number(id),
      },
      data: {
        departure: now,
      },
    });

    return respondKioskMutation(req, res, {
      ok: true,
      type: "success",
      message: "Sortie du contributeur enregistrée !",
      redirectUrl: "/fabtrack",
      workspaceId: (updated && updated.workspaceId) || (req.session.selectedWorkspace && req.session.selectedWorkspace.id) || null,
      action: "checkout",
    });
  }),
);

// ******************************************************************************
// Route to close a Repair Café history entry with outcome evaluation
// ******************************************************************************

router.post(
  "/exit-repair",
  validateBody(exitRepairSchema, { redirectUrl: "/fabtrack" }),
  asyncHandler(async (req, res) => {
    const { historyid, repairStatus, repairNotes } = req.body;
    const repairCafeService = require("../services/repairCafeService.js");

    try {
      await repairCafeService.recordRepairExit(historyid, { repairStatus, repairNotes });
      return respondKioskMutation(req, res, {
        ok: true,
        type: "success",
        message: "Bilan de réparation enregistré et sortie validée !",
        redirectUrl: "/fabtrack",
        workspaceId: (req.session.selectedWorkspace && req.session.selectedWorkspace.id) || null,
        action: "repair-checkout",
        entity: "repaircafe",
      });
    } catch (err) {
      console.error("Error recording repair exit:", err);
      return respondKioskMutation(req, res, {
        ok: false,
        type: "error",
        message: "Impossible d'enregistrer la sortie Repair Café.",
        redirectUrl: "/fabtrack",
      });
    }
  }),
);

// ******************************************************************************
// Route to delete a history entry
// ******************************************************************************

router.post(
  "/delete/:id",
  requireRoles("admin"),
  validateParams(idParamSchema, { redirectUrl: (req) => req.session.lastPage || "/admin/view-history" }),
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
  requireRoles("admin"),
  validateBody(updateHistorySchema, { redirectUrl: (req) => req.session.lastPage || "/admin/view-history" }),
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
  requireRoles("admin", "user"),
  validateBody(updateCommentSchema, { redirectUrl: (req) => req.session.lastPage || "/fabtrack" }),
  asyncHandler(async (req, res) => {
    const { historyid, comments } = req.body;

    if (!historyid) {
      return respondKioskMutation(req, res, {
        ok: false,
        type: "error",
        message: "Identifiant de session manquant.",
        redirectUrl: req.session.lastPage || "/fabtrack",
      });
    }

    try {
      const trimmedComments = comments && typeof comments === "string" ? comments.trim() : null;
      await prisma.history.update({
        where: { id: Number(historyid) },
        data: {
          comments: trimmedComments && trimmedComments.length > 0 ? trimmedComments : null,
        },
      });

      return respondKioskMutation(req, res, {
        ok: true,
        type: "success",
        message: "Commentaire mis à jour avec succès.",
        redirectUrl: req.session.lastPage || "/fabtrack",
        workspaceId: (req.session.selectedWorkspace && req.session.selectedWorkspace.id) || null,
        action: "comment",
      });
    } catch (error) {
      console.error("Error updating history comment:", error);
      return respondKioskMutation(req, res, {
        ok: false,
        type: "error",
        message: "Impossible de mettre à jour le commentaire.",
        redirectUrl: req.session.lastPage || "/fabtrack",
      });
    }
  }),
);


// ******************************************************************************
// Route to unarchive a project
// ******************************************************************************

router.post(
  "/project/unarchive/:id",
  requireRoles("admin", "user"),
  validateParams(idParamSchema, { redirectUrl: (req) => req.session.lastPage || "/fabtrack" }),
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

router.post(
  "/project/archive/:id",
  requireRoles("admin", "user"),
  validateParams(idParamSchema, { redirectUrl: (req) => req.session.lastPage || "/fabtrack" }),
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
  requireRoles("admin", "user"),
  validateBody(activitySchema, { redirectUrl: "/fabtrack" }),
  asyncHandler(async (req, res) => {
    const { activityhistoryid, activityuserid, machineId, equipmentId, consumable, quantity, borrowDurationDays } = req.body;

    const histId = activityhistoryid && activityhistoryid !== "null" ? Number(activityhistoryid) : null;
    const usrId = activityuserid && activityuserid !== "null" ? Number(activityuserid) : null;

    // Integrity guard: verify historyId belongs to usrId when both are provided
    if (histId && usrId) {
      const ownedHistory = await prisma.history.findFirst({
        where: { id: histId, userId: usrId },
        select: { id: true },
      });
      if (!ownedHistory) {
        req.session.notification = "Error: La visite sélectionnée ne correspond pas à ce contributeur.";
        return res.redirect(req.session.lastPage || "/fabtrack");
      }
    }

    let recordedCount = 0;
    let pendingLowStockAlert = null;

    // 1. Machine Usage
    if (machineId && machineId !== "" && machineId !== "null") {
      await prisma.activity.create({
        data: {
          historyId: histId,
          userId: usrId,
          resourceId: Number(machineId),
          resourceType: ResourceType.MACHINE,
          machineId: Number(machineId),
        },
      });
      recordedCount++;
    }

    // 2. Equipment Borrow (atomic transaction preventing double loans & unavailable tools)
    if (equipmentId && equipmentId !== "" && equipmentId !== "null") {
      const equipId = Number(equipmentId);
      const durationDays = Math.max(1, parseInt(borrowDurationDays, 10) || 7);
      const expectedReturnAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

      const runBorrow = async (tx) => {
        const eqItem = await tx.equipment.findUnique({ where: { id: equipId } });
        if (!eqItem) {
          return { ok: false, message: "Error: Équipement introuvable." };
        }
        if (eqItem.status !== "AVAILABLE") {
          return {
            ok: false,
            message: `Error: L'équipement "${eqItem.name}" n'est pas disponible au prêt (statut : ${eqItem.status}).`,
          };
        }
        const activeLoan = await tx.activity.findFirst({
          where: {
            resourceType: ResourceType.EQUIPMENT,
            resourceId: equipId,
            returnedAt: null,
          },
          select: { id: true },
        });
        if (activeLoan) {
          return {
            ok: false,
            message: `Error: L'équipement "${eqItem.name}" est déjà actuellement emprunté.`,
          };
        }

        await tx.activity.create({
          data: {
            historyId: histId,
            userId: usrId,
            resourceId: equipId,
            resourceType: ResourceType.EQUIPMENT,
            equipmentId: equipId,
            borrowDurationDays: durationDays,
            expectedReturnAt,
            returnedAt: null,
          },
        });
        return { ok: true, eqItem };
      };

      const borrowOutcome =
        typeof prisma.$transaction === "function"
          ? await prisma.$transaction(runBorrow)
          : await runBorrow(prisma);

      if (!borrowOutcome.ok) {
        if (isApiOrAjaxRequest(req)) {
          return res.status(409).json({ success: false, code: "EQUIPMENT_UNAVAILABLE", message: borrowOutcome.message });
        }
        req.session.notification = borrowOutcome.message;
        return res.redirect(req.session.lastPage || "/fabtrack");
      }

      recordedCount++;
      const eqName = borrowOutcome.eqItem ? borrowOutcome.eqItem.name : `#${equipId}`;
      logger.logThat(`Équipement "${eqName}" emprunté par contributeur #${usrId} pour ${durationDays} jour(s) (retour prévu: ${expectedReturnAt.toLocaleDateString("fr-FR")}).`);
    }

    // 3. Consumable Usage (atomic transaction: stock decrement + balance debit + activity with unitCost snapshot)
    if (consumable && consumable !== "" && consumable !== "null") {
      const qty = Math.max(1, parseInt(quantity, 10) || 1);

      const runConsume = async (tx) => {
        const consumedResult = await consumeItemTx(tx, consumable, qty);
        if (!consumedResult) return null;

        const { consumable: consumed, newStock, shouldAlertLowStock } = consumedResult;
        const unitCost = Number(Number(consumed.cost).toFixed(2));
        const totalPrice = Number((Number(consumed.cost) * qty).toFixed(2));

        let isCoveredByUe = false;
        let ueInfo = null;
        let isCoveredBySorbonne = false;
        let sorbonneEntityName = null;

        if (histId) {
          const histEntry = await tx.history.findUnique({
            where: { id: histId },
            include: {
              teachingUnit: true,
              userproject: {
                include: { project: true },
              },
            },
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

            if (histEntry.sorbonneEntity) {
              isCoveredBySorbonne = true;
              sorbonneEntityName = histEntry.sorbonneEntity;
            } else if (histEntry.userproject && histEntry.userproject.project && histEntry.userproject.project.sorbonneEntity) {
              isCoveredBySorbonne = true;
              sorbonneEntityName = histEntry.userproject.project.sorbonneEntity;
            }
          }
        }

        const isCovered = isCoveredByUe || isCoveredBySorbonne;

        if (usrId && !isCovered) {
          await tx.user.update({
            where: { id: usrId },
            data: { balance: { decrement: totalPrice } },
          });
        }

        await tx.activity.create({
          data: {
            historyId: histId,
            userId: usrId,
            resourceId: Number(consumable),
            resourceType: ResourceType.CONSUMABLE,
            consumableId: Number(consumable),
            quantity: qty,
            unitCost,
          },
        });

        return {
          consumed,
          newStock,
          shouldAlertLowStock,
          totalPrice,
          isCoveredByUe,
          ueInfo,
          isCoveredBySorbonne,
          sorbonneEntityName,
        };
      };

      const consumeOutcome =
        typeof prisma.$transaction === "function"
          ? await prisma.$transaction(runConsume)
          : await runConsume(prisma);

      if (consumeOutcome) {
        recordedCount++;
        if (consumeOutcome.shouldAlertLowStock) {
          pendingLowStockAlert = {
            consumable: consumeOutcome.consumed,
            newStock: consumeOutcome.newStock,
          };
        }

        if (consumeOutcome.isCoveredBySorbonne) {
          req.session.notification = `Success: Activité enregistrée. Prise en charge Projet Sorbonne (${consumeOutcome.sorbonneEntityName}) : solde contributeur non débité (${consumeOutcome.totalPrice.toFixed(2)} € facturables à l'entité).`;
        } else if (consumeOutcome.isCoveredByUe) {
          if (consumeOutcome.ueInfo && consumeOutcome.ueInfo.isUnregistered) {
            req.session.notification = `Success: Activité enregistrée. Prise en charge UE non-enregistrée (${consumeOutcome.ueInfo.code}) : solde étudiant non débité (${consumeOutcome.totalPrice.toFixed(2)} € en attente de régularisation).`;
          } else {
            req.session.notification = `Success: Activité enregistrée. Prise en charge UE (${consumeOutcome.ueInfo.code}) : solde étudiant non débité (${consumeOutcome.totalPrice.toFixed(2)} € imputés à l'UE).`;
          }
        }
      }
    }

    if (pendingLowStockAlert) {
      mailService
        .sendLowStockAlert(pendingLowStockAlert.consumable, pendingLowStockAlert.newStock)
        .catch((err) => {
          console.error("[consumeItem] Failed to send low stock alert email:", err);
        });
    }

    if (recordedCount > 0) {
      realtimeService.publish("kiosk", {
        workspaceId: (req.session.selectedWorkspace && req.session.selectedWorkspace.id) || null,
        action: "activity",
      });
      realtimeService.publish("admin", { entity: "activity", action: "activity" });
      if (!req.session.notification) {
        req.session.notification = "Success: Activité enregistrée avec succès !";
      }
      if (isApiOrAjaxRequest(req)) {
        const msg = req.session.notification;
        req.session.notification = "";
        return res.status(200).json({ ok: true, type: "success", message: msg });
      }
    } else {
      if (isApiOrAjaxRequest(req)) {
        return res.status(400).json({ ok: false, type: "warning", message: "Aucune ressource sélectionnée pour cette activité." });
      }
      req.session.notification = "Warning: Aucune ressource sélectionnée pour cette activité.";
    }

    res.redirect(req.session.lastPage || "/fabtrack");
  }),
);

// ******************************************************************************
// Route to clear a user's debt (strictly when balance < 0)
// ******************************************************************************

router.post(
  "/cleardebt/:id",
  requireRoles("admin", "user"),
  validateParams(idParamSchema, { redirectUrl: (req) => req.session.lastPage || "/fabtrack" }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await balanceService.clearUserDebt({
      userId: id,
      actorUsername: req.session.username,
    });

    if (isApiOrAjaxRequest(req)) {
      const status = result.success
        ? 200
        : result.code === "USER_NOT_FOUND"
          ? 404
          : result.code === "CONFLICT"
            ? 409
            : 400;
      return res.status(status).json(result);
    }

    if (!result.success) {
      const prefix = result.code === "POSITIVE_BALANCE" || result.code === "NO_DEBT" ? "Warning" : "Error";
      req.session.notification = `${prefix}: ${result.message}`;
      return res.redirect(req.session.lastPage || "/fabtrack");
    }

    req.session.notification = result.message;
    return res.redirect(req.session.lastPage || "/fabtrack");
  }),
);

// ******************************************************************************
// Route to credit a user's account (strictly positive amount > 0)
// ******************************************************************************

router.post(
  "/credit",
  requireRoles("admin", "user"),
  validateBody(creditSchema, { redirectUrl: (req) => req.session.lastPage || "/fabtrack" }),
  asyncHandler(async (req, res) => {
    const { userid, money } = req.validatedBody || req.body;
    const result = await balanceService.creditUserBalance({
      userId: userid,
      amount: money,
      actorUsername: req.session.username,
    });

    if (isApiOrAjaxRequest(req)) {
      const status = result.success ? 200 : result.code === "USER_NOT_FOUND" ? 404 : 400;
      return res.status(status).json(result);
    }

    req.session.notification = result.success ? result.message : `Error: ${result.message}`;
    return res.redirect(req.session.lastPage || "/fabtrack");
  }),
);

// ******************************************************************************
// Route to adjust (debit/credit) a user's account (Admin Only)
// ******************************************************************************

router.post(
  "/balance-adjust",
  requireRoles("admin"),
  validateBody(adjustBalanceSchema, { redirectUrl: (req) => req.session.lastPage || "/fabtrack" }),
  asyncHandler(async (req, res) => {
    const { userid, delta, reason } = req.validatedBody || req.body;
    const result = await balanceService.adjustUserBalance({
      userId: userid,
      delta,
      reason,
      actorUsername: req.session.username,
    });

    if (isApiOrAjaxRequest(req)) {
      const status = result.success ? 200 : result.code === "USER_NOT_FOUND" ? 404 : 400;
      return res.status(status).json(result);
    }

    req.session.notification = result.success ? result.message : `Error: ${result.message}`;
    return res.redirect(req.session.lastPage || "/fabtrack");
  }),
);

// ******************************************************************************
// Route to return / check-in borrowed equipment
// ******************************************************************************

router.post(
  "/equipment/return/:id",
  requireRoles("admin", "user"),
  validateParams(idParamSchema, {
    redirectUrl: (req) => require("../utilities/securityHelpers.js").getSafeRedirectPath(req, "/fabtrack"),
  }),
  validateBody(returnEquipmentSchema, { redirectUrl: (req) => require("../utilities/securityHelpers.js").getSafeRedirectPath(req, "/fabtrack") }),
  asyncHandler(async (req, res) => {
    const { getSafeRedirectPath } = require("../utilities/securityHelpers.js");
    const { id } = req.params;
    const { returnNotes } = req.body;

    const activity = await prisma.activity.findUnique({
      where: { id: Number(id) },
      include: { user: true },
    });

    if (!activity || activity.resourceType !== ResourceType.EQUIPMENT) {
      req.session.notification = "Error: Emprunt introuvable.";
      return res.redirect(getSafeRedirectPath(req, "/fabtrack"));
    }

    if (activity.returnedAt) {
      req.session.notification = "Warning: Cet équipement a déjà été marqué comme restitué.";
      return res.redirect(getSafeRedirectPath(req, req.session.lastPage || "/admin/equipment/manage"));
    }

    const returnResult = await equipmentLoanService.returnEquipmentLoan({
      prisma,
      activityId: Number(id),
      returnNotes,
      staffUsername: req.session.username,
    });

    if (!returnResult.returned) {
      req.session.notification = "Warning: Cet équipement a déjà été marqué comme restitué.";
      return res.redirect(getSafeRedirectPath(req, req.session.lastPage || "/admin/equipment/manage"));
    }

    const eqItem = await prisma.equipment.findUnique({ where: { id: activity.resourceId } });
    const eqName = eqItem ? eqItem.name : `#${activity.resourceId}`;
    const borrowerName = activity.user ? `${activity.user.name} ${activity.user.surname}` : `contributeur #${activity.userId}`;

    logger.logThat(`Équipement "${eqName}" restitué par ${borrowerName} (enregistré par ${req.session.username}).`);
    realtimeService.publish("kiosk", { action: "equipment-return" });
    realtimeService.publish("admin", { entity: "equipment", action: "equipment-return" });
    req.session.notification = `Success: L'équipement "${eqName}" a été marqué comme restitué.`;

    const redirectUrl = getSafeRedirectPath(req, req.session.lastPage || "/admin/equipment/manage");
    return res.redirect(redirectUrl);
  }),
);

module.exports = router;
