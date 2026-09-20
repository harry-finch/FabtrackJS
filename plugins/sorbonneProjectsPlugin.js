const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

module.exports = {
  id: "sorbonne",
  name: "Plugin Projets Sorbonne",
  version: "1.0.0",
  envKey: "ENABLE_PLUGIN_SORBONNE",
  description: "Rattachement d'une Entité ou UFR aux projets Sorbonne avec traçabilité et règlement des consommations.",

  register(hookManager) {
    const sorbonneService = require("../services/sorbonneService.js");
    sorbonneService.ensureProjectType().catch((err) => {
      console.error("Error ensuring Sorbonne project type:", err);
    });

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
};
