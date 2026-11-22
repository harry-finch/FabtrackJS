---
id: R-027
titre: "Refondre les modales de confirmation et les retours utilisateur"
resume: "Remplacer les 33 confirm(), 9 alert() et 1 prompt() natifs par une modale Bootstrap réutilisable et corriger les retours d'erreur."
statut: a-tester
jalon: v1.5
cree: 2026-11-21
maj: 2026-11-22
livree:
---

## Objectif

Éliminer tous les dialogues navigateur natifs (`confirm()`, `alert()`, `prompt()`) qui cassent l'ergonomie (en particulier sur borne tactile et en thème sombre), harmoniser les toasts flash en masquant les préfixes techniques (`Success:`, `Error:`, `Warning:`, `Info:`), et corriger les retours d'erreur sur `/report-issue`, `/reset/:token` et `/login`.

## Contexte et motivation

- **Sources :** `AUD-029`, `AUD-011` (UX), `AUD-033` (Opus #28).
- Les 33 formulaires destructifs `[data-confirm]` passent actuellement par `window.confirm()` dans `public/javascripts/main.js`, et 13 appels résiduels `alert()` / `confirm()` / `prompt()` subsistent dans le kiosque, l'assistant de configuration et l'administration.
- `public/javascripts/notifications.js` affiche les préfixes bruts `"Success: ..."`, `"Error: ..."`, `"Warning: ..."` dans les toasts et ignore `"Info: ..."`.
- `GET /report-issue` ne consomme pas `req.session.notification` via `clearNotification` et `views/public/report-issue.ejs` n'affiche aucune bannière d'erreur en cas d'échec de validation ou d'upload.
- `views/index/login.ejs` expose encore une case « Se souvenir de moi » (`rememberMe`) sans effet côté backend.

## Comportement attendu

1. **Modale Bootstrap 5 réutilisable (`views/includes/confirm-modal.html` + `public/javascripts/dialogs.js`) :**
   - Exposée globalement via `window.fabtrackConfirm(opts)`, `window.fabtrackAlert(opts)` et `window.fabtrackPrompt(opts)` (API basée sur `Promise`).
   - Compatible mode clair/sombre (`data-bs-theme`), navigation clavier (`Escape` pour annuler, `Enter` dans un prompt), gestion du focus WCAG et libellés traduits (`common.confirm`, `common.cancel`, `common.close`, etc.).
   - 100 % conforme CSP strict (aucun gestionnaire `on*=` inline, aucun `innerHTML` sur du texte utilisateur).
2. **Remplacement intégral des dialogues natifs :**
   - `public/javascripts/main.js` intercepte `[data-confirm]` et ouvre `window.fabtrackConfirm` avant re-soumission sécurisée (avec injection CSRF et réécriture sous-chemin conservées).
   - Remplacement des appels `alert()` / `confirm()` / `prompt()` dans `public/javascripts/fabtrack.js`, `views/fabtrack/index.ejs`, `views/setup/index.ejs`, `views/admin/manage-statistics.ejs`, `views/admin/manage-workshops.ejs`, `views/admin/import-history.ejs` et `views/admin/manage-settings.ejs`.
3. **Toasts propres et API `window.showAppToast` :**
   - `public/javascripts/notifications.js` retire les préfixes `Error:`, `Warning:`, `Success:`, `Info:`, affiche une icône FontAwesome sémantique et adapte le contraste du bouton fermer (notamment sur `text-bg-warning`).
   - Exporte `window.showAppToast(message, type)` pour les retours non bloquants côté client (copie presse-papiers, export vide, validation rapide).
4. **Pages publiques et authentification :**
   - `routes/report-issue.js` applique `clearNotification` sur `GET ["/", "/:machineId"]` ; `views/public/report-issue.ejs` affiche une alerte Bootstrap lisible (préfixe retiré) pour toute erreur/avertissement.
   - `views/index/login.ejs` supprime la case morte `rememberMe` et résout le logo par défaut via `baseUrl`.
   - `views/index/reset.ejs` conserve `user.name` et son bloc `#warning` fonctionnel.

## Plan technique

- Créer `views/includes/confirm-modal.html` et `public/javascripts/dialogs.js`, inclus dans `views/includes/footer.html` et `views/setup/index.ejs`.
- Mettre à jour `public/javascripts/main.js`, `public/javascripts/notifications.js`, `public/javascripts/fabtrack.js`.
- Mettre à jour `views/fabtrack/index.ejs`, `views/setup/index.ejs`, `views/admin/manage-statistics.ejs`, `views/admin/manage-workshops.ejs`, `views/admin/import-history.ejs`, `views/admin/manage-settings.ejs`.
- Rendre `middleware/clearNotification.js` défensif sur `req.session`, le brancher sur `routes/report-issue.js` et ajouter la bannière d'erreur dans `views/public/report-issue.ejs`.
- Nettoyer `views/index/login.ejs` (`rememberMe` et `baseUrl`).
- Ajouter la suite de tests unitaires `tests/unit/modalsAndFeedbackR027.test.js`.

## Critères d'acceptation

- 0 appel natif `alert(`, `confirm(` ou `prompt(` dans `views/` et `public/javascripts/`.
- Les formulaires `[data-confirm]` ouvrent la modale Bootstrap `#fabtrackDialogModal` et ne soumettent qu'après confirmation.
- Les toasts n'affichent plus les préfixes bruts `"Success:"`, `"Error:"`, `"Warning:"`, `"Info:"`.
- Les erreurs de validation/upload sur `/report-issue` s'affichent dans une bannière visible et sont vidées de la session après lecture.
- La case non fonctionnelle `rememberMe` est retirée de `login.ejs` ; `reset.ejs` affiche `user.name` et `#warning`.
- `npm run lint`, `npm audit --omit=dev`, `DATABASE_URL="" npm run test:unit` et `fabboard roadmap lint` passent sans erreur.

## Risques et points de vigilance

- Conserver un seul listener `document.addEventListener("click", ...)` et un seul `document.addEventListener("submit", ...)` dans `public/javascripts/main.js` (compatibilité avec le harnais VM de `tests/unit/stabilityR008.test.js`).
- Vérifier que toutes les classes FontAwesome utilisées existent dans `@fortawesome/fontawesome-free` (`tests/unit/assetsAndIconsR010.test.js`).
- Respecter le CSP strict (`nonce` sur tout `<script>` inline, 0 attribut `on*=`).
