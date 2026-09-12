/**
 * Plugin Ateliers pour FabtrackJS
 * Gère la participation aux ateliers organisés par le Fablab :
 * - Remplacement du champ documentation par la sélection d'un atelier actif
 * - Attribution automatique du badge et de l'habilitation sur le profil de l'usager
 */

module.exports = {
  id: "workshop",
  name: "Plugin Ateliers",
  version: "1.0.0",
  envKey: "ENABLE_PLUGIN_WORKSHOP",
  description: "Gestion des visites d'ateliers : sélection de l'atelier suivi lors de l'enregistrement et attribution automatique du badge et de l'habilitation machine sur le profil de l'usager.",

  register(hookManager) {
    const workshopService = require("../services/workshopService.js");
    workshopService.ensureProjectType().catch((err) => {
      console.error("[workshopPlugin] Error ensuring project type:", err);
    });
  },
};
