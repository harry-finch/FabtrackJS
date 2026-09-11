const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

module.exports = {
  id: "ue",
  name: "Plugin UE",
  version: "1.0.0",
  envKey: "ENABLE_PLUGIN_UE",
  description: "Adds Teaching Units (UE) support for Sorbonne Université with consolidated billing.",

  register(hookManager) {
    // Hook to provide active teaching units to the kiosk registration page
    hookManager.addHook("fabtrack:teachingUnits", async () => {
      try {
        const units = await prisma.teachingUnit.findMany({
          where: { active: true },
          orderBy: { code: "asc" },
        });
        return units;
      } catch (err) {
        console.error("Error fetching teaching units in plugin hook:", err);
        return [];
      }
    });

    // Hook to provide admin menu item
    hookManager.addHook("admin:menuItems", () => {
      return {
        id: "ue",
        name: "Unités d'Enseignement",
        shortName: "UE Sorbonne",
        url: "/admin/ue",
        icon: "fa-solid fa-graduation-cap",
        badge: "Sorbonne",
      };
    });
  },
};
