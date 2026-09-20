const { PrismaClient, ResourceType } = require("@prisma/client");
const prisma = new PrismaClient();
const settingsService = require("./settingsService");
const dateService = require("./dateService");

class SorbonneService {
  /**
   * Ensures the project type configured for Sorbonne projects exists in the database
   */
  async ensureProjectType() {
    try {
      const typeName = (await settingsService.getSetting("sorbonne_projecttype_name")) || "Sorbonne";
      let projectType = await prisma.projecttype.findFirst({
        where: {
          name: { equals: typeName },
        },
      });

      if (!projectType) {
        projectType = await prisma.projecttype.create({
          data: { name: typeName },
        });
      }
      return projectType;
    } catch (err) {
      console.error("[SorbonneService] Error ensuring project type:", err);
      return null;
    }
  }

  /**
   * Returns a distinct, sorted list of all Sorbonne entities / UFR entered in projects
   */
  async getDistinctEntities() {
    try {
      const projects = await prisma.project.findMany({
        where: {
          sorbonneEntity: { not: null },
          NOT: { sorbonneEntity: "" },
        },
        select: { sorbonneEntity: true },
        distinct: ["sorbonneEntity"],
        orderBy: { sorbonneEntity: "asc" },
      });

      const projectEntities = projects.map((p) => p.sorbonneEntity.trim()).filter(Boolean);

      // Also check history for any legacy or directly recorded entities
      const histories = await prisma.history.findMany({
        where: {
          sorbonneEntity: { not: null },
          NOT: { sorbonneEntity: "" },
        },
        select: { sorbonneEntity: true },
        distinct: ["sorbonneEntity"],
        orderBy: { sorbonneEntity: "asc" },
      });

      const historyEntities = histories.map((h) => h.sorbonneEntity.trim()).filter(Boolean);

      const merged = Array.from(new Set([...projectEntities, ...historyEntities]));
      merged.sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
      return merged;
    } catch (err) {
      console.error("[SorbonneService] Error fetching distinct entities:", err);
      return [];
    }
  }

