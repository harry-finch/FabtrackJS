/**
 * Plugin Repair Café pour FabtrackJS
 * Gère les ateliers Repair Café :
 * - Remplacement du champ documentation par l'objet à réparer
 * - Popup de clôture à la sortie (Réparé / Partiellement réparé / Non réparé / Doit revenir)
 * - Tableau de bord avec historique, taux de réparation et nombre de visiteurs
 */

module.exports = {
  id: "repaircafe",
  name: "Plugin Repair Café",
  version: "1.0.0",
  envKey: "ENABLE_PLUGIN_REPAIRCAFE",
  description: "Gestion des visites Repair Café : saisie de l'objet à réparer, modal de bilan de réparation à la sortie et suivi statistique.",

  register(hookManager) {
    const repairCafeService = require("../services/repairCafeService.js");
    repairCafeService.ensureProjectType().catch((err) => {
      console.error("[repairCafePlugin] Error ensuring project type:", err);
    });

    // Menu item for admin panel in Section 1 (Activité & Suivi)
    hookManager.addHook("admin:menuItems", () => {
      return {
        id: "repaircafe",
        name: "Repair Café",
        shortName: "Repair Café",
        url: "/admin/repair-cafe",
        icon: "fa-solid fa-wrench",
        badge: "Atelier",
        section: "activity",
      };
    });
  },
};
