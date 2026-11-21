---
id: R-012
titre: "Protection CSRF, conversion des 31 routes GET mutantes et durcissement Auth"
resume: "Passer les 31 actions GET mutantes en POST, ajouter un jeton CSRF et durcir sessions, cookies, rate-limiting et révocation staff."
statut: idee
jalon: v1.2
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** Top 10 (#9a) · `AUD-009`, `AUD-013` (Opus #6, #7 + `allow_self_registration`)
- **Fichiers principaux :** `app.js:98-113`, `routes/index.js`, `middleware/checkAdmin.js`, `middleware/checkSession.js`, routeurs des 31 routes GET mutantes et vues `views/admin/*.ejs` / `views/fabtrack/*.ejs`
- **Périmètre envisagé :**
  - Convertir les 31 routes GET mutantes en `POST` (dont `admin/staff/promote`, `delete`, `cleardebt`, `exit`, `warning/deactivate`, `logout`, et `agreement/:token` avec écran de confirmation `POST` + expiration).
  - Mettre en place un jeton CSRF synchronisé en session (`csrf-sync` ou natif via `res.locals.csrfToken` et en-tête `fetch`).
  - Ajouter `express-rate-limit` sur `/auth`, `/reset`, `/create-account`, `/report-bug`, `/report-issue`.
  - Refuser de démarrer en production sans `SECRET`, poser `sameSite: "lax"`, `secure: isHttpsProduction`, `saveUninitialized: false`, `req.session.regenerate()` au login, `clearCookie("fabtrack.sid")` au logout et `TRUST_PROXY` configurable.
  - Stocker `staffId` en session et revérifier `role` et `approved` en DB (avec micro-cache 30–60 s).
  - Brancher effectivement `allow_self_registration`, porter bcrypt à coût 12, imposer 10–12 caractères minimum et supprimer le timing oracle sur `/auth`.
- **Arbitrages & dépendances :** Dépend de `R-007` (RBAC), `R-008` (`main.js`), `R-011` (tests isolés).
- **Critères d'acceptation visés :** 0 route GET mutante ; `403` sur POST sans CSRF ; `429` sur brute-force ; perte d'accès rapide après révocation d'un compte staff.
