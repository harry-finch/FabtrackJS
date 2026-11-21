---
id: R-018
titre: "Garantir la transactionnalité des écritures critiques et historiser Activity.unitCost"
resume: "Encapsuler stock, soldes, emprunts et import CSV dans des transactions Prisma, corriger le 413 import CSV et figer les tarifs consommables."
statut: a-tester
jalon: v1.3
cree: 2026-11-21
maj: 2026-11-22
livree:
---

## But

Garantir l'atomicité et l'intégrité des écritures critiques en base MariaDB (`AUD-021`) en encapsulant les opérations sensibles dans `prisma.$transaction`, bloquer les doubles emprunts et conflits d'appartenance, lever la limite JSON `100 Ko` cassant l'import CSV (`413`), corriger le crash `P2002` sur `Project.url` et figer le coût unitaire des consommables au moment de la consommation via `Activity.unitCost`.

## Inclus

- **Historisation tarifaire (`prisma/schema.prisma`, `prisma/schema.sql`, facturation) :**
  - Ajouter `unitCost Decimal? @db.Decimal(10, 2)` sur `model Activity`, régénérer le client Prisma et resynchroniser `prisma/schema.sql`.
  - Enregistrer `unitCost` lors de toute consommation dans `POST /history/activity`.
  - Exploiter `act.unitCost ?? consumable.cost` dans `services/sorbonneService.js`, `routes/admin/ue.js`, `routes/admin/project-consumption.js`, `routes/admin/statistics.js` et `routes/users.js` afin qu'une hausse ultérieure du tarif consommable n'altère jamais les facturations passées.
- **Transactions Prisma & garde-fous d'intégrité :**
  - `routes/history.js` : encapsuler `POST /history/create` (vérification `alreadyHere`, résolution unique `Project.url`, contrôle d'appartenance `userprojectId`) et `POST /history/activity` (contrôle d'appartenance `historyId` à `userId`, vérification équipement `AVAILABLE` et non déjà emprunté `returnedAt: null`, décrément atomique stock + solde + création `Activity` avec `unitCost`) dans `prisma.$transaction`.
  - Restitution d'équipement (`POST /history/equipment/return/:id` et `POST /admin/equipment/return/:id`) : mise à jour atomique conditionnelle `returnedAt: null` bloquant la double restitution.
  - `services/inventoryService.js` (`checkoutConsumable`, `checkoutEquipment`), `routes/admin/consumables.js` (`POST /restock`), `routes/admin/equipment.js` (`POST /delete/:id`), `routes/admin/machines.js` (`POST /maintenance/create`), `routes/admin/ue.js` (`POST /regularize`) et `services/workshopService.js` (`awardWorkshopBadge`) : lecture intra-transaction dans `prisma.$transaction`.
- **Import CSV d'historique (`app.js`, `services/historyImportService.js`) :**
  - Ne plus appliquer la limite `express.json()` globale (`100 Ko`) à `POST /admin/history/execute` afin que son parseur `15mb` fonctionne sans `413 Payload Too Large` (> 200 Ko).
  - Exécuter `historyImportService.executeImport` dans une transaction Prisma, re-valider chaque ligne côté serveur, résoudre `Project` par sa clé unique `url` (`findUnique`, éliminant le crash `P2002`) et corriger les compteurs d'usagers créés/existants sans sur-comptage intra-lot.
- **Tests & documentation :**
  - Créer `tests/unit/transactionsAndUnitCostR018.test.js` ; mettre à jour `docs/MISE_A_JOUR_PROD.md` (`ALTER TABLE Activity ADD COLUMN unitCost DECIMAL(10, 2) NULL;` + `npx prisma generate`) et `STATUS.md`.

## Hors périmètre

- Rétro-peuplement SQL de `Activity.unitCost` sur les lignes historiques existantes (les lignes `NULL` continuent d'utiliser `consumable.cost` en repli transparent).
- Verrouillage pessimiste `SELECT ... FOR UPDATE` en SQL brut.

## Décisions

- **Rétrocompatibilité `Activity.unitCost` :** la colonne est `NULL` par défaut afin qu'aucune donnée historique ne soit cassée ; toute nouvelle consommation fige `Number(consumable.cost)` et toutes les vues de facturation lisent `act.unitCost !== null && act.unitCost !== undefined ? Number(act.unitCost) : Number(consumable.cost)`.
- **Limite JSON globale vs import CSV :** `app.js` configure `express.json({ limit: "1mb" })` par défaut tout en laissant `/admin/history/execute` utiliser son propre `express.json({ limit: "15mb" })`.

## Dépendances

- Dépend de `R-011` (tests unitaires hors-ligne isolés).

## Critères d'acceptation

- Un double emprunt d'équipement déjà sorti (`returnedAt: null`) ou indisponible (`status !== "AVAILABLE"`) est bloqué dans la transaction ; une double restitution est bloquée.
- Un import CSV JSON > 200 Ko sur `/admin/history/execute` n'est plus rejeté en `413`, re-valide les items côté serveur et gère une URL de projet existante sous un autre `projecttypeId` sans crash `P2002`.
- Une hausse ultérieure de `consumable.cost` ne modifie pas le coût facturé des activités possédant `Activity.unitCost`.
- `npm run lint` (0 erreur), `npm audit --omit=dev` (0 vulnérabilité) et `DATABASE_URL="" npm run test:unit` (100 % vert).

## Vérifications de l'utilisateur

- Appliquer en production `ALTER TABLE Activity ADD COLUMN unitCost DECIMAL(10, 2) NULL;` et `npx prisma generate` (voir `docs/MISE_A_JOUR_PROD.md`).
- Tester un emprunt d'équipement déjà emprunté (refusé), un import CSV volumineux et une consommation suivie d'une modification du prix du consommable (montant passé inchangé).
