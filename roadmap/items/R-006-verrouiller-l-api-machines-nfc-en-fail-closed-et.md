---
id: R-006
titre: "Verrouiller l'API machines/NFC en Fail-Closed et corriger machineUsageService"
resume: "Sécuriser les endpoints /api/machines/* par défaut, supprimer la fuite PII de User et corriger les failles d'autorisation et d'IDOR."
statut: a-tester
jalon: v1.1
cree: 2026-11-21
maj: 2026-11-21
livree:
---

## But

Durcir l'authentification des endpoints machines/NFC (`/api/machines/*`) en mode **Fail-Closed** par défaut, supprimer l'exposition excessive de données personnelles (`User`), appliquer les règles métier d'accès machine et d'avertissements actifs, et corriger les failles d'autorisation et d'IDOR dans `machineUsageService`.

## Inclus

- **Authentification Fail-Closed (`middleware/checkApiKeyOrSession.js` & `services/settingsService.js`) :**
  - Bascule directe en **Fail-Closed** (retour HTTP `401` si aucune clé API n'est configurée via `FABTRACK_API_KEY`, `MACHINE_API_KEY` ou `api_machine_token`).
  - Passage de `checkApiKeyOrSession` en `async` via `await settingsService.getSettings()` (plus de lecture synchrone d'un cache potentiellement obsolète) et ajout d'un rechargement atomique `reloadSettings()` dans `settingsService.updateSettings()`.
  - Suppression de l'acceptation de la clé en query string (`?apiKey=`) ; seuls les en-têtes `x-api-key` et `Authorization: Bearer <clé>` sont acceptés.
  - Comparaison des clés en temps constant via empreinte SHA-256 + `crypto.timingSafeEqual`.
- **Minimisation des PII (`services/machineUsageService.js`, `routes/api.js`, `routes/admin/machines.js`) :**
  - Dans `getMachineUsageHistory`, limiter par défaut le `select` de `User` à `{ id, name, surname }` (suppression de `rfid`, `token`, `email`, `balance`), valider `machineId` (entier strictement positif) et borner `limit` (`1..200`).
  - Conserver `{ includeEmail: true }` uniquement pour l'appel interne de la route admin `routes/admin/machines.js` (aucun `rfid`/`token`/`balance`).
  - Retirer `email` de la réponse de `verifyUserPresenceByCard`.
- **Contrôle d'accès machine, avertissements & intégrité (`services/machineUsageService.js`, `routes/api.js`) :**
  - **Règle d'accès machine (arbitrage 1A, sans migration SQL) :** si aucun atelier actif (`Workshop.active === true`) n'est rattaché à `machine.accessId`, la machine est en accès libre ; si ≥ 1 atelier actif y est rattaché, l'usager doit avoir complété au moins l'un de ces ateliers (`UserWorkshopCompletion`) ou être `user.isExpert === true` (`403 MACHINE_ACCESS_DENIED`).
  - **Avertissements actifs (arbitrage 2A) :** tout avertissement actif (`Warning.active === true`) bloque le déverrouillage sur scan NFC (`canUnlock: false`, HTTP `403`, `code: "ACTIVE_WARNING"`).
  - Vérifier l'existence de `machineId` (`404 MACHINE_NOT_FOUND`), restreindre la recherche de présence active (`History`) à la journée en cours, filtrer `deletedAt: null` lors de la résolution par `userId` dans `_resolveUser`, vérifier `termsAccepted` et l'appartenance de `historyId` à `user.id` (`403 INVALID_HISTORY`) sur `/start` et `/record`.
  - Sur `endMachineUsage`, imposer `resourceType === "MACHINE"` et `endedAt === null` lors de la clôture par `activityId` (`404 ACTIVITY_NOT_FOUND`), retourner `404 USER_NOT_FOUND` si `rfid` est inconnu (ne jamais clôturer la session d'un autre usager), et rejeter `endedAt < startedAt` (`400 INVALID_DATE_RANGE`).
- **Validation stricte Zod (`schemas/machineUsage.schema.js` & `routes/api.js`) :**
  - Remplacer les prétraitements permissifs par `optionalPositiveInt`, `requiredPositiveInt`, `optionalNonNegativeNumber`, `optionalIsoDate` (sans accepter des chaînes arbitraires non parsables), rejeter `endedAt < startedAt`, et valider les paramètres de requête `GET /machines/verify-user` et `GET /machines/usage`.

## Hors périmètre

- Aucune modification du schéma Prisma ni migration SQL (l'accès machine repose sur les modèles existants `Machine`, `Workshop`, `UserWorkshopCompletion` et `User.isExpert`).
- Refactorisation des autres routes API non liées aux machines (`/api/rfid-scan`, plugins) ou du middleware global d'erreur (traités dans `R-007`+).
- Déploiement d'un client NFC matériel externe.

## Dépendances

- Aucune dépendance technique bloquante.
- Modèles Prisma existants : `User`, `Machine`, `Workshop`, `UserWorkshopCompletion`, `Warning`, `History`, `Activity`, `SystemSetting`.

## Critères d'acceptation

- `GET`/`POST /api/machines/*` sans session authentifiée retourne HTTP `401` dès qu'aucune clé API valide n'est fournie ou configurée (y compris si `?apiKey=` est passé en query string).
- `GET /api/machines/usage` ne renvoie jamais `rfid`, `token`, `email` ou `balance` sur `user`, et borne `limit` entre `1` et `200`.
- `verifyUserPresenceByCard` retourne `404 MACHINE_NOT_FOUND` si `machineId` est inconnu, `403 ACTIVE_WARNING` si un `Warning` actif existe, `403 MACHINE_ACCESS_DENIED` si la machine exige au moins un `Workshop` actif que l'usager (non `isExpert`) n'a pas validé, et ne tient compte que d'une visite `History` du jour.
- `endMachineUsage` retourne `404 USER_NOT_FOUND` si un `rfid` inconnu est fourni (même si `activityId` est présent), et refuse de clôturer une activité qui n'est pas de type `"MACHINE"` ou déjà terminée.
- `startMachineUsage` et `recordMachineUsage` vérifient `termsAccepted`, `deletedAt: null` sur `userId` et l'appartenance de `historyId` à `user.id`.
- La suite unitaire `npx jest tests/unit/ --runInBand --forceExit` passe à 100 %, incluant les tests unitaires dédiés à `R-006`.

## Vérifications de l'utilisateur

- Tester les endpoints API machines/NFC en local (`/api/machines/verify-user`, `/start`, `/end`, `/record`, `/usage`) avec et sans clé API, avec badge inconnu, usager sans atelier requis et usager sous avertissement actif.
- Vérifier le comportement Fail-Closed de `/api/machines/*` en production avant tout déploiement d'un client NFC externe.

