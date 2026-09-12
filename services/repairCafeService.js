const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const settingsService = require("./settingsService.js");
const logger = require("../utilities/simpleLogger.js");

const VALID_STATUSES = {
  REPAIRED: { label: "Réparé", color: "success", icon: "fa-circle-check" },
  PARTIALLY_REPAIRED: { label: "Partiellement réparé", color: "warning", icon: "fa-triangle-exclamation" },
  NOT_REPAIRED: { label: "Non réparé", color: "danger", icon: "fa-circle-xmark" },
  NEEDS_RETURN: { label: "Doit revenir pour finir", color: "info", icon: "fa-rotate-right" },
  PENDING: { label: "En cours de réparation", color: "secondary", icon: "fa-clock" },
};

class RepairCafeService {
  /**
   * Returns valid repair statuses and labels.
   */
  getStatuses() {
    return { ...VALID_STATUSES };
  }

  /**
   * Ensures that the 'Repair Café' project type exists in the database.
   */
  async ensureProjectType() {
    try {
      const typeName = (await settingsService.getSetting("repaircafe_projecttype_name")) || "Repair Café";
      let projectType = await prisma.projecttype.findFirst({
        where: {
          name: {
            equals: typeName,
          },
        },
      });

      if (!projectType) {
        projectType = await prisma.projecttype.create({
          data: { name: typeName },
        });
        logger.logThat(`Created default project type '${typeName}' for Repair Café plugin`);
      }

      return projectType;
    } catch (err) {
      console.error("[RepairCafeService] Error ensuring project type:", err);
      return null;
    }
  }

  /**
   * Records a Repair Café departure with outcome evaluation.
   */
  async recordRepairExit(historyId, { repairStatus, repairNotes }) {
    const id = Number(historyId);
    if (!id || isNaN(id)) {
      throw new Error("ID de session invalide");
    }

    const now = new Date();
    const status = VALID_STATUSES[repairStatus] ? repairStatus : "PENDING";

    const updated = await prisma.history.update({
      where: { id },
      data: {
        departure: now,
        repairStatus: status,
        repairNotes: repairNotes && repairNotes.trim() ? repairNotes.trim() : null,
      },
      include: {
        user: true,
      },
    });

    const statusLabel = VALID_STATUSES[status].label;
    const userFullName = updated.user ? `${updated.user.name} ${updated.user.surname}` : `Usager #${updated.userId}`;
    logger.logThat(`Sortie Repair Café enregistrée pour ${userFullName} (Objet: "${updated.repairObject || 'Non précisé'}") - Statut: ${statusLabel}`);

    return updated;
  }

  /**
   * Computes key metrics and chronological history for Repair Café sessions.
   */
  async getRepairStats() {
    const records = await prisma.history.findMany({
      where: {
        OR: [
          { repairObject: { not: null } },
          { repairStatus: { not: null } },
        ],
      },
      include: {
        user: true,
        workspace: true,
        userproject: {
          include: {
            project: {
              include: { projecttype: true },
            },
          },
        },
      },
      orderBy: { arrival: "desc" },
    });

    let repairedCount = 0;
    let partiallyRepairedCount = 0;
    let notRepairedCount = 0;
    let needsReturnCount = 0;
    let pendingCount = 0;

    const userIds = new Set();

    records.forEach((r) => {
      if (r.userId) userIds.add(r.userId);

      const st = r.repairStatus || "PENDING";
      if (st === "REPAIRED") repairedCount++;
      else if (st === "PARTIALLY_REPAIRED") partiallyRepairedCount++;
      else if (st === "NOT_REPAIRED") notRepairedCount++;
      else if (st === "NEEDS_RETURN") needsReturnCount++;
      else pendingCount++;
    });

    const totalVisits = records.length;
    const uniqueVisitors = userIds.size;
    const decidedTotal = repairedCount + partiallyRepairedCount + notRepairedCount + needsReturnCount;

    // Rate: Full repairs (100%) + partial repairs (50%)
    const globalSuccessRate = decidedTotal > 0
      ? Math.round(((repairedCount + partiallyRepairedCount * 0.5) / decidedTotal) * 100)
      : 0;

    // Strict full repair rate
    const strictSuccessRate = decidedTotal > 0
      ? Math.round((repairedCount / decidedTotal) * 100)
      : 0;

    return {
      totalVisits,
      uniqueVisitors,
      repairedCount,
      partiallyRepairedCount,
      notRepairedCount,
      needsReturnCount,
      pendingCount,
      decidedTotal,
      globalSuccessRate,
      strictSuccessRate,
      records: records.map((r) => ({
        id: r.id,
        arrival: r.arrival,
        departure: r.departure,
        repairObject: r.repairObject || "Objet non spécifié",
        repairStatus: r.repairStatus || "PENDING",
        repairNotes: r.repairNotes || "",
        userFullName: r.user ? `${r.user.name} ${r.user.surname}` : "Usager inconnu",
        userEmail: r.user ? r.user.email : "",
        workspaceName: r.workspace ? r.workspace.name : "Fablab",
        statusInfo: VALID_STATUSES[r.repairStatus] || VALID_STATUSES.PENDING,
      })),
    };
  }

  /**
   * Updates an existing repair entry (used by administrators).
   */
  async updateRepairEntry(historyId, { repairObject, repairStatus, repairNotes }) {
    const id = Number(historyId);
    if (!id || isNaN(id)) throw new Error("ID invalide");

    const status = VALID_STATUSES[repairStatus] ? repairStatus : undefined;

    return await prisma.history.update({
      where: { id },
      data: {
        repairObject: repairObject !== undefined ? repairObject.trim() : undefined,
        repairStatus: status,
        repairNotes: repairNotes !== undefined ? repairNotes.trim() || null : undefined,
      },
    });
  }
}

module.exports = new RepairCafeService();
