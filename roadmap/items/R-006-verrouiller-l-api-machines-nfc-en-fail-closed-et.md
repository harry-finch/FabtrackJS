---
id: R-006
titre: "Verrouiller l'API machines/NFC en Fail-Closed et corriger machineUsageService"
resume: "Sécuriser les endpoints /api/machines/* par défaut, supprimer la fuite PII de User et corriger les failles d'autorisation et d'IDOR."
statut: idee
jalon: v1.1
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** Top 10 (#3) · `AUD-003`, `AUD-004` (post-Opus `R-003`)
- **Fichiers principaux :** `middleware/checkApiKeyOrSession.js`, `services/settingsService.js:79-138`, `routes/api.js:244-375`, `services/machineUsageService.js`, `schemas/machineUsage.schema.js`
- **Périmètre envisagé :**
  - Passer `checkApiKeyOrSession` en Fail-Closed (`401` si aucune clé configurée), le rendre `async` via `await settingsService.getSettings()` (et recharger atomiquement le cache dans `updateSettings`), supprimer `?apiKey=` en query string et comparer en temps constant via `crypto.timingSafeEqual`.
  - Restreindre le `select` de `User` dans `getMachineUsageHistory` à `{ id, name, surname }` (plus de `rfid`, `token`, `email`, `balance`) et valider `machineId` + borner `limit` (`1..200`).
  - Dans `verifyUserPresenceByCard`, implémenter le contrôle d'accès machine, vérifier les avertissements actifs, l'existence de `machineId` et limiter la présence active aux visites du jour.
  - Dans `endMachineUsage`, imposer `resourceType === "MACHINE"` et `endedAt === null` sur `activityId`, et retourner `404 USER_NOT_FOUND` si `rfid` est inconnu (ne plus fermer la session d'un autre usager).
  - Filtrer `deletedAt: null` dans `_resolveUser` pour `userId`, vérifier `termsAccepted` et l'appartenance de `historyId` à `user.id`, et corriger la validation dates/nombres de `machineUsage.schema.js`.
- **Arbitrages & dépendances :**
  - Aucun client NFC en production sans clé actuellement : bascule directe en Fail-Closed sans phase de transition.
  - **À spécifier avant développement :** règle métier exacte distinguant une machine en « accès libre » d'une machine exigeant une habilitation (`Access` / `Workshop` / `isExpert`).
- **Critères d'acceptation visés :** `401` sans clé même sans token configuré ; zéro `rfid`/`token`/`email` dans `GET /api/machines/usage` ; badge inconnu sur `/end` → `404` sans effet de bord ; usager non habilité → `canUnlock: false` (`403`).
