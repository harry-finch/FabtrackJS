---
id: R-008
titre: "Corriger le bug confirm() dans main.js, sécuriser simpleLogger et SMTP_PORT"
resume: "Empêcher les suppressions accidentelles en sous-chemin, les crashs serveur sur promesses rejetées et la collision PORT/SMTP."
statut: a-tester
jalon: v1.1
cree: 2026-11-21
maj: 2026-11-21
livree:
---

## But

Éliminer trois causes majeures d'incidents en production : les navigations/suppressions accidentelles lors d'un clic sur « Annuler » d'un `confirm()` en déploiement sous-chemin (`main.js`), les crashs Node.js provoqués par des promesses rejetées non interceptées (`simpleLogger.logThat`, routes `async` sans `asyncHandler`, absence d'arrêt gracieux dans `bin/www`), et la collision entre le port HTTP `PORT` et le port SMTP `SMTP_PORT`.

## Inclus

- **Client (`public/javascripts/main.js`) :**
  - Dans le listener global `click`, sortir immédiatement si `e.defaultPrevented`, si un modificateur est actif ou si ce n'est pas un clic gauche principal (`e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey`), et sécuriser `e.target.closest`.
  - Dans le listener global `submit`, sortir immédiatement si `e.defaultPrevented` afin de ne pas bloquer le formulaire ou lancer la barre de progression lorsque `onsubmit="return confirm(...)"` est annulé.
- **Journalisation & gestion de connexions (`utilities/simpleLogger.js`, `utilities/db.js`, `bin/www`) :**
  - Tronquer les messages stockés dans `Log.description` à **255 caractères** maximum et encapsuler `prisma.log.create` dans un `try/catch` (aucune `UnhandledPromiseRejection`), tout en utilisant le singleton `utilities/db` et en exposant `createLogger` pour tests isolés.
  - Exporter `closePool()` dans `utilities/db.js` pour fermer proprement le pool MariaDB.
  - Implémenter dans `bin/www` un arrêt gracieux idempotent sur `SIGTERM`/`SIGINT` (`io.close`, `server.close`, `prisma.$disconnect`, `closePool()`, timer de secours 10 s `.unref()`) et journaliser `unhandledRejection` / `uncaughtException`.
- **Routes `async` protégées (`routes/api.js`, `routes/index.js`) :**
  - Envelopper dans `asyncHandler` les 6 routes `async` `/api/list/*` (`all-staff`, `all-usertypes`, `all-users`, `all-history`, `users-inlab`, `all-projects`) et `GET /logout`.
- **Séparation `PORT` vs `SMTP_PORT` (`services/settingsService.js`, `services/mailService.js`) :**
  - Remplacer `process.env.PORT` par `process.env.SMTP_PORT` (repli `"587"` / `587`) pour éviter que `PORT=8080` ne corrompe le port SMTP.
- **Tests unitaires (`tests/unit/stabilityR008.test.js`)** couvrant `main.js`, `simpleLogger`, `SMTP_PORT` et la propagation d'erreur `asyncHandler`.

## Hors périmètre

- Remplacement global des boîtes `confirm()` natives par des modales Bootstrap (traité en `v1.5`).
- Refonte des logs structurés JSON / Pino (traité dans un jalon ultérieur).
- Durcissement PII de `/api/list/*` (traité dans un élément dédié).

## Dépendances

- Aucune migration SQL ni dépendance npm supplémentaire.

## Critères d'acceptation

- Cliquer « Annuler » sur un lien `onclick="return confirm(...)"` ou un formulaire `onsubmit="return confirm(...)"` en sous-chemin n'appelle jamais `window.location.assign` et ne verrouille pas le bouton de soumission ; les clics modifiés (`Ctrl`/`Cmd`/`Shift`/`Alt`/clic molette) sont ignorés.
- `simpleLogger.logThat` tronque tout message > 255 caractères et ne rejette jamais sa promesse même si Prisma échoue.
- Avec `PORT=8080` et sans `SMTP_PORT`, `settingsService` et `mailService.getTransporter()` utilisent le port `587` (et `SMTP_PORT` s'il est défini).
- Les 6 routes `/api/list/*` et `GET /logout` transmettent toute erreur asynchrone au middleware d'erreur Express via `asyncHandler`.
- `bin/www` gère `SIGTERM`/`SIGINT` et `unhandledRejection` proprement.
- La suite unitaire complète `npx jest tests/unit/ --runInBand --forceExit` passe à 100 %.

## Vérifications de l'utilisateur

- Tester en local (et en sous-chemin si configuré) le clic sur « Annuler » d'un dialogue `confirm()` (ex. suppression sur une page admin) et vérifier qu'aucune navigation ni suppression n'a lieu.
- Vérifier avant déploiement `R-008` en production que le port SMTP est bien défini via `SMTP_PORT` dans `.env` ou dans Administration > E-mails (et non via `PORT`).

