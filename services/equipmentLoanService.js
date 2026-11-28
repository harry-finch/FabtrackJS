const { prisma: defaultPrisma, ResourceType } = require("../utilities/db.js");
const defaultLogger = require("../utilities/simpleLogger.js");
const defaultRealtimeService = require("./realtimeService.js");

const RESOURCE_EQUIPMENT = (ResourceType && ResourceType.EQUIPMENT) || "EQUIPMENT";

/**
 * Atomically marks an active equipment loan as returned.
 * Uses updateMany with `returnedAt: null` guard to prevent double returns under concurrency.
 *
 * @param {Object} params
 * @param {Object} [params.prisma] - Prisma client or transaction client
 * @param {number|string} params.activityId - Equipment loan activity ID
 * @param {string|null} [params.returnNotes] - Optional notes recorded on return
 * @param {string|null} [params.staffUsername] - Staff member recording the return
 * @returns {Promise<{ returned: boolean, activityId: number }>}
 */
async function returnEquipmentLoan({
  prisma = defaultPrisma,
  activityId,
  returnNotes = null,
  staffUsername = null,
} = {}) {
  const id = Number(activityId);
  if (!Number.isInteger(id) || id <= 0) {
    return { returned: false, activityId: id };
  }

  const cleanNotes = typeof returnNotes === "string" && returnNotes.trim() ? returnNotes.trim() : null;

  const updated = await prisma.activity.updateMany({
    where: {
      id,
      resourceType: RESOURCE_EQUIPMENT,
      returnedAt: null,
    },
    data: {
      returnedAt: new Date(),
      returnNotes: cleanNotes,
    },
  });

  return {
    returned: updated.count > 0,
    activityId: id,
    staffUsername: staffUsername || null,
  };
}

/**
 * Fetches active (unreturned) equipment loans, optionally filtered by userId.
 *
 * @param {Object} [params]
 * @param {Object} [params.prisma] - Prisma client
 * @param {number|string|null} [params.userId=null] - Optional borrower user ID filter
 * @param {Object} [params.include] - Optional Prisma include projection
 * @returns {Promise<Array>}
 */
async function getActiveEquipmentLoans({ prisma = defaultPrisma, userId = null, include } = {}) {
  const where = {
    resourceType: RESOURCE_EQUIPMENT,
    returnedAt: null,
  };

  if (userId !== null && userId !== undefined) {
    where.userId = Number(userId);
  }

  const query = {
    where,
    orderBy: { createdAt: "desc" },
  };

  if (include) {
    query.include = include;
  }

  return prisma.activity.findMany(query);
}

/**
 * Shared business workflow for returning a borrowed equipment loan (R-040).
 * Used identically by POST /history/equipment/return/:id and POST /admin/equipment/return/:id.
 *
 * Guarantees:
 * - Missing or non-EQUIPMENT activity -> status "not_found" (no write, no log, no SSE).
 * - Already returned or lost atomic race -> status "already_returned" (first date/notes kept, no duplicate log/SSE).
 * - Legacy loans identified only by resourceId (equipmentId null) are supported transparently.
 * - On atomic success -> 1 audit log + 1 SSE invalidation on "kiosk" AND 1 on "admin".
 *
 * @param {Object} params
 * @param {Object} [params.prisma]
 * @param {number|string} params.activityId
 * @param {string|null} [params.returnNotes]
 * @param {string|null} [params.staffUsername]
 * @param {string|null} [params.actorLabel]
 * @param {Object} [params.logger]
 * @param {Object} [params.realtimeService]
 */
async function processEquipmentReturn({
  prisma = defaultPrisma,
  activityId,
  returnNotes = null,
  staffUsername = null,
  actorLabel = null,
  logger = defaultLogger,
  realtimeService = defaultRealtimeService,
} = {}) {
  const id = Number(activityId);
  if (!Number.isInteger(id) || id <= 0) {
    return {
      status: "not_found",
      returned: false,
      activityId: id,
      message: "Emprunt introuvable.",
    };
  }

  const activity = await prisma.activity.findUnique({
    where: { id },
    include: { user: true },
  });

  if (!activity || activity.resourceType !== RESOURCE_EQUIPMENT) {
    return {
      status: "not_found",
      returned: false,
      activityId: id,
      message: "Emprunt introuvable.",
    };
  }

  if (activity.returnedAt) {
    return {
      status: "already_returned",
      returned: false,
      activityId: id,
      message: "Cet équipement a déjà été marqué comme restitué.",
    };
  }

  const returnResult = await returnEquipmentLoan({
    prisma,
    activityId: id,
    returnNotes,
    staffUsername,
  });

  if (!returnResult.returned) {
    return {
      status: "already_returned",
      returned: false,
      activityId: id,
      message: "Cet équipement a déjà été marqué comme restitué.",
    };
  }

  const targetEquipId = activity.equipmentId || activity.resourceId;
  const eqItem = targetEquipId
    ? await prisma.equipment.findUnique({ where: { id: targetEquipId } })
    : null;
  const eqName = eqItem ? eqItem.name : `#${targetEquipId || id}`;
  const borrowerName = activity.user
    ? `${activity.user.name} ${activity.user.surname}`
    : `contributeur #${activity.userId}`;
  const actorText = actorLabel || staffUsername || "staff";

  if (logger && typeof logger.logThat === "function") {
    logger.logThat(`Équipement "${eqName}" restitué par ${borrowerName} (enregistré par ${actorText}).`);
  }

  if (realtimeService && typeof realtimeService.publish === "function") {
    realtimeService.publish("kiosk", { action: "equipment-return", activityId: id });
    realtimeService.publish("admin", { entity: "equipment", action: "equipment-return", activityId: id });
  }

  return {
    status: "returned",
    returned: true,
    activityId: id,
    equipmentId: targetEquipId || null,
    equipmentName: eqName,
    borrowerName,
    message: `L'équipement "${eqName}" a été marqué comme restitué.`,
  };
}

module.exports = {
  returnEquipmentLoan,
  getActiveEquipmentLoans,
  processEquipmentReturn,
};
