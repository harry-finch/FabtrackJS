---
id: R-020
titre: "Supprimer l'état global muté par requête et masquer les erreurs internes en prod"
resume: "Passer la locale par requête dans dateService, synchroniser les plugins au changement uniquement et masquer stack/erreurs Prisma en production."
statut: a-tester
jalon: v1.3
cree: 2026-11-21
maj: 2026-11-22
livree:
---

## But

Des requêtes HTTP concurrentes dans des langues différentes (FR/EN ou langue ajoutée via CSV) entraient en collision car `dateService.setLocale()` mutait globalement `moment.locale()`, et le middleware global `app.js` mutait l'état de 6 plugins sur le singleton `hookManager` à chaque requête. Par ailleurs, le gestionnaire d'erreurs global d'`app.js` reposait sur `req.app.get('env') === 'development'` (vrai par défaut si `NODE_ENV` n'est pas défini) et exposait toujours `err.message` (y compris les messages Prisma/SQL bruts) en production.

## Inclus

- Suppression de toute mutation globale de `moment.locale()` par requête dans `services/dateService.js` : formatage isolé par requête via `moment(date).locale(locale)` et helpers liés à la requête (`createRequestDateHelpers(locale)`), avec chargement dynamique sécurisé des locales Moment pour les langues ajoutées par CSV.
- Synchronisation centralisée des plugins (`hookManager.setPluginEnabled`) uniquement au chargement/démarrage et lors des modifications de paramètres dans `services/settingsService.js` (`reloadSettings`, `setSetting`, `updateSettings`), en retirant les 6 appels par requête dans `app.js`.
- Durcissement du gestionnaire global d'erreurs dans `app.js` : masquage strict de `err.stack` (hors `NODE_ENV === "development"` explicite) et remplacement de `err.message` par un message générique en français pour toute erreur `statusCode >= 500` dès que `NODE_ENV !== "development"` (en JSON comme en HTML), tout en conservant le log complet côté serveur.

## Hors périmètre

- Remplacement complet de Moment.js ou refonte des middlewares/routes d'`app.js` (traité dans `R-021` / `R-022`).
- Mise en place d'un logger JSON structuré (`R-025`).

## Dépendances

- Aucune.

## Critères d'acceptation

- Deux formatages concurrents en `fr`, `en` et une langue additionnelle (`es`, `de`) via `createRequestDateHelpers` ou `formatDate(date, fmt, locale)` ne s'influencent jamais mutuellement et ne modifient pas la locale globale de Moment.
- Le traitement d'une requête HTTP dans `app.js` n'appelle plus `hookManager.setPluginEnabled` ni `dateService.setLocale` ; un changement via `settingsService.updateSettings` ou `setSetting` synchronise immédiatement `hookManager`.
- Sur une erreur `500` (ex. erreur Prisma contenant une requête SQL ou un chemin fichier), lorsque `NODE_ENV` vaut `"production"` ou n'est pas défini (`""` / `undefined`), la réponse HTTP (JSON et HTML) ne contient ni `err.stack` ni le message Prisma brut ; lorsque `NODE_ENV === "development"`, les détails techniques restent visibles.
- `npm run lint`, `npm audit --omit=dev`, `DATABASE_URL="" npm run test:unit` et `fabboard roadmap lint` passent sans erreur.

## Vérifications de l'utilisateur

- Ouvrir l'application dans deux onglets avec deux langues différentes (FR et EN) sur une page affichant un format de date long (`D MMMM YYYY`) et vérifier que les mois affichés restent dans la langue de chaque session.
- Vérifier en environnement hors `NODE_ENV=development` qu'une page d'erreur serveur n'affiche ni pile d'appels (`stack`) ni message technique interne.
