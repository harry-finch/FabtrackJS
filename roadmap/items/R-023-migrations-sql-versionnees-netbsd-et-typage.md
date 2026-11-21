---
id: R-023
titre: "Migrations SQL versionnées (NetBSD) et typage strict du schéma Prisma"
resume: "Instaurer un historique de migrations SQL incrémentales compatible NetBSD et typer strictement enums, décimaux et relations d'Activity."
statut: idee
jalon: v1.4
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** `AUD-032` (partiel) (Opus #21, #22)
- **Fichiers principaux :** `prisma/schema.prisma`, `prisma/schema.sql`, nouveau `scripts/migrate.js`, `prisma/migrations_sql/`
- **Périmètre envisagé :**
  - Mettre en place un script pure JS compatible NetBSD pour appliquer les migrations SQL numérotées (`NNN_description.sql`) avec table `_schema_version`.
  - Passer en `enum` les statuts `Equipment.status`, `MachineIssue.status`, `History.repairStatus`, `Staff.role`.
  - Fixer `@db.Decimal(10, 2)` sur `User.balance` et `Consumable.cost`, passer `Log.description` en `Text`.
  - Préparer la transition d'`Activity` polymorphe vers des FK nullables (`machineId`, `consumableId`, `equipmentId`) avec migration sans perte.
- **Arbitrages & dépendances :** Dépend de `R-009` et `R-018`.
- **Critères d'acceptation visés :** Migration ascendante testée sans perte de données sur dump anonymisé ; `prisma/schema.sql` synchronisé.
