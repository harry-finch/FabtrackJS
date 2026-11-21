---
id: R-009
titre: "Réparer le bootstrap /setup et resynchroniser prisma/schema.sql"
resume: "Importer setupService dans app.js, corriger la création des espaces de travail au setup et réaligner schema.sql avec v1.0."
statut: idee
jalon: v1.1
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** Top 10 (#6) · `AUD-005`, `AUD-018` (Opus #3 + nouveaux)
- **Fichiers principaux :** `app.js:17-20,155-171`, `routes/setup.js`, `services/setupService.js`, `schemas/setup.schema.js`, `views/setup/index.ejs`, `prisma/schema.sql`
- **Périmètre envisagé :**
  - Importer `setupService` dans `app.js`.
  - Rendre `setupService.checkIsInstalled()` fail-closed sur erreur DB transitoire et revérifier l'état d'installation à l'intérieur de la transaction `runSetup()` (refus d'écraser un compte existant si déjà installé).
  - Corriger `routes/setup.js:57` (`req.session.username = result.admin.name`, `req.session.regenerate()`, `lastWorkspaceId`).
  - Parser le JSON `workspaces` dans `setup.schema.js` et `setupService.js` (et échapper les tags dans `views/setup/index.ejs:346,478` + `action` sous-chemin).
  - Régénérer `prisma/schema.sql` via `prisma migrate diff` pour inclure les 7 colonnes v1.0 d'`Activity` et intégrer les colonnes d'`Equipment` dans le `CREATE TABLE`.
- **Arbitrages & dépendances :** Aucune.
- **Critères d'acceptation visés :** L'import de `schema.sql` sur une base vierge suivi du wizard `/setup` crée des espaces de travail propres, connecte l'admin avec `req.session.username` défini, puis renvoie `403` sur tout nouvel appel `POST /setup`.
