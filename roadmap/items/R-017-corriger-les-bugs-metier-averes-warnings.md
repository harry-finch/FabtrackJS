---
id: R-017
titre: "Corriger les bugs métier avérés (warnings, sorbonne, inventory, users, machines, bookstack)"
resume: "Corriger six dysfonctionnements fonctionnels confirmés par l'audit sur les e-mails d'avertissement, filtres, stocks, profils et stats machines."
statut: idee
jalon: v1.3
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** `AUD-022`
- **Fichiers principaux :** `routes/admin/warnings.js:152-157`, `routes/admin/sorbonne.js:36-57`, `services/sorbonneService.js:122-287`, `services/inventoryService.js:25-126`, `routes/users.js:77-220`, `routes/admin/machines.js:205-215,414-419`, `services/bookstackService.js:251-257`
- **Périmètre envisagé :**
  - Corriger les noms de paramètres passés à `mailService.sendWarningAlert` (`warningtype`, `comments`, `staffUsername`) dans `warnings.js:152`.
  - Appliquer `startDate`/`endDate` aux KPI Sorbonne et restreindre `toggleSettled` aux activités `CONSUMABLE`.
  - Honorer `equipmentAction: "KEEP_STATUS"` et déclencher `sendLowStockAlert` dans `checkoutConsumable`.
  - Gérer `if (!user)` sur `GET /users/edit/:id`, dédupliquer `userprojects` par `id`, corriger `Number(birthyear)` quand `null`/`undefined`, ajouter un fallback à `req.session.lastPage`.
  - Calculer `usageStats` machine par agrégation SQL (fin du plafond à 100) et préserver la date de maintenance la plus récente lors de l'ajout d'une maintenance antidatée.
  - Comparer la fraîcheur BookStack à la dernière visite de l'usager sur *ce* projet (et retirer le filtre mort `arrival: { not: undefined }`).
- **Arbitrages & dépendances :** Dépend de `R-011`.
- **Critères d'acceptation visés :** Un test de non-régression vert pour chacun des six correctifs.
