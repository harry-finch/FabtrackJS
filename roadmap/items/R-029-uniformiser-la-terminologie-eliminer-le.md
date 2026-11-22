---
id: R-029
titre: "Uniformiser la terminologie, éliminer le franglais et compléter l'i18n"
resume: "Généraliser Contributeur / Motif de la visite, traduire les 35 vues et 242 messages flash en dur et nettoyer le catalogue i18n."
statut: a-tester
jalon: v1.5
cree: 2026-11-21
maj: 2026-11-22
livree:
---

## Objectif

Uniformiser intégralement la terminologie visible de l'interface (« Contributeur » au lieu d'« Usager », « Motif de la visite » au lieu de « Type de projet » côté UI tout en conservant `projecttype` côté Prisma/routes), éliminer les résidus de franglais dans les vues et scripts client, introduire un support de messages flash traduits au rendu (`{ type, key, params }`), corriger `config/i18n.js` / `services/i18nService.js` (`|| true`), et synchroniser le catalogue `locales/fr.json`, `locales/en.json` et `translations.csv`.

## Contexte et motivation

- **Source :** `AUD-033` (Opus #27).
- Quelques occurrences résiduelles d'« Usager » subsistent dans `public/javascripts/fabtrack.js`, `services/balanceService.js` et `services/machineUsageService.js`.
- Des libellés en anglais (franglais) persistent dans les titres `<title>Fabtrack signin</title>`, `views/admin/manage-machines.ejs`, `views/admin/manage-consumables.ejs`, `views/admin/view-machine.ejs`, `views/includes/header.html` et `public/javascripts/fabtrack.js`.
- La clé `common.menu` utilisée dans `views/includes/header.html` est absente de `locales/fr.json` et `locales/en.json`, la clé obsolète `auth.remember_me` y est encore présente, et `config/i18n.js` + `services/i18nService.js` contiennent des conditions mortes `|| true`.
- `routes/admin/settings.js` émet encore des messages flash en anglais en dur au lieu d'utiliser les clés `alerts.*` existantes.

## Comportement attendu

1. **Terminologie 100 % homogène :**
   - 0 occurrence visible de « Usager » ou « Type de projet » dans `views/`, `public/javascripts/`, `locales/fr.json` et les messages utilisateur retournés par les services.
   - `projecttype` est strictement préservé dans Prisma, les schémas et les routes backend.
2. **Suppression du franglais :**
   - Titres `<title>` traduits sur `login.ejs`, `register.ejs`, `forgot.ejs`, `reset.ejs`.
   - Libellés et métadonnées francisés/traduits sur `manage-machines.ejs`, `manage-consumables.ejs`, `view-machine.ejs`, `header.html` et `public/javascripts/fabtrack.js`.
3. **Messages flash traduisibles au rendu :**
   - `utilities/flashHelper.js` expose `setFlash(req, type, keyOrMessage, params)` et `formatFlash(notification, translateFn)` supportant les objets structurés `{ type, key, params }` (traduits dans la locale courante via `res.__`) et les chaînes historiques.
   - `middleware/clearNotification.js` utilise `formatFlash` automatiquement.
   - `routes/admin/settings.js` utilise `setFlash` avec les clés `alerts.settings_saved`, `alerts.logo_reset`, `alerts.favicon_reset`.
4. **Catalogue i18n propre et synchronisé :**
   - Ajout de `common.menu` et `nav.inventory_checkout`, suppression de la clé morte `auth.remember_me`, mise à jour des formats d'upload sans `.svg` (`R-005`).
   - Suppression des conditions mortes `|| true` dans `config/i18n.js` et `services/i18nService.js`.
   - Régénération de `translations.csv` via `i18nService.exportToCsvFile()` afin que `fr.json`, `en.json` et `translations.csv` aient exactement le même ensemble de clés.

## Plan technique

- Créer `utilities/flashHelper.js` et brancher `formatFlash` dans `middleware/clearNotification.js`.
- Nettoyer `config/i18n.js` et `services/i18nService.js`.
- Mettre à jour `routes/admin/settings.js`, `services/balanceService.js`, `services/machineUsageService.js`, `public/javascripts/fabtrack.js`.
- Mettre à jour `views/index/{login,register,forgot,reset}.ejs`, `views/admin/{manage-consumables,manage-machines,view-machine}.ejs` et `views/includes/header.html`.
- Mettre à jour `locales/fr.json`, `locales/en.json` et resynchroniser `translations.csv`.
- Ajouter la suite de tests unitaires `tests/unit/terminologyAndI18nR029.test.js`.

## Critères d'acceptation

- 0 occurrence visible de « Usager » ou « Type de projet » dans `views/`, `public/javascripts/` et `locales/fr.json`.
- 0 occurrence de `Fabtrack signin`, `Manage Machines`, `Back to Machines List`, `No documentation found` dans les vues/scripts.
- `locales/fr.json`, `locales/en.json` et `translations.csv` possèdent exactement les mêmes clés, incluant `common.menu` et sans `auth.remember_me`.
- `config/i18n.js` et `services/i18nService.js` ne contiennent plus de `|| true`.
- `utilities/flashHelper.js` traduit `{ type, key, params }` en FR et EN tout en restant rétrocompatible avec les chaînes flash existantes.
- `npm run lint`, `npm audit --omit=dev`, `DATABASE_URL="" npm run test:unit` et `fabboard roadmap lint` passent sans erreur.

## Risques et points de vigilance

- Préserver la rétrocompatibilité de `clearNotification` avec les routes existantes qui affectent encore `req.session.notification = "Success: ..."`.
- Respecter strictement la règle `projecttype` en backend/Prisma/routes vs « Motif de la visite » en UI.
