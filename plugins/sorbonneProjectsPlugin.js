const { prisma } = require("../utilities/db.js");

module.exports = {
  id: "sorbonne",
  name: "Plugin Projets Sorbonne",
  version: "1.0.0",
  envKey: "ENABLE_PLUGIN_SORBONNE",
  description: "Rattachement d'une Entité ou UFR aux projets Sorbonne avec traçabilité et règlement des consommations.",

  register(hookManager) {
    // Hook to provide distinct Sorbonne entities already in the database
    hookManager.addHook("fabtrack:sorbonneEntities", async () => {
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
        return projects.map((p) => p.sorbonneEntity).filter(Boolean);
      } catch (err) {
        console.error("Error fetching sorbonne entities in plugin hook:", err);
        return [];
      }
    });

    // Hook to provide admin menu item
    hookManager.addHook("admin:menuItems", () => {
      return {
        id: "sorbonne",
        name: "Projets Sorbonne",
        shortName: "Projets Sorbonne",
        url: "/admin/sorbonne",
        icon: "fa-solid fa-landmark",
        badge: "Sorbonne",
      };
    });
  },

  async bootstrap() {
    const sorbonneService = require("../services/sorbonneService.js");
    await sorbonneService.ensureProjectType();
  },
};
