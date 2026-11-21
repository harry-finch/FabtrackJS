---
id: R-017
titre: "Corriger les bugs métier avérés (warnings, sorbonne, inventory, users, machines, bookstack)"
resume: "Corriger six dysfonctionnements fonctionnels confirmés par l'audit sur les e-mails d'avertissement, filtres, stocks, profils et stats machines."
statut: a-tester
jalon: v1.3
cree: 2026-11-21
maj: 2026-11-21
livree:
---

## But

Corriger les six bugs fonctionnels confirmés par l'audit (`AUD-022`) touchant les alertes d'avertissement, la facturation Sorbonne, la gestion des sorties d'inventaire, les fiches contributeurs, les statistiques/maintenances machines et la vérification de fraîcheur BookStack.

## Inclus

1. **Avertissements (`routes/admin/warnings.js`) :**
   - Passer les paramètres attendus par `mailService.sendWarningAlert` (`warningtype`, `comments`, `staffUsername`) au lieu des anciens noms ignorés (`warningType`, `comment`).
2. **Facturation Sorbonne (`routes/admin/sorbonne.js`, `services/sorbonneService.js`) :**
   - Appliquer `startDate`/`endDate` directement dans `sorbonneService.getSorbonneConsumptions(...)` avant le calcul de `pendingTotalCost`, `settledTotalCost`, `grandTotalCost` et `entitySummary`.
   - Restreindre `sorbonneService.toggleSettled` aux activités de type `CONSUMABLE` uniquement.
3. **Inventaire (`services/inventoryService.js`) :**
   - Honorer `equipmentAction: "KEEP_STATUS"` dans `checkoutEquipment` (enregistrement du mouvement sans écraser le statut courant ni `decommissionedAt`).
   - Déclencher `mailService.sendLowStockAlert` dans `checkoutConsumable` lorsque le stock passe au seuil ou en rupture (`LOW_STOCK` / `OUT_OF_STOCK`).
4. **Fiches contributeurs (`routes/users.js`) :**
   - Gérer `if (!user)` sur `GET /users/edit/:id` avec redirection propre vers `/users/manage` (fin du crash 500).
   - Dédupliquer `userprojects` par `id` (au lieu de `Array.indexOf` par référence objet).
   - Convertir `birthyear` avec un parseur optionnel retournant `null` quand vide/`null`/`undefined` (au lieu de `0` ou `NaN`).
   - Ajouter un repli `/users/manage` à `req.session.lastPage` sur `POST /users/delete/:id`.
5. **Machines (`services/machineUsageService.js`, `routes/admin/machines.js`) :**
   - Ajouter `getMachineUsageStats(machineId)` calculant `totalSessions`, `uniqueUsers` et `lastUsed` par agrégation SQL sans plafond à 100 sessions.
   - Dans `POST /admin/machines/maintenance/create`, ne mettre à jour `machine.lastMaintenance` que si la nouvelle date est plus récente que la date existante (préservation lors d'un ajout antidaté).
6. **BookStack (`services/bookstackService.js`) :**
   - Comparer la fraîcheur de la documentation à la dernière visite de l'usager sur *ce projet précis* (`userproject: { projectId: pId }`) et supprimer le filtre mort `arrival: { not: undefined }`.
7. **Tests & documentation :**
   - Créer `tests/unit/businessBugsR017.test.js` avec un test de non-régression dédié pour chacun des 6 correctifs ; mettre à jour `docs/MISE_A_JOUR_PROD.md` et `STATUS.md`.

## Hors périmètre

- Ajout de nouvelles colonnes SQL ou refonte de l'UI des écrans concernés.

## Décisions

- Les calculs statistiques machine sont portés dans `services/machineUsageService.js` (`getMachineUsageStats`) conformément à la règle métier `AGENTS.md` (logique métier dans `services/`).
- En cas d'alerte stock bas dans `checkoutConsumable`, l'envoi d'e-mail reste non bloquant (`.catch(...)`) pour ne jamais faire échouer la transaction d'inventaire.

## Dépendances

- Dépend de `R-011` (tests unitaires hors-ligne isolés).

## Critères d'acceptation

- Chacun des 6 correctifs dispose d'un test unitaire de non-régression vert dans `tests/unit/businessBugsR017.test.js`.
- `npm run lint` (0 erreur), `npm audit --omit=dev` (0 vulnérabilité) et `DATABASE_URL="" npm run test:unit` (100 % vert).

## Vérifications de l'utilisateur

- Vérifier sur un environnement de test/préprod un ajout d'avertissement (e-mail complet), un filtrage par dates sur Sorbonne, une sortie équipement « conserver le statut » et une maintenance antidatée sur une machine.
