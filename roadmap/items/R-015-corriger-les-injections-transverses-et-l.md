---
id: R-015
titre: "Corriger les injections transverses et l'exposition de secrets"
resume: "Bloquer la Prototype Pollution i18n, les Open Redirects, les injections CSV et filtrer les secrets hors de res.locals et /api/list/*."
statut: a-tester
jalon: v1.3
cree: 2026-11-21
maj: 2026-11-21
livree:
---

## But

Éliminer les vecteurs d'injection transverses (Prototype Pollution sur l'import i18n, Open Redirects via `Referer`, injections de formules CSV / `Content-Disposition`) et empêcher toute fuite de secrets ou de hachages de mots de passe dans `res.locals`, les vues HTML et les endpoints `/api/list/*` (`AUD-015`, `AUD-020`).

## Inclus

- **Helpers transverses (`utilities/securityHelpers.js`) :**
  - `getSafeRedirectPath` / `resolveSafeRedirectUrl` (redirections strictement même origine, rejet `//evil.com` et CR/LF).
  - `escapeCsvCell` (neutralisation `= + - @ \t \r` par préfixe `'` + échappement RFC 4180 des guillemets `"`).
  - `sanitizeContentDispositionFilename` (assainissement strict des noms de fichiers exportés).
- **Prototype Pollution i18n (`services/i18nService.js`) :**
  - Durcir `unflattenObject` avec `Object.create(null)` et rejet strict des clés `__proto__`, `constructor`, `prototype` ; sécuriser `escapeCsvValue` via `escapeCsvCell`.
- **Open Redirects (`Referer`) :**
  - Remplacer toutes les redirections brutes sur `req.headers.referer` par `getSafeRedirectPath` / `resolveSafeRedirectUrl` dans `middleware/validate.js`, `services/uploadSecurityService.js`, `routes/index.js`, `routes/history.js`, `routes/admin/equipment.js`, `routes/admin/inventory.js` et `routes/admin/sorbonne.js`.
- **CSV Injection & `Content-Disposition` :**
  - Appliquer `escapeCsvCell` et `sanitizeContentDispositionFilename` sur tous les exports CSV (`services/inventoryService.js`, `routes/admin/inventory.js`, `routes/admin/sorbonne.js`, `routes/admin/ue.js`, `routes/admin/statistics.js`, `services/i18nService.js`).
- **Filtrage strict des secrets & endpoints `/api/list/*` :**
  - Filtrer `res.locals.settings` dans `app.js` via `settingsService.filterPublicSettings()` (liste blanche excluant `api_machine_token`, `smtp_pass`, `bookstack_token_id`, `bookstack_token_secret`, `ai_*_api_key`).
  - Passer `api_machine_token` et les clés IA en écriture seule dans `routes/admin/settings.js` et `views/admin/manage-settings.ejs` (indicateurs booléens `has*`, jamais de valeur secrète dans le HTML, repli sur la clé stockée lors de `/ai/test-connection`).
  - Retirer les clés secrètes de `aiConfig` (`routes/admin/statistics.js`) et de `bookstackStats.config` (`services/bookstackService.js`).
  - Ajouter des `select` explicites sur `GET /api/list/all-staff` (sans `password`, `pwdToken`, `tokenExpiry`) et `GET /api/list/all-users` (sans `token`, `rfid`) dans `routes/api.js`.
- **Tests & documentation :**
  - Créer `tests/unit/injectionsAndSecretsR015.test.js` ; mettre à jour `docs/MISE_A_JOUR_PROD.md` et `STATUS.md`.

## Hors périmètre

- Chiffrement au repos des clés API dans la table `SystemSetting` (sera envisagé séparément si besoin d'un KMS/clé maître).
- Refonte des filtres ou formats d'export Excel `.xlsx`.

## Décisions

- **Écriture seule pour tous les secrets admin :** comme `smtp_pass` et `bookstack_token_secret`, `api_machine_token` et les clés API IA (`ai_*_api_key`) ne sont plus réinjectés dans les attributs HTML `value="..."` ; laisser le champ vide lors d'une sauvegarde conserve la valeur existante, et `/admin/settings/ai/test-connection` réutilise la clé enregistrée si le champ est vide.
- **CSV Formula Neutralization :** toute chaîne commençant par `=`, `+`, `-`, `@`, `\t` ou `\r` (avec ou sans espaces initiaux) est préfixée par `'` avant l'encapsulation guillemets.

## Dépendances

- Aucune dépendance bloquante (s'appuie sur `R-011` pour les tests unitaires hors-ligne).

## Critères d'acceptation

- `i18nService.unflattenObject({ "__proto__.polluted": "1", "constructor.prototype.x": "1" })` ne pollue jamais `Object.prototype`.
- `Referer: https://evil.example.com/phish` et `//evil.example.com` redirigent vers le repli interne sûr.
- Une cellule `=1+1`, `+CMD|...`, `-2+3` ou `@SUM(1,1)` est neutralisée dans tous les exports CSV et les noms de fichiers `Content-Disposition` sont assainis.
- Aucun secret (`smtp_pass`, `api_machine_token`, `ai_*_api_key`, `bookstack_token_secret`) ni hachage bcrypt / `pwdToken` / `token` ne figure dans `res.locals.settings`, le HTML de `/admin/settings`, `aiConfig`, `bookstackStats` ou `/api/list/*`.
- `npm run lint` (0 erreur), `npm audit --omit=dev` (0 vulnérabilité) et `DATABASE_URL="" npm run test:unit` (100 % vert).

## Vérifications de l'utilisateur

- Ouvrir **Administration > Paramètres**, vérifier dans le code source de la page qu'aucune clé API ni token machine n'apparaît en clair, et confirmer que la sauvegarde d'un autre réglage conserve les clés existantes.
- Exporter un CSV (Statistiques, UE, Sorbonne ou Mouvements d'inventaire) et vérifier son ouverture propre dans LibreOffice/Excel.
