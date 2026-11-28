const { prisma } = require("../utilities/db.js");
const logger = require("../utilities/simpleLogger.js");
const { maskRfidUid } = require("../utilities/structuredLogger.js");
const realtimeService = require("./realtimeService.js");
const projectTitleService = require("./projectTitleService.js");
const { getStartOfDay } = require("./visitAutoCloseService.js");

/**
 * Fetches only the given contributor's own active projects, formatted with R-038 display titles.
 *
 * @param {number} userId
 * @returns {Promise<Array<{ id: number, userprojectId: number, url: string, displayTitle: string, projecttypeId: number|null, teachingUnitId: number|null, unregisteredUeName: string|null, unregisteredUeContact: string|null, sorbonneEntity: string|null }>>}
 */
async function getContributorProjectsForBorne(userId) {
  const ups = await prisma.userProject.findMany({
    where: {
      userId: Number(userId),
      project: { active: true },
    },
    include: {
      project: true,
    },
    orderBy: { id: "desc" },
  });

  return (ups || [])
    .filter((up) => up && up.project)
    .map((up) => ({
      id: up.project.id,
      userprojectId: up.id,
      url: up.project.url,
      displayTitle: projectTitleService.resolveProjectDisplayTitle(up.project),
      projecttypeId: up.project.projecttypeId || null,
      teachingUnitId: up.project.teachingUnitId || null,
      unregisteredUeName: up.project.unregisteredUeName || null,
      unregisteredUeContact: up.project.unregisteredUeContact || null,
      sorbonneEntity: up.project.sorbonneEntity || null,
    }));
}

/**
 * Confirms an individual badge check-in from the self-service borne (R-036).
 * Strictly authenticates the contributor from the scanned RFID UID (never trusts an arbitrary userId).
 * Idempotent under double-confirmation via an open-visit check inside prisma.$transaction.
 *
 * @param {Object} params
 */
