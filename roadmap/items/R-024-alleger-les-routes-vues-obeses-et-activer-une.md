---
id: R-024
titre: "Alléger les routes/vues obèses et activer une CSP stricte sans unsafe-inline"
resume: "Extraire la logique métier vers services/, factoriser les duplications, sortir le JS inline et durcir la Content Security Policy."
statut: idee
jalon: v1.4
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** `AUD-032` (partiel) (Opus #24)
- **Fichiers principaux :** `routes/admin/machines.js` (704 L), `routes/history.js` (700 L), `routes/users.js` (677 L), `routes/admin/ue.js` (513 L), `routes/admin/statistics.js` (500 L), 6 CRUD référentiels, vues > 800 L, `app.js:35-78`
- **Périmètre envisagé :**
  - Extraire la logique métier vers `services/` et factoriser les duplications (restitution équipement, badges atelier, `computeStatus`, prêts actifs, parseur CSV unique, CRUD générique référentiels).
  - Externaliser progressivement le JS inline et les 159 `on*=` vers `public/javascripts/<page>.js` avec délégation d'événements et migrer les 453 `style=` vers CSS.
  - Retirer `'unsafe-inline'` de `scriptSrc` et `scriptSrcAttr` dans Helmet.
- **Arbitrages & dépendances :** Dépend de `R-013` et `R-027`.
- **Critères d'acceptation visés :** Zéro blocage CSP en console navigateur sur tous les écrans ; logique extraite couverte par tests unitaires.
