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
  description: "Gestion des visites d'ateliers.",

  register(_hookManager) {
    // No synchronous DB writes at module load time; see bootstrap()
  },

  async bootstrap() {
    const workshopService = require("../services/workshopService.js");
    await workshopService.ensureProjectType();
  },
};
