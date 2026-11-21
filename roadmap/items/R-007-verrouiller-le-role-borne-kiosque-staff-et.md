---
id: R-007
titre: "Verrouiller le rôle borne kiosque (staff) et corriger le RBAC médiateurs"
resume: "Empêcher la borne kiosque (staff) d'exécuter des actions financières ou destructives et rétablir les habilitations pour les médiateurs (user)."
statut: a-tester
jalon: v1.1
cree: 2026-11-21
maj: 2026-11-21
livree:
---

## But

Appliquer une séparation stricte des privilèges (RBAC) entre les **administrateurs (`admin`)**, les **médiateurs (`user`)** et les **bornes kiosques (`staff`)** afin d'empêcher un compte borne kiosque d'exécuter des actions financières, de modération ou destructives, tout en rétablissant les droits légitimes des médiateurs et en sécurisant les opérations de solde et la gestion des comptes staff.

## Inclus

- **Middleware RBAC déclaratif (`middleware/requireRoles.js`, `checkSession.js`, `checkAdmin.js`) :**
  - Nouveau middleware `requireRoles(...roles)` et helper `isApiOrAjaxRequest` renvoyant HTTP `401` / `403` JSON sur `/api/*`, `req.xhr` ou `Accept: application/json`, et redirection flash en navigation HTML.
  - Stockage de `req.session.staffId` lors de l'authentification (`POST /auth`).
- **Verrouillage de la borne kiosque (`staff`) et rétablissement des médiateurs (`user`) :**
  - Actions réservées strictement aux **`admin`** : `GET /history/delete/:id`, `POST /history/update`, `POST /history/balance-adjust`, `GET /warning/deactivate/:id`, `POST /admin/inventory/checkout` sur `EQUIPMENT`, `admin/staff/*` et routes d'administration existantes (`isAdmin`).
  - Actions ouvertes aux **`admin` + `user`** (bloquées pour `staff`) : `history/update-comment`, `history/cleardebt/:id`, `history/credit`, `history/project/(un)archive`, `history/activity`, `history/equipment/return/:id`, `admin/inventory/items`, `admin/inventory/checkout` sur `CONSUMABLE`, `admin/machines/*` (consultation + `issues/:id/status` + `maintenance/create`), `users/create`, `users/edit/:id`, `users/update/:id`, `users/resend/:id`, `users/:id/workshop-interest/*`, `users/:id/workshop-badge/(award|revoke)` (correction du bug `"mediateur"` → `"user"` dans `routes/users.js`), `warning/create`.
  - Actions maintenues pour la borne kiosque (`admin`, `user`, `staff`) : `POST /history/create`, `GET /history/exit/:id`, `POST /history/exit-repair`.
- **Sécurité financière (`services/balanceService.js`, `schemas/history.schema.js`) :**
  - `POST /history/credit` accepte uniquement un montant strictement positif (`money > 0`).
  - Ajout d'une action séparée `POST /history/balance-adjust` (modale « Ajuster » réservée aux `admin`) avec débit/crédit et motif obligatoire journalisé.
  - `GET /history/cleardebt/:id` n'opère que sur un solde strictement négatif (`balance < 0`), refuse d'effacer un solde positif ou nul, et journalise toute modification de solde.
- **Administration staff (`services/staffAdminService.js`, `schemas/staff.schema.js`, `routes/admin/staff.js`) :**
  - Liste blanche de rôles `["admin", "user", "staff"]` validée par Zod (`updateStaffSchema`).
  - Interdiction de s'auto-supprimer / s'auto-rétrograder / s'auto-désactiver et protection du dernier administrateur actif (`role === "admin" && approved === true`).
- **Cohérence des vues EJS (`views/fabtrack/edit-user.ejs`, `views/fabtrack/index.ejs`, `views/includes/header.html`, `views/includes/inventory-checkout-modal.html`, `views/admin/manage-staff.ejs`)** et matrice de tests Supertest à 3 profils (`tests/unit/rbacMatrix.test.js`).

## Hors périmètre

- Conversion globale des liens `GET` mutatifs restants et ajout des jetons CSRF synchronisés (traités dans `R-010`).
- Re-vérification dynamique en base du rôle/approbation à chaque requête HTTP dans `checkAdmin` / `requireRoles` (traitée dans l'évolution sessions/auth).
- Audit/durcissement de l'API `/api/list/*` hors RBAC existant (traité dans `R-008`).

## Dépendances

- Aucune dépendance bloquante ni migration SQL.

## Critères d'acceptation

- Un compte `staff` (borne kiosque) est refusé sur toutes les actions financières, administratives, de modération, d'édition usager, de maintenance/incident machine et de sortie d'inventaire, tout en conservant le check-in/check-out kiosque (`/history/create`, `/history/exit/:id`, `/history/exit-repair`).
- Un compte `user` (médiateur) peut attribuer/révoquer les badges d'ateliers (`/users/:id/workshop-badge/(award|revoke)`), gérer les intérêts atelier, déclarer une maintenance/statut d'incident machine, sortir un consommable (`CONSUMABLE`), encaisser une dette négative (`cleardebt` si `balance < 0`) ou créditer un compte (`credit > 0`), mais reste bloqué sur `history/delete`, `history/update`, `history/balance-adjust`, `warning/deactivate` et sortie `EQUIPMENT`.
- `cleardebt` ne remet jamais à zéro un solde `>= 0` et `credit` rejette tout montant `<= 0`.
- `admin/staff/*` rejette tout rôle hors `["admin", "user", "staff"]` ainsi que l'auto-suppression/auto-rétrogradation et la perte du dernier administrateur actif.
- La suite unitaire complète `npx jest tests/unit/ --runInBand --forceExit`, incluant la matrice Supertest à 3 profils (`admin`, `user`, `staff`), passe à 100 %.

## Vérifications de l'utilisateur

- Tester la matrice RBAC (admin, médiateur, borne kiosque) en local sur le kiosque, les fiches usagers, les avertissements, les machines et les sorties d'inventaire.
- Vérifier les comptes Staff et rôles après déploiement R-007 en production dans Administration > Staff.

