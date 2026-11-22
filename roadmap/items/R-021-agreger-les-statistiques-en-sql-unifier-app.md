---
id: R-021
titre: "Agréger les statistiques en SQL, unifier APP_TIMEZONE et paginer côté serveur"
resume: "Migrer les calculs statistiques de JS vers SQL, corriger le fuseau horaire, paginer historique/usagers et remplacer le dump autocomplete kiosque."
statut: a-tester
jalon: v1.4
cree: 2026-11-21
maj: 2026-11-22
livree:
---

## But

Lorsque l'historique atteint plusieurs dizaines de milliers de visites et plusieurs milliers d'usagers, le chargement complet en mémoire Node.js dans `/admin/statistics`, `/admin/view-history`, `/users/manage` et `/api/list/autocomplete-lists` provoque des pics mémoire, des lenteurs visibles et des écarts de bornes de dates entre UTC et heure locale (`Europe/Paris`). De plus, `bookstackService` effectuait des appels HTTP séquentiels sans timeout ni limite de cache.

## Inclus

- Création de `utilities/timezoneHelper.js` basé sur `APP_TIMEZONE` (défaut `Europe/Paris`), appliqué uniformément sur les bornes de dates (`statistics`, `sorbonne`, `ue`, `visitAutoCloseService`), incluant le calcul exact de l'année-semaine ISO (passage 31 décembre) et le comptage borné des occurrences de jours de la semaine.
- Migration des calculs de `/admin/statistics` vers `services/statisticsService.js` par agrégations SQL paramétrées exécutées en parallèle (`Promise.all`) avec cache TTL de 5 minutes.
- Pagination côté serveur (filtres, recherche, `take`/`skip`, compteurs SQL) sur `/admin/view-history` et `/users/manage` (avec filtre `deletedAt: null`).
- Création de `GET /api/users/search?q=` (limite 20, `deletedAt: null`) consommé avec debounce + `AbortController` côté kiosque (`public/javascripts/fabtrack.js`), en supprimant le dump complet des usagers au chargement initial tout en gardant `/api/list/autocomplete-lists` borné et rétrocompatible.
- Concurrence bornée (5 requêtes max en parallèle), timeout `AbortController` (5 s) et cache LRU borné (500 entrées max, TTL 5 min) dans `services/bookstackService.js`.

## Hors périmètre

- Unification globale des instances `PrismaClient` (traité dans `R-022`).
- Refonte visuelle complète du kiosque ou des tableaux admin (traité dans `R-032` / `R-033`).

## Dépendances

- `R-014` (index SQL composites sur `History`, `Activity`, `User`).

## Critères d'acceptation

- `statisticsService` agrège les KPI et graphiques en SQL sans charger l'ensemble de la table `History` ni `Activity` en RAM, avec cache 5 min et clé de semaine ISO exacte au passage du 31 décembre (ex. `2024-12-31` → `2025-W01`).
- Les bornes de dates CET (`+01:00`) et CEST (`+02:00`) calculées par `timezoneHelper` sont cohérentes entre `statistics`, `sorbonne`, `ue` et `visitAutoCloseService`.
- `/admin/view-history` et `/users/manage` paginent en SQL (`take`/`skip`), excluent les usagers archivés (`deletedAt: null`) et conservent filtres et recherche.
- `GET /api/users/search?q=` retourne au maximum 20 usagers actifs avec champs minimaux (`id`, `fullname`, `termsAccepted`, `projects`) et `public/javascripts/fabtrack.js` l'utilise avec debounce sans charger tous les usagers au démarrage.
- `bookstackService` applique un timeout de 5 s, une concurrence bornée à 5 requêtes simultanées et un cache LRU borné.
- `npm run lint`, `npm audit --omit=dev`, `DATABASE_URL="" npm run test:unit` et `fabboard roadmap lint` passent sans erreur.

## Vérifications de l'utilisateur

- Ouvrir `/admin/statistics` sur plusieurs périodes (`this_month`, `this_year`, `all`) et vérifier l'affichage des KPI, graphiques et l'export CSV.
- Tester la pagination et la recherche sur `/admin/view-history` et `/users/manage`, ainsi que l'autocomplétion usager au kiosque (`/fabtrack`) en saisissant un début de nom.
