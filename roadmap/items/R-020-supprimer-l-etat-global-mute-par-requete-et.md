---
id: R-020
titre: "Supprimer l'état global muté par requête et masquer les erreurs internes en prod"
resume: "Passer la locale par requête dans dateService, synchroniser les plugins au changement uniquement et masquer stack/erreurs Prisma en production."
statut: idee
jalon: v1.3
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** `AUD-028` (Opus #18, #19)
- **Fichiers principaux :** `app.js:214-249,429-472`, `services/dateService.js`, `services/settingsService.js`
- **Périmètre envisagé :**
  - Passer la locale en paramètre (`moment(date).locale(locale)`) dans `dateService` au lieu de muter `moment.locale` globalement, et supporter toute langue ajoutée par CSV.
  - Synchroniser `hookManager.setPluginEnabled` uniquement au démarrage et lors de `settingsService.updateSettings` (plus 6 fois par requête).
  - Dans le handler global `app.js:429-472`, masquer `err.stack` et `err.message` pour `statusCode >= 500` dès que `NODE_ENV !== "development"` explicite.
- **Arbitrages & dépendances :** Aucune.
- **Critères d'acceptation visés :** Requêtes concurrentes FR/EN isolées ; erreur 500 en prod sans stack trace ni détail Prisma.
