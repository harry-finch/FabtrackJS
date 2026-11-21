---
id: R-012
titre: "Protection CSRF, conversion des 31 routes GET mutantes et durcissement Auth"
resume: "Passer les 31+ actions GET mutantes en POST, ajouter un jeton CSRF natif synchronisé en session et durcir sessions, cookies, rate-limiting et révocation staff."
statut: a-tester
jalon: v1.2
cree: 2026-11-21
maj: 2026-11-21
livree:
---

## But

Éliminer les vulnérabilités CSRF (`AUD-009`), convertir l'ensemble des actions d'état exposées en `GET` (33 routes identifiées dont `admin/staff/*`, suppressions admin, `cleardebt`, `exit`, `warning/deactivate`, `logout` et `agreement/:token`) vers `POST`, et durcir l'authentification, les sessions et la révocation des comptes staff (`AUD-013`).

## Inclus

- **Infrastructure centrale (`app.js`, `middleware/`, `services/`, `schemas/`) :**
  - Refuser le démarrage en `NODE_ENV=production` sans `SECRET` non-par-défaut ; rendre `TRUST_PROXY` configurable ; durcir le cookie de session (`sameSite: "lax"`, `secure: isHttpsProduction`, `saveUninitialized: false`).
  - Créer `middleware/csrf.js` (natif synchronisé en session, getter paresseux `res.locals.csrfToken`, `crypto.timingSafeEqual`, support en-tête/corps/query pour `multipart/form-data`, exemption `/api/machines/*` sans session navigateur ou avec clé API) et le monter dans `app.js`.
  - Exposer `<meta name="csrf-token">`, `window.getCsrfToken()` et wrapper `window.fetch` dans `views/includes/pagehead.html` ; injecter automatiquement `_csrf` dans `public/javascripts/main.js`.
  - Créer `services/staffSessionService.js` (micro-cache 30 s + invalidation immédiate depuis `services/staffAdminService.js`) et le brancher dans `middleware/requireRoles.js` et `middleware/checkSession.js`.
  - Porter bcrypt au coût `12` (`routes/index.js`, `services/passwordResetService.js`, `services/setupService.js`) et aligner `registerStaffSchema` à 8 caractères minimum (`schemas/auth.schema.js`).
- **Authentification, charte & routes cœur (`routes/index.js`, `routes/history.js`, `routes/users.js`, `routes/warning.js` + vues) :**
  - Rate-limiting natif (`429` + `Retry-After`) sur `POST /auth`, `POST /reset`, `POST /reset_password`, `POST /create-account`, `POST /report-bug` (en complément de `/report-issue`).
  - Brancher `allow_self_registration` sur `GET /register`, `POST /create-account` et le lien d'inscription de `views/index/login.ejs`.
  - Supprimer le timing oracle sur `POST /auth` (comparaison bcrypt factice) et appeler `req.session.regenerate()`.
  - Convertir `GET /logout` en `POST /logout` + `res.clearCookie("fabtrack.sid")` (`views/includes/header.html`).
  - Transformer `GET /agreement/:token` en écran de confirmation en lecture seule (`views/index/agreement-confirm.ejs`) soumettant `POST /agreement/:token` avec contrôle d'expiration.
  - Convertir en `POST` les 10 autres routes GET mutantes de `history.js`, `users.js` et `warning.js` et leurs vues/modales (`views/fabtrack/index.ejs`, `views/fabtrack/edit-user.ejs`, `views/admin/manage-users.ejs`, `views/admin/view-history.ejs`, `public/javascripts/fabtrack.js`).
- **Routes & vues admin (13 routeurs admin, 21 routes GET → POST + 17 vues EJS) :**
  - Convertir toutes les suppressions et transitions d'état (`admin/staff`, `admin/warnings`, `admin/workshops`, `admin/accesslevels`, `admin/categories`, `admin/consumables`, `admin/equipment`, `admin/locations`, `admin/machines`, `admin/projecttypes`, `admin/usertypes`, `admin/warningtypes`, `admin/workspaces`) en `POST` avec formulaires `<form method="POST">` munis de `_csrf` et préfixe `baseUrl`.
- **Tests & documentation :**
  - Ajouter `tests/unit/csrfAndAuthR012.test.js` ; mettre à jour `tests/unit/rbacMatrix.test.js`, `tests/unit/authAndSubpathR011.test.js`, `tests/unit/validation.test.js`, `tests/helpers/authHelper.js` et les tests d'intégration impactés.
  - Mettre à jour `docs/MISE_A_JOUR_PROD.md` et `STATUS.md`.

## Hors périmètre

- Ajout de bibliothèques externes (`csrf-sync`, `express-rate-limit`, store de sessions externe Redis/MySQL traité dans `R-013`).
- Refonte visuelle des pages d'administration ou invalidation forcée des mots de passe déjà enregistrés en base.

## Décisions

- **Arbitrage 1A :** longueur minimale fixée à **8 caractères** sur les nouveaux comptes et réinitialisations (cohérent avec `R-004`).
- **Arbitrage 2A :** implémentation **100 % native sans nouvelle dépendance npm** (`middleware/csrf.js` + `middleware/rateLimit.js`).
- **Session lazy :** `workspaceSwitcher` et `loadCache` ne mutent `req.session` que si `req.session.loggedin` est actif, pour garantir qu'aucune session n'est créée par les requêtes anonymes ou sondes API avec `saveUninitialized: false`.

## Dépendances

- Dépend de `R-007` (RBAC et `staffAdminService`), `R-008` (`main.js` sous-chemin) et `R-011` (tests isolés & ESLint).

## Vérifications de l'utilisateur

- Confirmer en préproduction/production que la variable `.env` `SECRET` est renseignée avec une valeur forte et que `TRUST_PROXY` / `ENABLE_HTTPS` correspondent au reverse proxy.
- Vérifier dans le navigateur la connexion, la déconnexion (`POST /logout`), une suppression/modification admin, la confirmation de charte (`GET` puis `POST /agreement/:token`) et le rejet `403` si le jeton CSRF est altéré.
