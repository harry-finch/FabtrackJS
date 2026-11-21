---
id: R-019
titre: "Migrer les schémas vers Zod v4 et généraliser la validation HTTP"
resume: "Rétablir les messages d'erreur français sous Zod v4, activer le stripping contre le mass-assignment et valider paramètres, queries et POST restants."
statut: idee
jalon: v1.3
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** `AUD-027`
- **Fichiers principaux :** `middleware/validate.js`, `schemas/*.js`, 19 routeurs POST sans `validateBody`
- **Périmètre envisagé :**
  - Remplacer `required_error`/`invalid_type_error` (Zod v3) par `error` (Zod v4) sur tous les schémas.
  - Passer `req.body = result.data` dans `validate.js` (après ajout explicite de `honeypot` dans `registerStaffSchema` et des champs légitimes de `updateUserSchema` selon les rôles).
  - Aligner `creditSchema` avec l'arbitrage #2 (`> 0` + schéma dédié pour ajustement/débit admin).
  - Brancher `consumable.schema.js`, `warning.schema.js`, `resetPasswordSchema`, `validateParams` (`:id` positif) et `validateQuery` (dates, pagination).
  - Ajouter les bornes `.max()` alignées sur MariaDB, rendre dynamique l'année maximale dans `user.schema.js` et couvrir les 19 routeurs POST restants.
- **Arbitrages & dépendances :** Dépend de `R-007` et `R-011`.
- **Critères d'acceptation visés :** Messages d'erreur Zod en français ; champs inconnus supprimés de `req.body` ; zéro erreur 500 `NaN`/`TypeError` sur entrées invalides.