async function confirmBadgeCheckIn({
  rfid,
  workspaceId = null,
  projecttype = null,
  projectid = null,
  documentation = null,
  comments = null,
  teachingUnitId = null,
  unregisteredUeName = null,
  unregisteredUeContact = null,
  repairObject = null,
  workshopId = null,
  sorbonneEntity = null,
  staffUsername = null,
  onConfirmedRfid = null,
} = {}) {
  const cleanRfid = typeof rfid === "string" ? rfid.trim() : "";
  if (!cleanRfid) {
    return {
      success: false,
      code: "INVALID_RFID",
      message: "Badge invalide ou manquant.",
    };
  }

  const user = await prisma.user.findFirst({
    where: {
      rfid: cleanRfid,
      deletedAt: null,
    },
    include: {
      usertype: true,
    },
  });

  if (!user) {
    return {
      success: false,
      code: "USER_NOT_FOUND",
      message: "Badge non reconnu. Veuillez vous présenter à l'accueil auprès d'un membre de l'équipe.",
    };
  }

  if (!user.termsAccepted) {
    logger.logThat(
      `Borne Check-in refused: ${user.name} ${user.surname} (RFID: ${maskRfidUid(cleanRfid)}) - terms not accepted`,
    );
    return {
      success: false,
      code: "TERMS_NOT_ACCEPTED",
      message:
        "Votre charte d'utilisation n'est pas encore validée. Veuillez vous présenter à l'accueil auprès d'un membre de l'équipe.",
    };
  }

  const cleanComments = typeof comments === "string" && comments.trim() ? comments.trim() : null;
  const cleanRepairObject = typeof repairObject === "string" && repairObject.trim() ? repairObject.trim() : null;
  const cleanSorbonneEntity = typeof sorbonneEntity === "string" && sorbonneEntity.trim() ? sorbonneEntity.trim() : null;
  const cleanDoc = typeof documentation === "string" && documentation.trim() ? documentation.trim() : null;

  let parsedWorkshopId = null;
  if (workshopId && workshopId !== "null" && workshopId !== "") {
    const num = Number(workshopId);
    if (Number.isInteger(num) && num > 0) parsedWorkshopId = num;
  }

  let parsedTeachingUnitId = null;
  let parsedUnregisteredUeName = null;
  let parsedUnregisteredUeContact = null;
  if (teachingUnitId === "unregistered") {
    parsedUnregisteredUeName =
      typeof unregisteredUeName === "string" && unregisteredUeName.trim()
        ? unregisteredUeName.trim()
        : "UE non-enregistrée";
    parsedUnregisteredUeContact =
      typeof unregisteredUeContact === "string" && unregisteredUeContact.trim()
        ? unregisteredUeContact.trim()
        : null;
  } else if (teachingUnitId && teachingUnitId !== "null" && teachingUnitId !== "") {
    const num = Number(teachingUnitId);
    if (Number.isInteger(num) && num > 0) parsedTeachingUnitId = num;
  }

  const parsedWorkspaceId =
    workspaceId && Number.isInteger(Number(workspaceId)) && Number(workspaceId) > 0
      ? Number(workspaceId)
      : null;
  const parsedProjectTypeId =
    projecttype && Number.isInteger(Number(projecttype)) && Number(projecttype) > 0
      ? Number(projecttype)
      : 1;

  const startOfToday = getStartOfDay(new Date());

  const runTx = async (tx) => {
    const existingOpenVisit = await tx.history.findFirst({
      where: {
        userId: user.id,
        departure: null,
        arrival: { gte: startOfToday },
      },
      select: { id: true },
    });

    if (existingOpenVisit) {
      return { alreadyHere: true, visitId: existingOpenVisit.id };
    }

    let attendedWorkshop = null;
    if (parsedWorkshopId) {
      attendedWorkshop = await tx.workshop.findUnique({
        where: { id: parsedWorkshopId },
        include: { access: true },
      });
    }

    let resolvedProjectId = null;
    let resolvedUserProjectId = null;
    let projectToSyncTitle = null;

    // Borne users may only reuse their OWN existing projects (ownership strictly verified)
    if (projectid && projectid !== "null" && projectid !== "" && projectid !== "new") {
      const candidateProjectId = Number(projectid);
      if (Number.isInteger(candidateProjectId) && candidateProjectId > 0) {
        const ownedUP = await tx.userProject.findFirst({
          where: { userId: user.id, projectId: candidateProjectId },
          select: { id: true, projectId: true },
        });
        if (!ownedUP) {
          return { invalidProjectOwnership: true };
        }
        resolvedProjectId = ownedUP.projectId;
        resolvedUserProjectId = ownedUP.id;
      }
    }

    if (!resolvedProjectId) {
      if (attendedWorkshop) {
        const uniqueSlug = `workshop://${encodeURIComponent(
          attendedWorkshop.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .slice(0, 50),
        )}-${attendedWorkshop.id}`;
        let project = await tx.project.findUnique({ where: { url: uniqueSlug } });
        if (!project) {
          project = await tx.project.create({
            data: {
              url: uniqueSlug,
              projecttypeId: parsedProjectTypeId,
            },
          });
        }
        resolvedProjectId = project.id;
      } else if (cleanRepairObject) {
        const uniqueSlug = `repair-cafe://${encodeURIComponent(
          cleanRepairObject
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .slice(0, 50),
        )}-${Date.now()}`;
        const project = await tx.project.create({
          data: {
            url: uniqueSlug,
            projecttypeId: parsedProjectTypeId,
          },
        });
        resolvedProjectId = project.id;
      } else if (cleanDoc) {
        let project = await tx.project.findUnique({ where: { url: cleanDoc } });
        if (!project) {
          project = await tx.project.create({
            data: {
              url: cleanDoc,
              projecttypeId: parsedProjectTypeId,
              teachingUnitId: parsedTeachingUnitId,
              unregisteredUeName: parsedUnregisteredUeName,
              unregisteredUeContact: parsedUnregisteredUeContact,
              sorbonneEntity: cleanSorbonneEntity,
            },
          });
        }
        resolvedProjectId = project.id;
        if (!project.wikiTitle && /^https?:\/\//i.test(project.url || "")) {
          projectToSyncTitle = project;
        }
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
        data: { sorbonneEntity: cleanSorbonneEntity },
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
        where: { userId: user.id, projectId: resolvedProjectId },
      });
      if (existingUP) {
        resolvedUserProjectId = existingUP.id;
      } else {
        const createdUP = await tx.userProject.create({
          data: { userId: user.id, projectId: resolvedProjectId },
        });
        resolvedUserProjectId = createdUP.id;
      }
    }

    const visit = await tx.history.create({
      data: {
        userId: user.id,
        userprojectId: resolvedUserProjectId,
        teachingUnitId: parsedTeachingUnitId,
        unregisteredUeName: parsedUnregisteredUeName,
        unregisteredUeContact: parsedUnregisteredUeContact,
        sorbonneEntity: resolvedSorbonneEntity,
        comments: cleanComments,
        workspaceId: parsedWorkspaceId,
        repairObject: cleanRepairObject,
        repairStatus: cleanRepairObject ? "PENDING" : null,
        workshopId: parsedWorkshopId,
      },
    });

    return { alreadyHere: false, visitId: visit.id, attendedWorkshop, projectToSyncTitle };
  };

  const outcome =
    typeof prisma.$transaction === "function" ? await prisma.$transaction(runTx) : await runTx(prisma);

  if (outcome.invalidProjectOwnership) {
    return {
      success: false,
      code: "INVALID_PROJECT",
      message: "Le projet sélectionné ne vous appartient pas.",
    };
  }

  if (outcome.alreadyHere) {
    return {
      success: false,
      code: "ALREADY_CHECKED_IN",
      message: "Votre entrée est déjà enregistrée dans le lab.",
    };
  }

  if (typeof onConfirmedRfid === "function") {
    onConfirmedRfid(cleanRfid);
  }

  if (outcome.projectToSyncTitle && typeof projectTitleService.syncProjectWikiTitle === "function") {
    projectTitleService.syncProjectWikiTitle(outcome.projectToSyncTitle).catch(() => {});
  }

  if (parsedWorkshopId && outcome.attendedWorkshop) {
    try {
      const workshopService = require("./workshopService.js");
      await workshopService.awardWorkshopBadge(user.id, parsedWorkshopId, staffUsername || "Borne Fabtrack");
    } catch (err) {
      console.error("[BorneCheckinService] Failed to award workshop badge:", err);
    }
  }

  logger.logThat(
    `Borne RFID Check-in: ${user.name} ${user.surname} (RFID: ${maskRfidUid(cleanRfid)}) checked in via ${staffUsername || "borne"}`,
  );

  realtimeService.publish("kiosk", { workspaceId: parsedWorkspaceId, action: "rfid-checkin" });
  realtimeService.publish("admin", { entity: "history", action: "rfid-checkin" });

  return {
    success: true,
    action: "checkin",
    visitId: outcome.visitId,
    user: {
      name: user.name,
      surname: user.surname,
      type: user.usertype ? user.usertype.name : "",
    },
    message: `Bienvenue ${user.name} ! Votre entrée a bien été enregistrée.`,
  };
}

module.exports = {
  getContributorProjectsForBorne,
  confirmBadgeCheckIn,
};
