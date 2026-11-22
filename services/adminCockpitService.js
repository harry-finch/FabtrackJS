/**
 * Admin Cockpit & Sidebar Counters Service (R-033)
 * Aggregates live daily KPIs, actionable alerts ("À traiter aujourd'hui"),
 * and cached lightweight counters for the persistent admin sidebar.
 */

const { prisma } = require("../utilities/db.js");
const { getStartOfDay } = require("./visitAutoCloseService.js");

const SIDEBAR_CACHE_TTL_MS = 30 * 1000;

let sidebarCache = null;
let sidebarCacheExpiresAt = 0;

function getEmptyCounters() {
  return {
    presentCount: 0,
    activeWarningsCount: 0,
    overdueLoansCount: 0,
    lowStockCount: 0,
    machinesCount: 0,
    openIssuesCount: 0,
    pendingStaffCount: 0,
  };
}

function invalidateSidebarCache() {
  sidebarCache = null;
  sidebarCacheExpiresAt = 0;
}

/**
 * Lightweight cached counters for the persistent admin sidebar.
 * Avoids running multiple COUNT queries on every admin page navigation.
 */
async function getSidebarCounters({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && sidebarCache && now < sidebarCacheExpiresAt) {
    return sidebarCache;
  }

  try {
    const startOfToday = getStartOfDay(new Date());
    const nowDate = new Date();

    const [
      presentCount,
      activeWarningsCount,
      overdueLoansCount,
      lowStockCount,
      machinesCount,
      openIssuesCount,
      pendingStaffCount,
    ] = await Promise.all([
      prisma.history.count({
        where: { departure: null, arrival: { gte: startOfToday } },
      }),
      prisma.warning.count({
        where: { active: true },
      }),
      prisma.activity.count({
        where: {
          resourceType: "EQUIPMENT",
          returnedAt: null,
          expectedReturnAt: { lt: nowDate },
        },
      }),
      prisma.consumable.count({
        where: {
          status: { in: ["LOW_STOCK", "OUT_OF_STOCK"] },
        },
      }),
      prisma.machine.count(),
      prisma.machineIssue.count({
        where: {
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
      }),
      prisma.staff.count({
        where: { approved: false },
      }),
    ]);

    const counters = {
      presentCount,
      activeWarningsCount,
      overdueLoansCount,
      lowStockCount,
      machinesCount,
      openIssuesCount,
      pendingStaffCount,
    };

    sidebarCache = counters;
    sidebarCacheExpiresAt = Date.now() + SIDEBAR_CACHE_TTL_MS;
    return counters;
  } catch (err) {
    console.error("[adminCockpitService] Failed to compute sidebar counters:", err.message);
    return sidebarCache || getEmptyCounters();
  }
}

/**
 * Full live Cockpit data for GET /admin ("À traiter aujourd'hui").
 */
async function getCockpitData() {
  const counters = await getSidebarCounters({ forceRefresh: true });
  const nowDate = new Date();

  try {
    const [overdueActivities, lowStockItems, openIssues, pendingStaff] = await Promise.all([
      prisma.activity.findMany({
        where: {
          resourceType: "EQUIPMENT",
          returnedAt: null,
          expectedReturnAt: { lt: nowDate },
        },
        include: {
          user: { select: { id: true, name: true, surname: true } },
        },
        orderBy: { expectedReturnAt: "asc" },
        take: 6,
      }),
      prisma.consumable.findMany({
        where: {
          status: { in: ["LOW_STOCK", "OUT_OF_STOCK"] },
        },
        orderBy: [{ stock: "asc" }, { name: "asc" }],
        take: 6,
      }),
      prisma.machineIssue.findMany({
        where: {
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
        include: {
          machine: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.staff.findMany({
        where: { approved: false },
        select: { id: true, name: true, email: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 4,
      }),
    ]);

    // Resolve equipment names for overdue loans in one batch query
    const equipmentIds = [...new Set(overdueActivities.map((a) => a.resourceId).filter(Boolean))];
    const equipmentList =
      equipmentIds.length > 0
        ? await prisma.equipment.findMany({
            where: { id: { in: equipmentIds } },
            select: { id: true, name: true },
          })
        : [];
    const equipmentMap = new Map(equipmentList.map((e) => [e.id, e.name]));

    const todoItems = [];

    for (const loan of overdueActivities) {
      const borrower = loan.user ? `${loan.user.name} ${loan.user.surname}`.trim() : `Contributeur #${loan.userId}`;
      const eqName = equipmentMap.get(loan.resourceId) || `Équipement #${loan.resourceId}`;
      todoItems.push({
        kind: "overdue_loan",
        severity: "danger",
        icon: "fa-solid fa-toolbox",
        badge: "Emprunt en retard",
        title: `${eqName} — ${borrower}`,
        subtitle: loan.expectedReturnAt
          ? `Retour prévu le ${new Date(loan.expectedReturnAt).toLocaleDateString("fr-FR")}`
          : "Échéance dépassée",
        href: "admin/equipment/manage",
        actionLabel: "Gérer les prêts",
      });
    }

    for (const issue of openIssues) {
      const machineName = issue.machine ? issue.machine.name : `Machine #${issue.machineId}`;
      const excerpt = String(issue.description || "").trim().slice(0, 90);
      todoItems.push({
        kind: "machine_issue",
        severity: "danger",
        icon: "fa-solid fa-triangle-exclamation",
        badge: issue.status === "IN_PROGRESS" ? "Maintenance en cours" : "Panne ouverte",
        title: machineName,
        subtitle: excerpt + (String(issue.description || "").length > 90 ? "…" : ""),
        href: `admin/machines/view/${issue.machineId}`,
        actionLabel: "Voir la fiche",
      });
    }

    for (const item of lowStockItems) {
      const isOut = item.status === "OUT_OF_STOCK" || Number(item.stock) <= 0;
      todoItems.push({
        kind: "low_stock",
        severity: isOut ? "danger" : "warning",
        icon: "fa-solid fa-boxes-stacked",
        badge: isOut ? "Rupture de stock" : "Stock bas",
        title: item.name,
        subtitle: `Stock actuel : ${item.stock} ${item.unit || ""} (seuil : ${item.reorderThreshold})`.trim(),
        href: "admin/consumables/manage",
        actionLabel: "Réapprovisionner",
      });
    }

    for (const st of pendingStaff) {
      todoItems.push({
        kind: "pending_staff",
        severity: "info",
        icon: "fa-solid fa-user-clock",
        badge: "Compte staff en attente",
        title: st.name,
        subtitle: st.email || "Validation administrateur requise",
        href: "admin/staff/manage",
        actionLabel: "Valider",
      });
    }

    return {
      counters,
      todoItems,
    };
  } catch (err) {
    console.error("[adminCockpitService] Failed to load cockpit details:", err.message);
    return {
      counters,
      todoItems: [],
    };
  }
}

module.exports = {
  getSidebarCounters,
  getCockpitData,
  invalidateSidebarCache,
  getEmptyCounters,
  SIDEBAR_CACHE_TTL_MS,
};
