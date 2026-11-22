---
id: R-026
titre: "Unifier les assets front en local pour un fonctionnement hors-ligne fiable"
resume: "Servir une version unique de Bootstrap et Chart.js depuis node_modules, retirer @docsearch/css et alléger le GIF 404 de 4,6 Mo."
statut: a-tester
jalon: v1.5
cree: 2026-11-21
maj: 2026-11-22
livree:
---

## But

FabtrackJS dépendait encore de CDN externes (`cdn.jsdelivr.net`) avec des versions divergentes de Bootstrap (`5.3.2` CSS vs `5.3.3` JS), une version non épinglée de Chart.js, une feuille `@docsearch/css@3` inutilisée et un GIF 404 de 4,6 Mo, empêchant un fonctionnement fiable en réseau local/hors-ligne et alourdissant les réponses.

## Inclus

- Exposition locale depuis `node_modules` dans `app.js` des assets `/vendor/bootstrap` (`bootstrap` unique déjà installé) et `/vendor/chartjs` (`chart.js` épinglé dans `package.json`), aux côtés de `/vendor/fontawesome`.
- Remplacement de 100 % des liens CDN Bootstrap et Chart.js sur toutes les vues (`views/includes/pagehead.html`, `views/includes/footer.html`, `views/setup/index.ejs`, `views/public/report-issue.ejs`, `views/admin/manage-statistics.ejs`) par les chemins locaux relatifs au `<base href>`.
- Suppression de `@docsearch/css@3`, des classes mortes `animate__animated animate__fadeIn` et des origines CDN externes inutiles dans la CSP d'`app.js`.
- Remplacement de `public/images/404.gif` (4,6 Mo) par une illustration SVG légère dédiée (`public/images/404-fablab.svg`, < 5 Ko) et suppression des doublons non utilisés dans `public/images/` (`bootstrap-logo.svg`, `favicon.*`, `logo_fablab.svg`, `logo_fabtrack.svg`).

## Hors périmètre

- Refonte des modales de confirmation et toasts (traité dans `R-027`).
- Corrections WCAG AA et mode sombre (traité dans `R-028`).

## Dépendances

- `R-010` (Font Awesome Free local).

## Critères d'acceptation

- Zéro référence `cdn.jsdelivr.net`, `cdnjs.cloudflare.com`, `fonts.googleapis.com` ou `@docsearch` dans `views/` et `app.js`.
- `/vendor/bootstrap/css/bootstrap.min.css`, `/vendor/bootstrap/js/bootstrap.bundle.min.js` et `/vendor/chartjs/chart.umd.min.js` répondent en HTTP `200` localement.
- `public/images/404.gif` supprimé et remplacé par `public/images/404-fablab.svg` (< 10 Ko).
- `npm run lint`, `npm audit --omit=dev`, `DATABASE_URL="" npm run test:unit` et `fabboard roadmap lint` passent sans erreur.

## Vérifications de l'utilisateur

- Tester le chargement du kiosque `/fabtrack`, de `/admin/statistics` et d'une page 404 en coupant l'accès Internet (ou mode Offline/réseau local uniquement dans DevTools) et vérifier que styles, modales, icônes, graphiques Chart.js et page 404 s'affichent sans aucune requête vers un CDN externe.
