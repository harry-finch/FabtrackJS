---
id: R-015
titre: "Corriger les injections transverses et l'exposition de secrets"
resume: "Bloquer la Prototype Pollution i18n, les Open Redirects, les injections CSV et filtrer les secrets hors de res.locals et /api/list/*."
statut: idee
jalon: v1.3
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** `AUD-015`, `AUD-020` (Opus #12 + nouveaux)
- **Fichiers principaux :** `services/i18nService.js:86-114`, `app.js:121`, `routes/api.js:24-45`, `routes/index.js:315-366`, `middleware/validate.js:50-144`, `services/inventoryService.js:276-306`, `routes/admin/sorbonne.js:144-177`, `routes/admin/ue.js:465-508`, `routes/admin/statistics.js:480-495`, `services/bookstackService.js:414-423`, `views/admin/manage-settings.ejs:406`
- **Périmètre envisagé :**
  - Durcir `i18nService.unflattenObject` (`Object.create(null)` + rejet `__proto__`, `constructor`, `prototype`).
  - Centraliser `getSafeRedirectPath` (même origine uniquement) sur toutes les redirections `Referer`.
  - Centraliser `escapeCsvCell` (neutralisation `= + - @ \t \r` + quoting/échappement `"` complet) et assainir `filename` dans `Content-Disposition`.
  - Filtrer `res.locals.settings` via une liste blanche stricte de clés publiques ; passer `api_machine_token`, les clés IA et `bookstack_token_secret` en écriture seule (jamais injectés dans le HTML, `aiConfig` ou `bookstackStats`) ; ajouter des `select` explicites sur `/api/list/all-staff` et `/api/list/all-users`.
- **Arbitrages & dépendances :** Aucune.
- **Critères d'acceptation visés :** Tests unitaires `__proto__`, `Referer` externe et cellule `=1+1` ; aucun secret ni hash bcrypt présent dans le HTML ou `/api/list/*`.
