/**
 * Plugin BookStack Wiki pour FabtrackJS
 * Permet l'intégration du wiki BookStack de Sorbonne Université :
 * - Pré-remplissage automatique du champ documentation
 * - Vérification en direct de la fraîcheur documentaire (comparée à la dernière visite de l'usager)
 * - Page de configuration avec clés API et statistiques des projets
 */

module.exports = {
  id: "bookstack",
  name: "Plugin BookStack Wiki",
  version: "1.0.0",
  envKey: "ENABLE_PLUGIN_BOOKSTACK",
  description: "Intégration du Wiki BookStack : pré-remplissage d'URL, vérification de fraîcheur de la documentation (bouton vert/rouge) et suivi statistique.",

  register(hookManager) {
    // Menu item for admin panel
    hookManager.addHook("admin:menuItems", () => {
      return {
        id: "bookstack",
        name: "Wiki BookStack",
        shortName: "BookStack",
        url: "/admin/bookstack",
        icon: "fa-solid fa-book",
        badge: "Wiki",
        section: "activity",
      };
    });
  },
};
