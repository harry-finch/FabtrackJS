---
id: R-019
titre: "Migrer les schémas vers Zod v4 et généraliser la validation HTTP"
resume: "Rétablir les messages d'erreur français sous Zod v4, activer le stripping contre le mass-assignment et valider paramètres, queries et POST restants."
statut: a-tester
jalon: v1.3
cree: 2026-11-21
maj: 2026-11-22
livree:
---

## But

Sous Zod v4, les options `required_error` et `invalid_type_error` issues de Zod v3 sont ignorées silencieusement, ce qui fait réapparaître des messages techniques anglais aux usagers et au staff. De plus, `middleware/validate.js` fusionnait `req.body` sans retirer les champs inconnus (risque de mass-assignment) et de nombreuses routes `POST`, paramètres `:id` et filtres `req.query` n'étaient pas validés, exposant l'application à des erreurs `NaN` ou des dépassements de taille MariaDB.

## Inclus

- Migration de 100 % des schémas `schemas/*.js` vers la syntaxe Zod v4 (`{ error: "..." }`) avec zéro occurrence résiduelle de `required_error` ou `invalid_type_error`.
- Activation du stripping strict dans `middleware/validate.js` (`req.body = result.data`, `req.params = result.data`, `req.query = result.data`) après déclaration explicite de tous les champs légitimes (`honeypot` dans `registerStaffSchema`, `isExpert` et `termsAccepted` dans `updateUserSchema`, champs étendus des consommables et machines).
- Maintien et vérification de l'alignement `creditSchema` (`> 0`) et `adjustBalanceSchema` (ajustement/débit admin dédié avec motif), ainsi que du branchement de `consumable.schema.js`, `warning.schema.js` et `resetPasswordSchema`.
- Généralisation de `validateParams` (`:id`, `:issueId`, `:maintenanceId`, `:workshopId`, `:userId` entiers positifs) et `validateQuery` (dates, pagination, filtres admin et API).
- Ajout des bornes `.max()` alignées sur les colonnes MariaDB (`VarChar(30|50|100|255)`, `Text`), évaluation dynamique de l'année maximale de naissance dans `user.schema.js`, et couverture Zod de l'ensemble des routeurs `POST` restants.

## Hors périmètre

- Refactorisation de l'architecture des contrôleurs ou séparation des vues obèses (traité dans `R-024`).
- Suppression de l'état global muté par requête ou des instances `PrismaClient` multiples (traité dans `R-020` et `R-022`).
- Modification du schéma de base de données MariaDB/Prisma.

## Dépendances

- `R-007` (alignement rôles, `creditSchema` / `adjustBalanceSchema`).
- `R-011` (suite de tests unitaires isolée et ESLint).

## Critères d'acceptation

- Zéro occurrence de `required_error` ou `invalid_type_error` dans `schemas/*.js` ; les champs manquants ou de mauvais type retournent un message d'erreur en français.
- Tout champ inconnu injecté dans `req.body` (ex. `role: "admin"`, `balance: 9999`) est supprimé par `validateBody` avant d'atteindre le contrôleur, tandis que les champs légitimes (`honeypot`, `isExpert`, `termsAccepted`) sont conservés.
- Les paramètres `:id` non numériques, nuls ou négatifs et les `req.query` invalides (dates malformées, pages négatives) sont rejetés proprement (redirection avec flash ou HTTP `400` JSON) sans erreur 500 `NaN`/`TypeError`.
- L'année maximale de naissance dans `user.schema.js` est évaluée dynamiquement à chaque validation et non figée au démarrage du serveur.
- Tous les routeurs `POST` (admin, kiosque, API, auth) disposent d'une validation Zod adaptée avec bornes `.max()` cohérentes avec MariaDB.
- `npm run lint`, `npm audit --omit=dev`, `DATABASE_URL="" npm run test:unit` et `fabboard roadmap lint` passent sans erreur.

## Vérifications de l'utilisateur

- Tester la soumission d'un formulaire admin (ex. consommable ou usager) avec un champ obligatoire vide ou un `:id` invalide dans l'URL et vérifier l'affichage d'un message d'erreur en français sans crash serveur.
- Vérifier que la mise à jour d'un usager (`/users/edit/:id`) conserve bien les cases `isExpert` et `termsAccepted` et que la création/édition de consommables et machines fonctionne nominalement.
