---
id: R-023
titre: "Migrations SQL versionnées (NetBSD) et typage strict du schéma Prisma"
resume: "Instaurer un historique de migrations SQL incrémentales compatible NetBSD et typer strictement enums, décimaux et relations d'Activity."
statut: a-tester
jalon: v1.4
cree: 2026-11-21
maj: 2026-11-22
livree:
---

## But

Jusqu'ici, les évolutions de schéma MariaDB étaient appliquées manuellement via des commandes SQL documentées dans `docs/MISE_A_JOUR_PROD.md`, sans suivi versionné ni compatibilité outillée avec NetBSD (où le moteur binaire `prisma migrate` n'est pas disponible). Par ailleurs, plusieurs colonnes critiques restaient faiblement typées (`VarChar` au lieu d'`enum`, `Decimal` sans précision explicite, `Log.description` limité à 255 caractères, et `Activity` polymorphe sans clés étrangères typées).

## Inclus

- Création d'un outil pure JS compatible NetBSD (`scripts/migrate.js`, commande `npm run db:migrate`) qui applique séquentiellement les migrations numérotées de `prisma/migrations_sql/NNN_description.sql` avec suivi d'état et empreinte SHA-256 dans la table `_schema_version` (`--status`, `--dry-run`, `--baseline`).
- Constitution de l'historique SQL versionné (`001` à `004`) couvrant les évolutions `R-004`, `R-014`, `R-018` et `R-023` de manière idempotente et sans perte de données.
- Typage strict dans `prisma/schema.prisma` (et resynchronisation de `prisma/schema.sql`) :
  - Enums Prisma/MariaDB : `StaffRole` (`admin`, `user`, `staff`), `EquipmentStatus` (`AVAILABLE`, `OUT_OF_SERVICE`, `DECOMMISSIONED`), `MachineIssueStatus` (`OPEN`, `RESOLVED`), `RepairStatus` (`PENDING`, `REPAIRED`, `PARTIALLY_REPAIRED`, `NOT_REPAIRED`, `NEEDS_RETURN`).
  - Précision explicite `@db.Decimal(10, 2)` sur `User.balance` et `Consumable.cost`, et passage de `Log.description` à `@db.Text`.
  - Ajout des clés étrangères typées nullables sur `Activity` (`machineId`, `consumableId`, `equipmentId`, `ON DELETE SET NULL`) avec backfill SQL non destructif depuis `(resourceType, resourceId)` et double écriture dans les créations d'activités (`routes/history.js`, `services/machineUsageService.js`).

## Hors périmètre

- Suppression définitive des colonnes historiques `Activity.resourceType` / `Activity.resourceId` (conservées pour rétrocompatibilité le temps de la transition complète).
- Refonte des contrôleurs/vues et CSP stricte (traité dans `R-024`).

## Dépendances

- `R-009` (`prisma/schema.sql` synchronisé).
- `R-018` (`Activity.unitCost`).

## Critères d'acceptation

- `scripts/migrate.js` découvre les fichiers `NNN_*.sql` dans l'ordre, vérifie les checksums SHA-256, découpe proprement les instructions SQL, supporte `--status` / `--dry-run` / `--baseline`, et enregistre les versions dans `_schema_version` sans aucun binaire Rust/Prisma.
- `npx prisma validate` et `npx prisma generate` réussissent, et `prisma/schema.sql` est strictement synchronisé avec `prisma/schema.prisma`.
- Les nouvelles activités créées renseignent à la fois `(resourceType, resourceId)` et la FK typée (`machineId` / `consumableId` / `equipmentId`).
- `npm run lint`, `npm audit --omit=dev`, `DATABASE_URL="" npm run test:unit` et `fabboard roadmap lint` passent sans erreur.

## Vérifications de l'utilisateur

- Tester `npm run db:migrate -- --status` puis `npm run db:migrate -- --dry-run` sur une copie anonymisée de la base MariaDB (y compris NetBSD), puis exécuter `npm run db:migrate` et vérifier l'absence de perte de données ainsi que le remplissage des colonnes `machineId`/`consumableId`/`equipmentId` dans `Activity`.