  /**
   * Fetches all consumable activities associated with Sorbonne projects, enriched with costs and entity
   */
  async getSorbonneConsumptions(options = {}) {
    const { entity, status } = options;

    // 1. Fetch all consumable activities that have a history linking to a project with a sorbonneEntity (or history with sorbonneEntity)
    const rawActivities = await prisma.activity.findMany({
      where: {
        resourceType: ResourceType.CONSUMABLE,
        history: {
          OR: [
            { sorbonneEntity: { not: null } },
            {
              userproject: {
                project: {
                  sorbonneEntity: { not: null },
                },
              },
            },
          ],
        },
      },
      include: {
        user: true,
        history: {
          include: {
            workspace: true,
            userproject: {
              include: {
                project: {
                  include: { projecttype: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 2. Fetch consumables map for pricing
    const consumables = await prisma.consumable.findMany();
    const consumableMap = new Map(consumables.map((c) => [c.id, c]));

    // 3. Map and enrich activities
    let enriched = rawActivities.map((act) => {
      const consumable = consumableMap.get(act.resourceId);
      const unitCost = consumable ? Number(consumable.cost) : 0;
      const qty = act.quantity || 1;
      const totalCost = Number((unitCost * qty).toFixed(2));
      const project = act.history && act.history.userproject ? act.history.userproject.project : null;
      const sorbonneEntity = (project && project.sorbonneEntity) || (act.history && act.history.sorbonneEntity) || "Non spécifié";

      return {
        id: act.id,
        createdAt: act.createdAt,
        formattedDate: dateService.formatDate(act.createdAt),
        consumableId: act.resourceId,
        consumableName: consumable ? consumable.name : `Consommable #${act.resourceId}`,
        consumableUnit: consumable ? consumable.unit || "u" : "u",
        quantity: qty,
        unitCost,
        totalCost,
        userId: act.userId,
        userName: act.user ? `${act.user.name} ${act.user.surname}` : "Inconnu",
        userEmail: act.user ? act.user.email : "",
        projectId: project ? project.id : null,
        projectUrl: project ? project.url : "N/A",
        projectTypeName: project && project.projecttype ? project.projecttype.name : "",
        sorbonneEntity,
        settled: !!act.settled,
        settledAt: act.settledAt,
        settledAtFormatted: act.settledAt ? dateService.formatDate(act.settledAt) : null,
        settledBy: act.settledBy || null,
        workspaceName: act.history && act.history.workspace ? act.history.workspace.name : "-",
      };
    });

    // Filter by entity if requested
    if (entity && entity !== "all") {
      enriched = enriched.filter((a) => a.sorbonneEntity.toLowerCase() === entity.toLowerCase());
    }

    // Filter by status if requested ('settled' or 'pending')
    if (status === "settled") {
      enriched = enriched.filter((a) => a.settled);
    } else if (status === "pending") {
      enriched = enriched.filter((a) => !a.settled);
    }

    // 4. Compute statistics
    let pendingTotalCost = 0;
    let settledTotalCost = 0;
    const entityStatsMap = new Map();

    enriched.forEach((act) => {
      if (act.settled) {
        settledTotalCost += act.totalCost;
      } else {
        pendingTotalCost += act.totalCost;
      }

      if (!entityStatsMap.has(act.sorbonneEntity)) {
        entityStatsMap.set(act.sorbonneEntity, {
          entity: act.sorbonneEntity,
          pendingCost: 0,
          settledCost: 0,
          totalCost: 0,
          pendingCount: 0,
          settledCount: 0,
          totalCount: 0,
          projects: new Set(),
          users: new Set(),
        });
      }

      const st = entityStatsMap.get(act.sorbonneEntity);
      st.totalCount += 1;
      st.totalCost += act.totalCost;
      if (act.settled) {
        st.settledCount += 1;
        st.settledCost += act.totalCost;
      } else {
        st.pendingCount += 1;
        st.pendingCost += act.totalCost;
      }
      if (act.projectId) st.projects.add(act.projectId);
      if (act.userEmail) st.users.add(act.userEmail);
    });

    const entitySummary = Array.from(entityStatsMap.values()).map((st) => ({
      entity: st.entity,
      pendingCost: Number(st.pendingCost.toFixed(2)),
      settledCost: Number(st.settledCost.toFixed(2)),
      totalCost: Number(st.totalCost.toFixed(2)),
      pendingCount: st.pendingCount,
      settledCount: st.settledCount,
      totalCount: st.totalCount,
      projectsCount: st.projects.size,
      usersCount: st.users.size,
    }));

    entitySummary.sort((a, b) => b.pendingCost - a.pendingCost);

    return {
      activities: enriched,
      entitySummary,
      pendingTotalCost: Number(pendingTotalCost.toFixed(2)),
      settledTotalCost: Number(settledTotalCost.toFixed(2)),
      grandTotalCost: Number((pendingTotalCost + settledTotalCost).toFixed(2)),
      totalActivitiesCount: enriched.length,
      activeEntitiesCount: entitySummary.length,
    };
  }

  /**
   * Toggles the settled status of a specific activity
   */
  async toggleSettled(activityId, username) {
    const act = await prisma.activity.findUnique({
      where: { id: Number(activityId) },
    });
    if (!act) return null;

    const newSettled = !act.settled;
    const updated = await prisma.activity.update({
      where: { id: act.id },
      data: {
        settled: newSettled,
        settledAt: newSettled ? new Date() : null,
        settledBy: newSettled ? username : null,
      },
    });

    return updated;
  }

  /**
   * Marks all pending activities of a specific entity as settled
   */
  async settleEntity(entityName, username) {
    if (!entityName || !entityName.trim()) return 0;

    const cleanEntity = entityName.trim();

    // Find all unsettled activities linked to this entity
    const activities = await prisma.activity.findMany({
      where: {
        settled: false,
        resourceType: ResourceType.CONSUMABLE,
        history: {
          OR: [
            { sorbonneEntity: cleanEntity },
            {
              userproject: {
                project: {
                  sorbonneEntity: cleanEntity,
                },
              },
            },
          ],
        },
      },
      select: { id: true },
    });

    if (activities.length === 0) return 0;

    const ids = activities.map((a) => a.id);
    const result = await prisma.activity.updateMany({
      where: { id: { in: ids } },
      data: {
        settled: true,
        settledAt: new Date(),
        settledBy: username,
      },
    });

    return result.count;
  }
}

module.exports = new SorbonneService();
