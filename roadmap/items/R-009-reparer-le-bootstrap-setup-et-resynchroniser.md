---
id: R-009
titre: "Réparer le bootstrap /setup et resynchroniser prisma/schema.sql"
resume: "Importer setupService dans app.js, corriger la création des espaces de travail au setup et réaligner schema.sql avec v1.0."
statut: a-tester
jalon: v1.1
cree: 2026-11-21
maj: 2026-11-21
livree:
---

## But

Fiabiliser l'installation initiale (`/setup`) sur une base vierge et empêcher toute ré-exécution ou détournement de compte sur une instance déjà initialisée, en corrigeant l'import manquant de `setupService` dans `app.js`, la lecture JSON des espaces de travail, la session post-setup, l'échappement DOM dans `views/setup/index.ejs` et la synchronisation complète de `prisma/schema.sql` avec `prisma/schema.prisma`.

## Inclus

- **Bootstrap `app.js` :**
  - Importer `setupService = require("./services/setupService")` dans `app.js` afin d'éviter la `ReferenceError` lors de la vérification `setupService.checkIsInstalled()`.
- **Sécurisation & fiabilisation de `setupService` / `setup.schema.js` / `routes/setup.js` :**
  - Rendre `setupService.checkIsInstalled()` **Fail-Closed** sur erreur DB transitoire (retourne `true` afin de ne jamais exposer `/setup` pendant une coupure MariaDB).
  - Re-vérifier atomiquement l'état d'installation (`platform_installed === "true"` ou `staff.count({ where: { role: "admin" } }) > 0`) à l'intérieur de la transaction `runSetup()` et refuser d'écraser un compte existant (erreur typée `ALREADY_INSTALLED`, HTTP `403`), avec option explicite `{ allowReconfigure: true }` réservée au CLI `scripts/setup.js`.
  - Corriger la session créée après `POST /setup` dans `routes/setup.js` : régénérer la session (`req.session.regenerate`), renseigner `req.session.username = result.admin.name`, `req.session.staffId = result.admin.id`, `req.session.role = "admin"`, `req.session.loggedin = true`, et `req.session.lastWorkspaceId` depuis le premier espace créé ; retourner `403` si `runSetup` lève `ALREADY_INSTALLED`.
  - Parser correctement le tableau JSON `workspaces` envoyé par le formulaire dans `schemas/setup.schema.js` (`parseWorkspacesInput`) et `services/setupService.js` (tout en conservant la compatibilité avec les chaînes séparées par virgules/lignes et les tableaux JS).
- **Vue `/setup` (`views/setup/index.ejs`) :**
  - Préfixer l'attribut `action` du formulaire avec `baseUrl` (`<%= typeof baseUrl !== 'undefined' ? baseUrl : '/' %>setup`) pour compatibilité reverse proxy en sous-chemin.
  - Supprimer les injections `innerHTML` non échappées lors du rendu des tags d'espaces de travail (`renderWorkspaces` et `updateSummary`) au profit de `document.createElement` + `textContent`.
- **Resynchronisation SQL (`prisma/schema.sql`) :**
  - Régénérer `prisma/schema.sql` depuis `prisma/schema.prisma` via `npx prisma migrate diff --from-empty --to-schema=prisma/schema.prisma --script` pour inclure directement les 7 colonnes v1.0 d'`Activity`, les colonnes d'`Equipment` dans `CREATE TABLE`, `Staff.pwdToken VARCHAR(64)` (`R-004`) et `MachineMaintenance` / `InventoryMovement`.
- **Tests unitaires (`tests/unit/setupR009.test.js`)** couvrant `parseWorkspacesInput`/`setupSchema`, `setupService.checkIsInstalled` fail-closed, `runSetup` anti-re-setup & espaces JSON, et `routes/setup.js` (`regenerate`, `username`, `staffId`, `lastWorkspaceId`, `403`).

## Hors périmètre

- Création d'un historique de migrations Prisma incrémentales (`prisma/migrations/`).
- Modification du flux d'inscription `/register` ou du mot de passe des comptes existants.

## Dépendances

- `prisma/schema.prisma` (source de vérité unique pour la régénération de `prisma/schema.sql`).

## Critères d'acceptation

- `app.js` importe `setupService` et démarre sans `ReferenceError`.
- `setupService.checkIsInstalled()` retourne `true` (Fail-Closed) en cas d'erreur DB.
- `setupService.runSetup()` crée des espaces propres à partir d'une chaîne JSON `'["Atelier principal","Salle Laser"]'` (sans guillemets ni crochets) et rejette avec `ALREADY_INSTALLED` si un admin ou `platform_installed = "true"` existe déjà dans la transaction.
- `POST /setup` régénère la session, renseigne `req.session.username`, `req.session.staffId` et `req.session.lastWorkspaceId`, et renvoie `403` JSON (ou redirection `/login`) si la plateforme est déjà installée.
- `views/setup/index.ejs` utilise `baseUrl` sur `action` et échappe tout nom d'espace via `textContent`.
- `prisma/schema.sql` reflète intégralement `prisma/schema.prisma` (dont les 7 colonnes v1.0 d'`Activity` et les colonnes `Equipment` dans `CREATE TABLE`).
- La suite unitaire complète `npx jest tests/unit/ --runInBand --forceExit` passe à 100 %.

## Vérifications de l'utilisateur

- Tester le rendu de `/setup` (ou simuler une base vierge en local) pour vérifier la création propre des espaces de travail et la connexion automatique avec le bon nom d'utilisateur en barre supérieure.
- Vérifier qu'une instance déjà installée bloque systématiquement `GET /setup` et `POST /setup` (redirection `/login` ou HTTP `403`).

