---
id: R-013
titre: "Éradiquer les XSS templates/DOM et sécuriser /report-bug & mailService"
resume: "Supprimer les injections <%- JSON.stringify %>, icônes HTML brutes, confirm() inline, innerHTML dynamiques et HTML injection dans les e-mails."
statut: a-tester
jalon: v1.2
cree: 2026-11-21
maj: 2026-11-21
livree:
---

## But

Éradiquer l'ensemble des vecteurs XSS côté templates EJS, scripts DOM client et e-mails HTML (`AUD-011`, `AUD-012`), valider les schémas d'URL (`http:`/`https:`), et verrouiller l'endpoint `POST /report-bug` ainsi que les préférences d'envoi dans `mailService.js`.

## Inclus

- **Helpers centralisés (`utilities/xssHelpers.js` & `app.js`) :**
  - Créer `escapeHtml`, `safeJson` (échappement `<`, `>`, `&`, `\u2028`, `\u2029`), `safeHttpUrl` (`http:` / `https:` strict) et `sanitizeWarningIcon` (liste blanche de classes Font Awesome Free + couleurs Bootstrap, avec extraction sûre des anciens `<i class="..."></i>`).
  - Exposer ces 4 helpers dans `res.locals` (`app.js`).
- **Templates EJS & suppression des `confirm()` inline :**
  - Remplacer tous les `<%- JSON.stringify(...) %>` par `<%- safeJson(...) %>` (`manage-communication.ejs`, `manage-statistics.ejs`, `views/fabtrack/index.ejs`, `views/fabtrack/edit-user.ejs`).
  - Supprimer tous les `<%- warningtype.icon %>` / `<%- warning.warningtype.icon %>` au profit de `<i class="<%= sanitizeWarningIcon(...) %>"></i>` et normaliser `icon` côté serveur dans `routes/admin/warningtypes.js`.
  - Échapper les noms dans le tooltip HTML de `views/admin/project-consumption.ejs`.
  - Remplacer tous les `onsubmit="return confirm('...')"` inline (30 occurrences sur 17 vues) par `data-confirm="..."` lu de manière centralisée dans `public/javascripts/main.js`.
  - Valider le schéma `http:`/`https:` sur `redirectUrl` (`views/index/agreement-success.ejs` + `routes/index.js`) et sur tous les liens `project.url` (`edit-user.ejs`, `view-history.ejs`, `manage-bookstack.ejs`, `project-consumption.ejs`).
- **Durcissement DOM client (suppression des `innerHTML` dynamiques non échappés) :**
  - Refactoriser `public/javascripts/pagination.js` (et les données `tableData` dans `edit-user.ejs`) pour ne plus injecter de HTML brut via `innerHTML` mais construire des nœuds DOM typés (`textContent`, liens `http:`/`https:` vérifiés).
  - Remplacer les `innerHTML` dynamiques interpolant des données utilisateur/DB par des API DOM sûres (`textContent` / `createElement`) dans `public/javascripts/fabtrack.js`, `public/javascripts/rfid-listener.js`, `public/javascripts/manage-consumables.js`, `views/includes/inventory-checkout-modal.html`, `views/admin/manage-communication.ejs`, `views/admin/import-history.ejs`, `views/admin/manage-settings.ejs`, `views/admin/manage-warningtypes.ejs`, `views/admin/manage-emails.ejs` et `views/index/register.ejs`.
- **Sécurisation `/report-bug` & `mailService.js` :**
  - Protéger `POST /report-bug` par `isAuthenticated` (en complément du rate-limiter `R-012`) et ne plus faire confiance à `req.get("host")` en production.
  - Valider `pageUrl` (`http:`/`https:`), les longueurs et la gravité dans `schemas/bug.schema.js`.
  - Échapper l'ensemble des valeurs dynamiques avec `escapeHtml` et valider les URLs dans `services/mailService.js`.
  - Respecter effectivement `mail_notif_staff_registration` et ajouter/respecter `mail_notif_bug_report` (`services/settingsService.js`, `services/mailService.js`, `routes/admin/emails.js`, `views/admin/manage-emails.ejs`).
- **Tests & documentation :**
  - Créer `tests/unit/xssAndMailR013.test.js` (charges `</script><img onerror=1>`, `');alert(1);//`, `javascript:alert(1)`, HTML e-mail, `POST /report-bug` anonyme refusé, toggles e-mail, scan statique des vues).
  - Mettre à jour `docs/MISE_A_JOUR_PROD.md` et `STATUS.md`.

## Hors périmètre

- Ajout de bibliothèques tierces (`DOMPurify`, `sanitize-html`) : les besoins étant purement de l'échappement texte, de la sérialisation JSON sûre et des listes blanches de classes/URLs, une implémentation native sans dépendance reste plus légère et auditable.
- Suppression de `'unsafe-inline'` dans la CSP Helmet (nécessite une refonte des scripts inline dans un lot ultérieur).

## Décisions

- **Rétrocompatibilité `Warningtype.icon` :** `sanitizeWarningIcon` extrait proprement les classes Font Awesome Free et couleurs Bootstrap même si une ancienne ligne en base contenait `<i class="fa-solid fa-ban text-danger"></i>`, tout en rejetant toute balise/attribut/script arbitraire ; toute nouvelle création/édition enregistre uniquement la chaîne de classes assainie.
- **Confirmation centralisée `data-confirm` :** `public/javascripts/main.js` intercepte l'attribut `data-confirm` sur `submit` avant l'injection CSRF et le verrou anti-double-soumission, évitant toute interpolation dans du code JavaScript inline.

## Dépendances

- Dépend de `R-012` (CSRF, formulaires `POST` et rate-limiting déjà en place).

## Critères d'acceptation

- Charges `</script><img onerror=1>`, `');alert(1);//`, `javascript:alert(1)` et HTML/script dans les e-mails toutes neutralisées.
- `0` occurrence de `<%- JSON.stringify`, `<%- ...icon %>` ou `onsubmit="return confirm(` restante dans `views/`.
- `POST /report-bug` anonyme refusé (`401` JSON / `302 /login` HTML) et `pageUrl` validée `http:`/`https:`.
- `mail_notif_staff_registration` et `mail_notif_bug_report` effectivement respectés dans `mailService.js`.
- `npm run lint` (0 erreur) et `DATABASE_URL="" npm run test:unit` (100 % vert).

## Vérifications de l'utilisateur

- Vérifier en préproduction/navigateur les boîtes de confirmation sur suppression admin (`data-confirm`), l'affichage des icônes d'avertissement (kiosque et admin), le tableau paginé d'historique d'un usager et l'envoi d'un signalement de bug connecté.
