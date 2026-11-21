---
id: R-018
titre: "Garantir la transactionnalité des écritures critiques et historiser Activity.unitCost"
resume: "Encapsuler stock, soldes, emprunts et import CSV dans des transactions Prisma, corriger le 413 import CSV et figer les tarifs consommables."
statut: idee
jalon: v1.3
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** `AUD-021`
- **Fichiers principaux :** `routes/history.js`, `services/inventoryService.js`, `routes/admin/consumables.js:175-234`, `routes/admin/equipment.js:235-323`, `routes/admin/history.js:115-140`, `services/historyImportService.js`, `app.js:81`, `prisma/schema.prisma:192-223`
- **Périmètre envisagé :**
  - Encapsuler dans `prisma.$transaction` avec lecture intra-transaction : `consumeItem` + débit `User.balance` + `activity.create`, `checkoutConsumable`, `/restock`, `history/create`, `equipment/delete`, maintenances, régularisation UE, attribution badges.
  - Vérifier qu'un équipement est `AVAILABLE` et libre (`returnedAt: null`) avant prêt, et vérifier `returnedAt === null` à la restitution ; vérifier l'appartenance de `historyId`/`userprojectId` à l'usager.
  - Corriger la limite JSON `100 Ko` dans `app.js:81` bloquant `/admin/history/execute` (`413`), exécuter l'import CSV en transaction, corriger le lookup unique `Project.url` (crash `P2002`), re-valider les items serveur et corriger les compteurs de doublons.
  - Ajouter `Activity.unitCost Decimal? @db.Decimal(10, 2)` pour figer le prix facturé au moment de la consommation.
- **Arbitrages & dépendances :** Dépend de `R-011`.
- **Critères d'acceptation visés :** Double emprunt simultané bloqué ; import CSV > 200 Ko réussi avec URL déjà existante ; hausse du prix d'un consommable sans effet rétroactif sur les facturations passées.
