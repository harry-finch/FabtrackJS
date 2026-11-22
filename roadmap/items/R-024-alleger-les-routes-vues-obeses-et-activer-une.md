---
id: R-024
titre: "Alléger les routes/vues obèses et activer une CSP stricte sans unsafe-inline"
resume: "Extraire la logique métier vers services/, factoriser les duplications, sortir le JS inline et durcir la Content Security Policy."
statut: a-tester
jalon: v1.4
cree: 2026-11-21
maj: 2026-11-22
livree:
---

## But

La duplication de logique métier dans les contrôleurs (`routes/history.js`, `routes/admin/equipment.js`, `routes/admin/consumables.js`, `routes/admin/workshops.js`, `routes/users.js`, les 6 CRUD référentiels et les deux parseurs CSV) augmente le risque de régression, tandis que la Content Security Policy d'`app.js` autorisait `'unsafe-inline'` sur `scriptSrc` et `scriptSrcAttr` en raison des scripts inline et des 126 attributs `on*=` disséminés dans les templates EJS.

## Inclus

- Extraction et factorisation de la logique métier dupliquée vers `services/` et `utilities/` :
  - `services/consumableStatusHelper.js` : calcul unique du statut de stock consommable (`AVAILABLE` / `LOW_STOCK` / `OUT_OF_STOCK`), réutilisé dans `routes/admin/consumables.js`, `routes/history.js` et `services/inventoryService.js`.
  - `services/equipmentLoanService.js` : logique partagée de restitution atomique et de listage des prêts actifs d'équipements, réutilisée dans `routes/history.js` et `routes/admin/equipment.js`.
  - `services/csvParserService.js` : parseur CSV RFC-4180 unique partagé entre `services/historyImportService.js` et `services/i18nService.js`.
  - `utilities/referenceCrudFactory.js` : fabrique factorisée pour les 6 routeurs CRUD référentiels identiques (`accesslevels`, `locations`, `projecttypes`, `usertypes`, `warningtypes`, `workspaces`).
  - Délégation unifiée des intérêts et badges d'ateliers vers `services/workshopService.js` depuis `routes/admin/workshops.js` et `routes/users.js`.
- Externalisation du script global `views/includes/pagehead.html` vers `public/javascripts/app-base.js` et ajout de la délégation d'événements CSP-safe dans `public/javascripts/main.js`.
- Suppression de 100 % des attributs d'événements inline `on*=` dans l'ensemble des vues `views/**/*.{ejs,html}` (remplacés par `data-*` et `addEventListener`).
- Activation d'un nonce cryptographique par requête (`res.locals.cspNonce`) dans `app.js` et durcissement Helmet CSP : retrait définitif de `'unsafe-inline'` dans `scriptSrc` (remplacé par `'nonce-...'`) et passage de `scriptSrcAttr` à `["'none'"]`.

## Hors périmètre

- Refonte visuelle des modales de confirmation et du design des tableaux/kiosque (traités dans `R-027`, `R-032` et `R-033` en `v1.5`).
- Retrait complet de `'unsafe-inline'` sur `styleSrc` (les attributs `style=` visuels seront réduits progressivement lors des lots UI `v1.5`).

## Dépendances

- `R-013` (éradication XSS et centralisation `data-confirm` dans `main.js`).

## Critères d'acceptation

- `app.js` configure Helmet CSP sans `'unsafe-inline'` dans `scriptSrc` ni `scriptSrcAttr` (`scriptSrcAttr: ["'none'"]`) avec un nonce aléatoire par requête.
- Zéro attribut `on*=` (`onclick`, `onchange`, `oninput`, `onsubmit`, etc.) ne subsiste dans aucun fichier de `views/`.
- Tout bloc `<script>` inline résiduel (hors `src=` et `type="application/json"`) porte l'attribut `nonce="<%= typeof cspNonce !== 'undefined' ? cspNonce : '' %>"`.
- Les services factorisés (`consumableStatusHelper`, `equipmentLoanService`, `csvParserService`, `referenceCrudFactory`) sont couverts par des tests unitaires dédiés.
- `npm run lint`, `npm audit --omit=dev`, `DATABASE_URL="" npm run test:unit` et `fabboard roadmap lint` passent sans erreur.

## Vérifications de l'utilisateur

- Parcourir les écrans principaux (kiosque `/fabtrack`, `/users/manage`, `/admin/settings`, `/admin/emails`, `/admin/machines/manage`, `/admin/warningtypes/manage`, `/admin/communication`, `/admin/statistics`) avec la console navigateur ouverte et vérifier zéro erreur ou blocage CSP.
