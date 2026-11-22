const { prisma: defaultPrisma } = require("../utilities/db.js");
const { maskRfidUid } = require("../utilities/structuredLogger.js");

const ANONYMIZED_EMAIL_DOMAIN = "anonymized.local";
const DEFAULT_RETENTION_MONTHS = 36;

/**
 * Exports all personal data held for a contributor (GDPR Articles 15 & 20).
 * Excludes internal authentication/charter tokens and masks RFID badge UIDs by default unless requested.
 *
 * @param {number|string} userId
 * @param {Object} [options]
 * @param {Object} [options.prisma]
 */
async function exportUserData(userId, { prisma = defaultPrisma } = {}) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      usertype: true,
      projects: {
        include: {
          project: {
            include: {
              projecttype: true,
              teachingUnit: true,
            },
          },
        },
      },
      history: {
        orderBy: { arrival: "desc" },
        include: {
          workspace: true,
          teachingUnit: true,
          workshop: true,
        },
      },
      activities: {
        orderBy: { createdAt: "desc" },
      },
      warnings: {
        orderBy: { createdAt: "desc" },
        include: { warningtype: true },
      },
      workshopInterests: {
        include: { workshop: true },
      },
      workshopCompletions: {
        include: { workshop: true },
      },
      Log: {
        orderBy: { timestamp: "desc" },
      },
    },
  });

  if (!user) {
    return null;
  }

  return {
    schemaVersion: "1.0",
    exportedAt: new Date().toISOString(),
    subject: {
      id: user.id,
      name: user.name,
      surname: user.surname,
      email: user.email,
      usertype: user.usertype ? user.usertype.name : null,
      birthYear: user.birthYear,
      comment: user.comment,
      balance: user.balance !== null && user.balance !== undefined ? Number(user.balance) : 0,
      termsAccepted: Boolean(user.termsAccepted),
      newsletter: Boolean(user.newsletter),
      isExpert: Boolean(user.isExpert),
      rfidMasked: user.rfid ? maskRfidUid(user.rfid) : null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      deletedAt: user.deletedAt,
    },
    projects: (user.projects || []).map((up) => ({
      userProjectId: up.id,
      projectId: up.projectId,
      url: up.project ? up.project.url : null,
      projecttype: up.project && up.project.projecttype ? up.project.projecttype.name : null,
      teachingUnit: up.project && up.project.teachingUnit ? up.project.teachingUnit.code : null,
      sorbonneEntity: up.project ? up.project.sorbonneEntity : null,
      active: up.project ? up.project.active : null,
    })),
    visits: (user.history || []).map((h) => ({
      id: h.id,
      arrival: h.arrival,
      departure: h.departure,
      workspace: h.workspace ? h.workspace.name : null,
      comments: h.comments,
      teachingUnit: h.teachingUnit ? h.teachingUnit.code : null,
      sorbonneEntity: h.sorbonneEntity,
      repairObject: h.repairObject,
      repairStatus: h.repairStatus,
      workshop: h.workshop ? h.workshop.name : null,
    })),
    activities: (user.activities || []).map((a) => ({
      id: a.id,
      createdAt: a.createdAt,
      resourceType: a.resourceType,
      resourceId: a.resourceId,
      quantity: a.quantity,
      unitCost: a.unitCost !== null && a.unitCost !== undefined ? Number(a.unitCost) : null,
      startedAt: a.startedAt,
      endedAt: a.endedAt,
      expectedReturnAt: a.expectedReturnAt,
      returnedAt: a.returnedAt,
      returnNotes: a.returnNotes,
      comments: a.comments,
      settled: a.settled,
    })),
    warnings: (user.warnings || []).map((w) => ({
      id: w.id,
      createdAt: w.createdAt,
      active: w.active,
      type: w.warningtype ? w.warningtype.name : null,
      comments: w.comments,
    })),
    workshopInterests: (user.workshopInterests || []).map((wi) => ({
      workshop: wi.workshop ? wi.workshop.name : null,
      createdAt: wi.createdAt,
    })),
    workshopCompletions: (user.workshopCompletions || []).map((wc) => ({
      workshop: wc.workshop ? wc.workshop.name : null,
      awardedAt: wc.awardedAt,
      awardedBy: wc.awardedBy,
    })),
    auditLogs: (user.Log || []).map((l) => ({
      id: l.id,
      timestamp: l.timestamp,
      description: l.description,
    })),
  };
}

