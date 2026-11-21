---
id: R-022
titre: "Unifier l'accès Prisma (fin du hack require.cache) et nettoyer code mort & socket.io"
resume: "Remplacer les 37 new PrismaClient() par utilities/db, retirer socket.io inutilisé et supprimer les fichiers morts suivis dans Git."
statut: idee
jalon: v1.4
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** `AUD-032` (partiel), `AUD-033` (partiel) (Opus #20, #26, #30)
- **Fichiers principaux :** `utilities/db.js:58-70`, 37 fichiers avec `new PrismaClient()`, `bin/www:11-40`, `package.json`, fichiers morts
- **Périmètre envisagé :**
  - Migrer les 37 fichiers vers `const { prisma } = require(".../utilities/db")` et supprimer le monkey-patch `require.cache`.
  - Retirer `socket.io`, `socket.io-client`, `randomized-string` (et évaluer `node-fetch`/`uuid`/`moment`).
  - Supprimer les fichiers morts suivis dans Git : `utilities/render.js`, `utilities/package.json`, `core/hookLoader.js`, `hooks/testHooks.js`, `public/javascripts/edit-user.js`, `views/includes/language-selector.html`, `views/admin/error.ejs`, `public/stylesheets/style.css`, `scripts/seed-3months-activity.js`, `"Icon\r"`, `uploads/logo-1789385910567-749889170.svg` (+ règle `.gitignore`).
  - Retirer les écritures DB déclenchées au chargement de `loadPlugins()`.
- **Arbitrages & dépendances :** Dépend de `R-011`.
- **Critères d'acceptation visés :** 0 `new PrismaClient` hors `utilities/db.js` ; démarrage sans `socket.io` ; suite complète verte.
