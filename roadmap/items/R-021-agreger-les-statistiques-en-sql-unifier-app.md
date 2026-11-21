---
id: R-021
titre: "Agréger les statistiques en SQL, unifier APP_TIMEZONE et paginer côté serveur"
resume: "Migrer les calculs statistiques de JS vers SQL, corriger le fuseau horaire, paginer historique/usagers et remplacer le dump autocomplete kiosque."
statut: idee
jalon: v1.4
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** `AUD-025`, `AUD-026` (Opus #14, #15)
- **Fichiers principaux :** `routes/admin/statistics.js`, `routes/admin/index.js:40-66`, `routes/users.js:35-49`, `routes/api.js:83-158`, `services/bookstackService.js:352-376`
- **Périmètre envisagé :**
  - Migrer les calculs de `statistics.js` vers SQL (`groupBy`/`_count`/`_sum`/`$queryRaw` paramétré) avec `Promise.all` et cache 5 min ; corriger la clé semaine ISO (`L266`) et borner `curDay <= endDay`.
  - Introduire `APP_TIMEZONE` (`Europe/Paris`) appliqué uniformément sur les bornes de dates (`statistics`, `sorbonne`, `ue`, `visitAutoCloseService`).
  - Paginer côté serveur `/admin/view-history` et `/users/manage` (avec filtre `deletedAt: null`) et remplacer `/api/list/autocomplete-lists` par `GET /api/users/search?q=` (limite 20, debounce).
  - Borner la concurrence + ajouter timeout `AbortController` (5 s) + cache LRU dans `bookstackService`.
- **Arbitrages & dépendances :** Dépend de `R-014`.
- **Critères d'acceptation visés :** Stats sur 50k visites < 200 ms ; payload autocomplete < 50 Ko ; tests timezone CET/CEST et passage 31 décembre verts.
