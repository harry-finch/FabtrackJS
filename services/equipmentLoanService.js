const { prisma: defaultPrisma, ResourceType } = require("../utilities/db.js");

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

module.exports = {
  returnEquipmentLoan,
  getActiveEquipmentLoans,
};
