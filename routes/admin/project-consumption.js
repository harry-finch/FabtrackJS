const express = require("express");
const router = express.Router();
const moment = require("moment");

const asyncHandler = require("../../middleware/asyncHandler.js");
const clearNotification = require("../../middleware/clearNotification.js");
const isAdmin = require("../../middleware/checkAdmin.js");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

router.use(isAdmin);

function formatDateTime(date) {
  if (!date) return "-";
  return moment(date).format("L HH:mm");
}

// ******************************************************************************
// Route to view consumption history linked to projects
// ******************************************************************************

router.get(
  "/",
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/project-consumption";

    // 1. Fetch all consumable activities with related history, workspace, and project
    const rawActivities = await prisma.activity.findMany({
      where: { resourceType: "CONSUMABLE" },
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

    // 2. Fetch all consumables with category
    const allConsumables = await prisma.consumable.findMany({
      include: { category: true },
    });
    const consumableMap = new Map(allConsumables.map((c) => [c.id, c]));

    // 3. Fetch all projects in database
    const allProjects = await prisma.project.findMany({
      include: {
        projecttype: true,
        users: { include: { user: true } },
      },
      orderBy: { id: "asc" },
    });

    // 4. Enrich every activity
    const enrichedEntries = rawActivities.map((act) => {
      const consumable = consumableMap.get(act.resourceId);
      const unitCost = consumable ? Number(consumable.cost) : 0;
      const qty = act.quantity || 1;
      const project = act.history && act.history.userproject ? act.history.userproject.project : null;

      return {
        id: act.id,
        createdAt: act.createdAt,
        formattedDate: formatDateTime(act.createdAt),
        consumable: consumable || null,
        consumableName: consumable ? consumable.name : "Unknown Consumable",
        categoryName: consumable && consumable.category ? consumable.category.name : "Uncategorized",
        quantity: qty,
        unitCost: unitCost,
        totalCost: Number((unitCost * qty).toFixed(2)),
        user: act.user || null,
        userName: act.user ? `${act.user.name} ${act.user.surname}` : "Unknown User",
        project: project,
        projectId: project ? project.id : null,
        projectUrl: project ? project.url : "No Project Assigned",
        workspaceName: act.history && act.history.workspace ? act.history.workspace.name : "-",
      };
    });

    // 5. Group activities by project
    const projectGroupsMap = new Map();

    // Initialize all existing projects
    allProjects.forEach((proj) => {
      // Collect project members from UserProject
      const memberNames = (proj.users || [])
        .map((up) => (up.user ? `${up.user.name} ${up.user.surname}` : null))
        .filter(Boolean);

      const contributorsSet = new Set(memberNames);

      projectGroupsMap.set(proj.id, {
        project: proj,
        entries: [],
        totalUnits: 0,
        totalCost: 0,
        contributors: contributorsSet,
      });
    });

    // Bucket for entries without project
    const unassignedGroup = {
      project: { id: 0, url: "Non rattaché à un projet", active: false, projecttype: { name: "Divers" } },
      entries: [],
      totalUnits: 0,
      totalCost: 0,
      contributors: new Set(),
    };

    enrichedEntries.forEach((entry) => {
      let group = entry.projectId ? projectGroupsMap.get(entry.projectId) : unassignedGroup;
      if (!group) {
        group = unassignedGroup;
      }
      group.entries.push(entry);
      group.totalUnits += entry.quantity;
      group.totalCost += entry.totalCost;
      if (entry.userName && entry.userName !== "Unknown User") {
        group.contributors.add(entry.userName);
      }
    });

    // Convert map to array and compute final summaries
    const projectGroups = Array.from(projectGroupsMap.values())
      .filter((g) => g.entries.length > 0)
      .map((g) => ({
        ...g,
        totalCost: g.totalCost.toFixed(2),
        contributorsCount: g.contributors.size,
        contributorsList: Array.from(g.contributors).sort(),
      }));

    if (unassignedGroup.entries.length > 0) {
      projectGroups.push({
        ...unassignedGroup,
        totalCost: unassignedGroup.totalCost.toFixed(2),
        contributorsCount: unassignedGroup.contributors.size,
        contributorsList: Array.from(unassignedGroup.contributors).sort(),
      });
    }

    // Global Stats
    const totalUnitsAll = enrichedEntries.reduce((sum, e) => sum + e.quantity, 0);
    const totalCostAll = enrichedEntries.reduce((sum, e) => sum + e.totalCost, 0).toFixed(2);

    // Count ONLY active projects (strictly excluding archived projects and unassigned group)
    const activeProjectsCount = projectGroups.filter(
      (g) => g.project.id !== 0 && g.project.active === true
    ).length;

    // Determine top consumed material
    const consumableCountMap = new Map();
    enrichedEntries.forEach((e) => {
      const name = e.consumableName;
      consumableCountMap.set(name, (consumableCountMap.get(name) || 0) + e.quantity);
    });
    let topMaterial = "None";
    let maxCount = 0;
    consumableCountMap.forEach((count, name) => {
      if (count > maxCount) {
        maxCount = count;
        topMaterial = `${name} (${count} u.)`;
      }
    });

    const stats = {
      totalEntries: enrichedEntries.length,
      totalUnits: totalUnitsAll,
      totalCost: totalCostAll,
      projectsCount: activeProjectsCount,
      activeProjectsCount: activeProjectsCount,
      topMaterial: topMaterial,
    };

    res.render("admin/project-consumption", {
      projectGroups,
      allEntries: enrichedEntries,
      projects: allProjects,
      stats,
    });
  }),
);

module.exports = router;
