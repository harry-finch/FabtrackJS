---
id: R-014
titre: "Index SQL critiques, sessions MariaDB, cache global et clôture auto des visites"
resume: "Ajouter les index DB, remplacer MemoryStore par un store MariaDB natif Prisma, mutualiser le cache de référence et sortir la clôture auto des visites de GET /fabtrack/."
statut: a-tester
jalon: v1.2
cree: 2026-11-21
maj: 2026-11-21
livree:
---

## But

Améliorer les performances SQL (`AUD-017`), rendre les sessions résilientes aux redémarrages (`AUD-019`), rendre les modifications d'administration immédiatement visibles sur tous les postes kiosque/médiateurs (`AUD-019`) et corriger la clôture automatique des visites oubliées qui effaçait les présents du jour et produisait des durées négatives (`AUD-024`).

## Inclus

- **Schéma Prisma & index SQL critiques (`prisma/schema.prisma`, `prisma/schema.sql`) :**
  - Ajouter les index composites sur `History` (`[workspaceId, departure, arrival]`, `[userId, departure, arrival]`, `[arrival]`), `Activity` (`[resourceType, returnedAt, userId]`, `[resourceType, resourceId, endedAt]`, `[createdAt]`), `Warning` (`[userId, active]`), `Log` (`[timestamp]`) et `MachineIssue` (`[machineId, status, createdAt]`).
  - Ajouter le modèle `Session` (`sid`, `data`, `expiresAt`, `createdAt`, `updatedAt`, `@@index([expiresAt])`) pour la persistance des sessions en MariaDB.
  - Régénérer le client Prisma et resynchroniser `prisma/schema.sql`.
- **Store de sessions persistant MariaDB natif (`services/prismaSessionStore.js`, `app.js`, `bin/www`) :**
  - Implémenter `PrismaSessionStore` (sous-classe de `express-session` `Store`) sur le pool Prisma unique, avec nettoyage périodique des sessions expirées (`unref()` + arrêt gracieux dans `bin/www`), repli automatique sur `MemoryStore` en `NODE_ENV=test` / `SESSION_STORE=memory`, et `saveUninitialized: false`.
- **Cache global de référence (`services/referenceCacheService.js`, `middleware/cacheHelper.js`, `app.js`, `routes/`, `services/`) :**
  - Remplacer le cache dupliqué par session (`req.session.usertypes`, `availableWorkspaces`, etc.) par un cache global en mémoire avec déduplication des chargements concurrents et invalidation globale immédiate.
  - Supprimer `res.locals.machines` inutilisé.
  - Corriger les oublis d'invalidation lors des créations de `Projecttype` (`routes/admin/settings.js`, `services/repairCafeService.js`, `services/workshopService.js`, `services/sorbonneService.js`, `services/historyImportService.js`, `services/setupService.js`, `routes/setup.js`).
- **Clôture automatique des visites oubliées (`services/visitAutoCloseService.js`, `routes/fabtrack.js`, `plugins/rfidPlugin.js`, `bin/www`) :**
  - Externaliser la clôture dans une tâche planifiée (`updateMany` sur tous les workspaces, heure configurable via `visit_auto_close_time` / `VISIT_AUTO_CLOSE_TIME` défaut `18:30`, `departure = max(arrival, closingTime)` pour interdire toute durée négative).
  - Rendre `GET /fabtrack/` strictement lecture seule, filtrer sur la journée en cours et supprimer `if (oldRecords) history = []`.
  - Filtrer la recherche de visite ouverte dans `plugins/rfidPlugin.js` sur la journée en cours (`arrival >= startOfToday`).
- **Tests & documentation :**
  - Créer `tests/unit/perfSessionsAndAutoCloseR014.test.js` ; mettre à jour `docs/MISE_A_JOUR_PROD.md` (avec SQL `CREATE TABLE Session` + `CREATE INDEX` non destructifs et `npx prisma generate`) et `STATUS.md`.

## Hors périmètre

- Ajout de paquets npm externes (`express-mysql-session`, `node-cron`, Redis).
- Refactorisation complète de l'interface kiosque ou pagination serveur de l'historique complet.

## Décisions

- **Arbitrage Option A :** Store de sessions MariaDB **natif via Prisma** (`services/prismaSessionStore.js` + table `Session`) sans nouvelle dépendance npm ni second pool `mysql2`, avec repli automatique `MemoryStore` en `NODE_ENV=test`.
- **Durée non négative :** `departure = max(arrival, closingTime)` calculé sur le jour calendaire de `arrival`, appliqué par lots via `prisma.history.updateMany(..., departure: null)` sur tous les workspaces.

## Dépendances

- Dépend de `R-009` (`prisma/schema.sql` aligné) et `R-011` (tests unitaires hors-ligne isolés).

## Critères d'acceptation

- Index composites présents dans `prisma/schema.prisma` et `prisma/schema.sql`, et table `Session` créée dans le schéma.
- `PrismaSessionStore` persiste, lit, expire, met à jour (`touch`), détruit et purge les sessions via Prisma.
- `invalidateCache()` rend une modification admin immédiatement visible sur tous les postes sans attendre la reconnexion.
- `GET /fabtrack/` n'exécute plus d'écriture DB et affiche toujours les présents du jour même si une visite d'un jour précédent reste ouverte ; aucune durée de clôture auto n'est négative ; `rfidPlugin` ignore les visites ouvertes des jours précédents.
- `npm run lint` (0 erreur), `npm audit --omit=dev` (0 vulnérabilité) et `DATABASE_URL="" npm run test:unit` (100 % vert).

## Vérifications de l'utilisateur

- Appliquer les commandes SQL (`CREATE TABLE Session` + `CREATE INDEX`) et `npx prisma generate` en production selon `docs/MISE_A_JOUR_PROD.md`, puis confirmer que les sessions survivent à un `pm2 restart fabtrack`.
- Modifier un motif de visite / workspace en admin et vérifier sa visibilité immédiate dans une autre session kiosque sans reconnexion.
