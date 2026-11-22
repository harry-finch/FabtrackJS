---
id: R-022
titre: "Unifier l'accès Prisma (fin du hack require.cache) et nettoyer code mort & socket.io"
resume: "Remplacer les 37 new PrismaClient() par utilities/db, retirer socket.io inutilisé et supprimer les fichiers morts suivis dans Git."
statut: a-tester
jalon: v1.4
cree: 2026-11-21
maj: 2026-11-22
livree:
---

## But

De nombreux fichiers de routes, services et plugins instancient encore directement `new PrismaClient()` et dépendent d'un monkey-patch fragile sur `require.cache["@prisma/client"]` dans `utilities/db.js`. En parallèle, des dépendances inutilisées (`socket.io`, `socket.io-client`, `randomized-string`, `node-fetch`, `uuid`), des fichiers morts suivis par Git et des écritures base de données exécutées synchronement lors de `loadPlugins()` alourdissent l'application et perturbent les démarrages/tests.

## Inclus

- Migration de l'ensemble des routes, services et plugins vers le singleton `const { prisma } = require(".../utilities/db.js")` (zéro `new PrismaClient()` hors `utilities/db.js`) et suppression définitive du monkey-patch `require.cache` dans `utilities/db.js`.
- Retrait complet de `socket.io` dans `bin/www`, remplacement de `uuid` par `crypto.randomUUID()` natif et de `node-fetch` par `global.fetch` natif Node 20+, et suppression des dépendances inutilisées dans `package.json` (`socket.io`, `socket.io-client`, `randomized-string`, `node-fetch`, `uuid`).
- Suppression des fichiers morts suivis dans Git (`utilities/render.js`, `utilities/package.json`, `core/hookLoader.js`, `hooks/testHooks.js`, `public/javascripts/edit-user.js`, `views/includes/language-selector.html`, `views/admin/error.ejs`, `public/stylesheets/style.css`, `scripts/seed-3months-activity.js`, `Icon\r`, `uploads/logo-1789385910567-749889170.svg`) et ajout de règles `.gitignore` pour `uploads/` et les fichiers icônes macOS.
- Suppression des écritures DB synchrones dans `register()` des plugins (`repairCafePlugin`, `sorbonneProjectsPlugin`, `workshopPlugin`), déplacées vers un bootstrap asynchrone explicite au démarrage serveur (`runPluginBootstrap()` appelé dans `bin/www`).

## Hors périmètre

- Création du système de migrations SQL versionnées et évolution du schéma Prisma (traité dans `R-023`).
- Refactorisation métier des routes obèses et CSP stricte (traité dans `R-024`).

## Dépendances

- `R-011` (suite de tests unitaires isolée et ESLint).

## Critères d'acceptation

- Zéro occurrence de `new PrismaClient` dans le code applicatif hors `utilities/db.js`, et zéro référence à `require.cache` dans `utilities/db.js`.
- `socket.io`, `socket.io-client`, `randomized-string`, `node-fetch` et `uuid` retirés de `package.json` et de `bin/www` ; l'application démarre proprement sans `socket.io`.
- Tous les fichiers morts listés sont supprimés et `uploads/` est ignoré par `.gitignore`.
- `loadPlugins()` ne déclenche plus aucune requête DB à l'importation.
- `npm run lint`, `npm audit --omit=dev`, `DATABASE_URL="" npm run test:unit` et `fabboard roadmap lint` passent sans erreur.

## Vérifications de l'utilisateur

- Après `npm install --omit=dev`, démarrer FabtrackJS (`npm start` ou `npm run dev`) et vérifier un démarrage propre sans `socket.io` ainsi que l'accès au kiosque et au panneau admin.
