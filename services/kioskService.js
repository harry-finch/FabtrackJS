/**
 * Kiosk Present-Users Service (R-032)
 * Shared read-only query builder used by both GET /fabtrack and GET /fabtrack/present-table
 * so full renders and partial AJAX/SSE refreshes always stay 100% consistent.
 */

const moment = require("moment");
const { prisma } = require("../utilities/db.js");
const { getStartOfDay } = require("./visitAutoCloseService.js");

async function getPresentHistory(workspaceId = null) {
  const startOfToday = getStartOfDay(new Date());
  const history = await prisma.history.findMany({
    where: {
      departure: null,
      arrival: { gte: startOfToday },
      workspaceId: workspaceId || null,
    },
    relationLoadStrategy: "join",
    include: {
      user: true,
      workshop: true,
    },
  });

  const userIdsInLab = history.map((entry) => entry.userId);
  if (userIdsInLab.length === 0) {
    return [];
  }

  const [warnings, activeEquipmentActivities] = await Promise.all([
    prisma.warning.findMany({
      where: {
        userId: { in: userIdsInLab },
        active: true,
      },
      include: { warningtype: true },
    }),
    prisma.activity.findMany({
      where: {
        userId: { in: userIdsInLab },
        resourceType: "EQUIPMENT",
        returnedAt: null,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const warningsByUser = new Map();
  warnings.forEach((warning) => {
    if (!warningsByUser.has(warning.userId)) {
      warningsByUser.set(warning.userId, []);
    }
    warningsByUser.get(warning.userId).push(warning);
  });

  const equipmentIds = [...new Set(activeEquipmentActivities.map((a) => a.resourceId))];
  const equipmentItems =
    equipmentIds.length > 0
      ? await prisma.equipment.findMany({ where: { id: { in: equipmentIds } }, include: { workspace: true } })
      : [];
  const equipmentMap = new Map(equipmentItems.map((eq) => [eq.id, eq]));

  const now = new Date();
  const activeLoansByUser = new Map();
  activeEquipmentActivities.forEach((act) => {
    if (!activeLoansByUser.has(act.userId)) {
      activeLoansByUser.set(act.userId, []);
    }
    const eq = equipmentMap.get(act.resourceId);
    const isOverdue = act.expectedReturnAt ? new Date(act.expectedReturnAt) < now : false;
    activeLoansByUser.get(act.userId).push({
      id: act.id,
      equipmentId: act.resourceId,
      equipmentName: eq ? eq.name : `#${act.resourceId}`,
      workspaceName: eq && eq.workspace ? eq.workspace.name : null,
      borrowedAt: act.createdAt,
      expectedReturnAt: act.expectedReturnAt,
      borrowDurationDays: act.borrowDurationDays,
      isOverdue,
    });
  });

  for (const entry of history) {
    entry.arrival = moment(entry.arrival).format("HH:mm");
    entry.warnings = warningsByUser.get(entry.userId) || [];
    entry.activeLoans = activeLoansByUser.get(entry.userId) || [];
    entry.hasOverdueLoans = entry.activeLoans.some((l) => l.isOverdue);
  }

  return history;
}

module.exports = {
  getPresentHistory,
};