/**
 * Computes the retention cutoff date (`now` minus `retentionMonths`).
 */
function computeRetentionCutoff(retentionMonths = DEFAULT_RETENTION_MONTHS, now = new Date()) {
  const months = Number(retentionMonths);
  if (!Number.isInteger(months) || months < 1 || months > 600) {
    throw new Error("La durée de rétention doit être un entier compris entre 1 et 600 mois.");
  }
  const cutoff = new Date(now.getTime());
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return cutoff;
}

/**
 * Anonymizes inactive contributors whose last visit/activity (or account creation date)
 * predates `retentionMonths` while preserving anonymous historical aggregates.
 *
 * @param {Object} [options]
 * @param {number} [options.retentionMonths=36]
 * @param {boolean} [options.dryRun=false]
 * @param {Date} [options.now=new Date()]
 * @param {Object} [options.prisma]
 */
async function anonymizeInactiveUsers({
  retentionMonths = DEFAULT_RETENTION_MONTHS,
  dryRun = false,
  now = new Date(),
  prisma = defaultPrisma,
} = {}) {
  const cutoffDate = computeRetentionCutoff(retentionMonths, now);

  const candidates = await prisma.user.findMany({
    where: {
      NOT: {
        email: { endsWith: `@${ANONYMIZED_EMAIL_DOMAIN}` },
      },
      createdAt: { lt: cutoffDate },
    },
    select: {
      id: true,
      email: true,
      createdAt: true,
      deletedAt: true,
      history: {
        select: { arrival: true },
        orderBy: { arrival: "desc" },
        take: 1,
      },
      activities: {
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const eligible = candidates.filter((u) => {
    const lastVisit = u.history && u.history[0] ? new Date(u.history[0].arrival) : null;
    const lastActivity = u.activities && u.activities[0] ? new Date(u.activities[0].createdAt) : null;
    const lastSeen = [new Date(u.createdAt), lastVisit, lastActivity]
      .filter((d) => d && !Number.isNaN(d.getTime()))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return lastSeen && lastSeen.getTime() < cutoffDate.getTime();
  });

  if (dryRun || eligible.length === 0) {
    return {
      cutoffDate: cutoffDate.toISOString(),
      dryRun: Boolean(dryRun),
      eligibleCount: eligible.length,
      anonymizedCount: 0,
      eligibleUserIds: eligible.map((u) => u.id),
    };
  }

  let anonymizedCount = 0;
  for (const user of eligible) {
    const anonymizedEmail = `anonyme-${user.id}@${ANONYMIZED_EMAIL_DOMAIN}`;
    const executeAnonymization = async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          name: "Anonyme",
          surname: `#${user.id}`,
          email: anonymizedEmail,
          birthYear: null,
          comment: null,
          rfid: null,
          newsletter: false,
          deletedAt: user.deletedAt || now,
          updatedAt: now,
        },
      });
      await tx.userWorkshopInterest.deleteMany({ where: { userId: user.id } });
    };

    if (typeof prisma.$transaction === "function") {
      await prisma.$transaction(executeAnonymization);
    } else {
      await executeAnonymization(prisma);
    }
    anonymizedCount++;
  }

  return {
    cutoffDate: cutoffDate.toISOString(),
    dryRun: false,
    eligibleCount: eligible.length,
    anonymizedCount,
    eligibleUserIds: eligible.map((u) => u.id),
  };
}

module.exports = {
  ANONYMIZED_EMAIL_DOMAIN,
  DEFAULT_RETENTION_MONTHS,
  computeRetentionCutoff,
  exportUserData,
  anonymizeInactiveUsers,
};
