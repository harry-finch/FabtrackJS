---
id: R-014
titre: "Index SQL critiques, sessions MariaDB, cache global et clôture auto des visites"
resume: "Ajouter les index DB, remplacer MemoryStore et le cache par session, et sortir la clôture des visites de GET /fabtrack/."
statut: idee
jalon: v1.2
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** Top 10 (#10) · `AUD-017`, `AUD-019`, `AUD-024` (Opus #8, #13, #16)
- **Fichiers principaux :** `prisma/schema.prisma`, `prisma/schema.sql`, `app.js:101-112,270-363`, `middleware/cacheHelper.js`, nouveaux `services/referenceCacheService.js` et `services/visitAutoCloseService.js`, `routes/fabtrack.js:107-145`, `plugins/rfidPlugin.js:68-105`
- **Périmètre envisagé :**
  - Ajouter les index composites (`History`, `Activity`, `Warning`, `Log`, `MachineIssue`) et synchroniser `prisma/schema.sql`.
  - Remplacer `MemoryStore` par `express-mysql-session` (MariaDB) avec `saveUninitialized: false`.
  - Remplacer le cache par session (`loadCache`) par un `referenceCacheService` global en mémoire avec invalidation globale (corriger les 3 oublis `Projecttype` dans `settings.js`, `repair-cafe.js`, `admin/history.js` et retirer `res.locals.machines`).
  - Externaliser la clôture automatique des visites oubliées dans une tâche planifiée (`updateMany` tous workspaces, heure configurable, `departure = max(arrival, closingTime)`), supprimer `if (oldRecords) history = []` et filtrer `rfidPlugin` sur la journée en cours.
- **Arbitrages & dépendances :** Dépend de `R-009` et `R-011`.
- **Critères d'acceptation visés :** `EXPLAIN` utilise les index ; un changement admin est visible immédiatement sur le kiosque ; les sessions survivent au redémarrage ; les présents du jour restent affichés et aucune durée n'est négative.
