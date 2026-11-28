const { prisma } = require("../utilities/db.js");
const settingsService = require("./settingsService.js");
const referenceCacheService = require("./referenceCacheService.js");
const logger = require("../utilities/simpleLogger.js");
const { getAppTimezone, getZonedYearBounds } = require("../utilities/timezoneHelper.js");

const PAGE_SIZE = 25;

const VALID_STATUSES = {
  REPAIRED: { label: "Réparé", color: "success", icon: "fa-circle-check" },
  PARTIALLY_REPAIRED: { label: "Partiellement réparé", color: "warning", icon: "fa-triangle-exclamation" },
  NOT_REPAIRED: { label: "Non réparé", color: "danger", icon: "fa-circle-xmark" },
  NEEDS_RETURN: { label: "Doit revenir pour finir", color: "info", icon: "fa-rotate-right" },
  PENDING: { label: "En cours de réparation", color: "secondary", icon: "fa-clock" },
};

const BASE_REPAIR_WHERE = {
  OR: [{ repairObject: { not: null } }, { repairStatus: { not: null } }],
};

class RepairCafeService {
  /**
   * Returns valid repair statuses and labels.
   */
  getStatuses() {
    return { ...VALID_STATUSES };
  }

  /**
   * Builds the Prisma `where` clause for Repair Café history list filtering.
   * Filters are always applied before pagination across all calendar years.
   *
   * @param {{ search?: string, status?: string }} [filters]
   * @returns {object}
   */
  buildHistoryWhere(filters = {}) {
    const andClauses = [BASE_REPAIR_WHERE];

    const normalizedStatus = typeof filters.status === "string" ? filters.status.trim() : "";
    if (normalizedStatus && normalizedStatus !== "all" && VALID_STATUSES[normalizedStatus]) {
      if (normalizedStatus === "PENDING") {
        andClauses.push({
          OR: [{ repairStatus: "PENDING" }, { repairStatus: null }],
        });
      } else {
        andClauses.push({ repairStatus: normalizedStatus });
      }
    }

    const rawSearch = typeof filters.search === "string" ? filters.search.trim() : "";
    if (rawSearch) {
      const tokens = rawSearch.split(/\s+/).filter(Boolean).slice(0, 6);
      for (const token of tokens) {
        andClauses.push({
          OR: [
            { repairObject: { contains: token } },
            { repairNotes: { contains: token } },
            { user: { name: { contains: token } } },
            { user: { surname: { contains: token } } },
            { user: { email: { contains: token } } },
          ],
        });
      }
    }

    return andClauses.length === 1 ? andClauses[0] : { AND: andClauses };
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
        referenceCacheService.invalidate();
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
    const userFullName = updated.user ? `${updated.user.name} ${updated.user.surname}` : `Contributeur #${updated.userId}`;
    logger.logThat(
      `Sortie Repair Café enregistrée pour ${userFullName} (Objet: "${updated.repairObject || "Non précisé"}") - Statut: ${statusLabel}`,
    );

    return updated;
  }

  /**
   * Computes annual calendar-year KPI metrics (independent of list filters/pagination)
   * AND fetches the filtered, stably ordered, paginated Repair Café history (25/page).
   *
   * @param {{ page?: number, pageSize?: number, search?: string, status?: string, referenceDate?: Date, timeZone?: string }} [options]
   */
  async getRepairStats(options = {}) {
    const timeZone = options.timeZone || getAppTimezone();
    const referenceDate = options.referenceDate instanceof Date ? options.referenceDate : new Date();
    const { year: statsYear, start: yearStart, nextYearStart } = getZonedYearBounds(referenceDate, timeZone);

    const pageSize = Number.isInteger(options.pageSize) && options.pageSize > 0 ? options.pageSize : PAGE_SIZE;
    const requestedPage = Number.isInteger(Number(options.page)) && Number(options.page) >= 1 ? Number(options.page) : 1;
    const search = typeof options.search === "string" ? options.search.trim() : "";
    const status =
      typeof options.status === "string" && VALID_STATUSES[options.status.trim()] ? options.status.trim() : "all";

    const annualWhere = {
      AND: [
        BASE_REPAIR_WHERE,
        {
          arrival: {
            gte: yearStart,
            lt: nextYearStart,
          },
        },
      ],
    };

    const listWhere = this.buildHistoryWhere({ search, status });

    const [annualRows, totalCount] = await Promise.all([
      prisma.history.findMany({
        where: annualWhere,
        select: {
          id: true,
          userId: true,
          repairStatus: true,
        },
      }),
      prisma.history.count({ where: listWhere }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const currentPage = Math.min(requestedPage, totalPages);
    const skip = (currentPage - 1) * pageSize;

    const pageRecords =
      totalCount > 0
        ? await prisma.history.findMany({
            where: listWhere,
            include: {
              user: {
                select: { id: true, name: true, surname: true, email: true },
              },
              workspace: {
                select: { id: true, name: true },
              },
            },
            orderBy: [{ arrival: "desc" }, { id: "desc" }],
            skip,
            take: pageSize,
          })
        : [];

    let repairedCount = 0;
    let partiallyRepairedCount = 0;
    let notRepairedCount = 0;
    let needsReturnCount = 0;
    let pendingCount = 0;

    const userIds = new Set();

    annualRows.forEach((r) => {
      if (r.userId) userIds.add(r.userId);

      const st = r.repairStatus || "PENDING";
      if (st === "REPAIRED") repairedCount++;
      else if (st === "PARTIALLY_REPAIRED") partiallyRepairedCount++;
      else if (st === "NOT_REPAIRED") notRepairedCount++;
      else if (st === "NEEDS_RETURN") needsReturnCount++;
      else pendingCount++;
    });

    const totalVisits = annualRows.length;
    const uniqueVisitors = userIds.size;
    const decidedTotal = repairedCount + partiallyRepairedCount + notRepairedCount + needsReturnCount;

    // Rate: Full repairs (100%) + partial repairs (50%)
    const globalSuccessRate =
      decidedTotal > 0 ? Math.round(((repairedCount + partiallyRepairedCount * 0.5) / decidedTotal) * 100) : 0;

    // Strict full repair rate
    const strictSuccessRate = decidedTotal > 0 ? Math.round((repairedCount / decidedTotal) * 100) : 0;

    return {
      statsYear,
      timeZone,
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
      filters: {
        search,
        status,
      },
      pagination: {
        page: currentPage,
        pageSize,
        totalCount,
        totalPages,
        hasPrev: currentPage > 1,
        hasNext: currentPage < totalPages,
      },
      records: pageRecords.map((r) => ({
        id: r.id,
        arrival: r.arrival,
        departure: r.departure,
        repairObject: r.repairObject || "Objet non spécifié",
        repairStatus: r.repairStatus || "PENDING",
        repairNotes: r.repairNotes || "",
        userFullName: r.user ? `${r.user.name} ${r.user.surname}` : "Contributeur inconnu",
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

const instance = new RepairCafeService();
instance.PAGE_SIZE = PAGE_SIZE;
module.exports = instance;
