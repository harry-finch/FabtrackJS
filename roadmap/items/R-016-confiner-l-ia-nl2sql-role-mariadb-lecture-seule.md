---
id: R-016
titre: "Confiner l'IA NL2SQL (rôle MariaDB lecture seule) et corriger les SSRF"
resume: "Exécuter les requêtes IA via un compte MariaDB lecture seule (fail-closed en prod), durcir le pare-feu SQL, bloquer les SSRF et chiffrer optionnellement les clés API au repos."
statut: a-tester
jalon: v1.3
cree: 2026-11-21
maj: 2026-11-21
livree:
---

## But

Confiner l'exécution SQL de l'assistant IA NL2SQL derrière un compte MariaDB dédié en lecture seule limité à des vues sans PII (`AUD-014`), durcir le pare-feu SQL contre les contournements, éliminer les risques SSRF sur `ai_local_url` et `bookstack_url`, ne plus fuiter d'erreurs brutes ni de clés en query string, et proposer un chiffrement au repos transparent AES-256-GCM des clés API stockées dans `SystemSetting`.

## Inclus

- **Confinement MariaDB lecture seule (`utilities/aiReadOnlyDb.js`, `bin/www`, `services/aiQueryService.js`) :**
  - Pool MariaDB dédié (`DATABASE_URL_AI_RO`, `multipleStatements: false`) exécutant les requêtes avec `SET STATEMENT max_statement_time=5 FOR ...` et fermeture propre lors du `shutdown()` dans `bin/www`.
  - **Fail-closed en production (`1A`) :** si `DATABASE_URL_AI_RO` est absent en `NODE_ENV=production`, l'exécution NL2SQL est refusée avec un message explicite ; en `development`/`test`, repli contrôlé sur le pool principal avec `SET STATEMENT max_statement_time=5 FOR ...`.
  - Guide SQL de création des vues sans PII et du compte MariaDB `fabtrack_ai_ro` documenté dans `docs/MISE_A_JOUR_PROD.md`.
- **Durcissement pare-feu SQL & appels LLM (`services/aiQueryService.js`) :**
  - Rejeter les commentaires SQL (`/*...*/`, `--`, `#`), `SELECT *` (hors `COUNT(*)`), les schémas système (`information_schema`, `mysql`, `performance_schema`, `sys`) et les tables/colonnes sensibles (`Staff`, `SystemSetting`, `Session`, `Log`, `password`, `pwdToken`, `token`, `rfid`, `email`, `reporterEmail`, `responsibleEmail`).
  - Encadrer toute requête non-scalaire via `SELECT * FROM (<sql>) AS _q LIMIT 200`.
  - Ne plus renvoyer `dbErr.message` brut au LLM cloud lors de l'auto-correction ni `errText`/`errBody` brut au client.
  - Passer la clé Gemini via l'en-tête `x-goog-api-key` (au lieu de `?key=...`) et encoder `model` (`encodeURIComponent`).
  - Actualiser `SAFE_SCHEMA_PROMPT` v1.0 (sans colonnes PII ni tables sensibles).
- **Défense SSRF (`utilities/ssrfGuard.js`, `services/aiQueryService.js`, `services/bookstackService.js`, `routes/admin/settings.js`, `routes/admin/bookstack.js`) :**
  - Bloquer schémas non-HTTP(S), identifiants embarqués, IP privées/loopback/link-local/métadonnées (`169.254.169.254`, `127.0.0.1`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `::1`, `fc00::/7`, `fe80::/10`, `::ffff:...`) et noms internes (`.local`, `.internal`, `localhost`), avec vérification DNS contre le DNS rebinding, sauf hôtes explicitement listés dans `SSRF_ALLOWED_HOSTS` / `AI_LOCAL_ALLOWED_HOSTS` / `BOOKSTACK_ALLOWED_HOSTS`.
  - Filtrer aussi `settings` dans `GET /admin/bookstack` via `settingsService.filterPublicSettings()`.
- **Chiffrement au repos optionnel AES-256-GCM (`utilities/secretCrypto.js`, `services/settingsService.js`) :**
  - **Option 2A :** si `SETTINGS_ENCRYPTION_KEY` est défini dans `.env`, toutes les clés secrètes (`SECRET_SETTING_KEYS`) sont chiffrées au format `enc:v1:<iv>:<tag>:<ciphertext>` avant écriture en base et déchiffrées au chargement, tout en lisant de façon rétrocompatible les valeurs en clair déjà présentes en base.
- **Tests & documentation :**
  - Créer `tests/unit/aiConfinementAndSsrfR016.test.js` et aligner `tests/unit/aiQueryService.test.js`.
  - Mettre à jour `docs/MISE_A_JOUR_PROD.md` et `STATUS.md`.

## Hors périmètre

- Migration forcée par script batch des clés déjà enregistrées en clair (chacune est automatiquement chiffrée dès sa prochaine mise à jour si `SETTINGS_ENCRYPTION_KEY` est défini).
- Proxy HTTP sortant dédié pour les appels LLM.

## Décisions

- **Arbitrage 1A :** Fail-closed strict en `NODE_ENV=production` si `DATABASE_URL_AI_RO` n'est pas configuré ; repli autorisé sur le pool principal uniquement hors production.
- **Arbitrage 2A :** Chiffrement AES-256-GCM transparent piloté par `SETTINGS_ENCRYPTION_KEY`, 100 % rétrocompatible avec les secrets existants en clair.

## Dépendances

- Dépend de `R-015` (filtrage des secrets hors de `res.locals.settings` et écriture seule).

## Critères d'acceptation

- `validateAndSanitizeSql` rejette `SELECT * FROM User`, `/*...*/`, `--`, `information_schema`, `Log`, `Session`, `email`/`rfid`/`token` et encapsule les requêtes légitimes avec `SELECT * FROM (...) AS _q LIMIT 200`.
- `executeSafeQuery` échoue en `NODE_ENV=production` sans `DATABASE_URL_AI_RO`, et préfixe les requêtes avec `SET STATEMENT max_statement_time=5 FOR ...`.
- `ssrfGuard` bloque `http://169.254.169.254/latest/meta-data`, `http://127.0.0.1:11434`, `http://[::1]`, `http://10.0.0.1`, sauf si explicitement listé dans `AI_LOCAL_ALLOWED_HOSTS` / `BOOKSTACK_ALLOWED_HOSTS` / `SSRF_ALLOWED_HOSTS`.
- Gemini utilise `x-goog-api-key` (jamais `?key=`) et `encodeURIComponent(model)` ; `dbErr.message` et `errText` bruts ne sont pas exposés.
- `secretCrypto` chiffre/déchiffre en AES-256-GCM avec `SETTINGS_ENCRYPTION_KEY` et reste rétrocompatible avec le texte en clair.
- `npm run lint` (0 erreur), `npm audit --omit=dev` (0 vulnérabilité) et `DATABASE_URL="" npm run test:unit` (100 % vert).

## Vérifications de l'utilisateur

- En production (si l'assistant IA NL2SQL est utilisé), créer le compte MariaDB `fabtrack_ai_ro` et les vues SQL documentés dans `docs/MISE_A_JOUR_PROD.md`, renseigner `DATABASE_URL_AI_RO` (et optionnellement `SETTINGS_ENCRYPTION_KEY` / `AI_LOCAL_ALLOWED_HOSTS` / `BOOKSTACK_ALLOWED_HOSTS`).
- Vérifier qu'une requête IA légitime aboutit dans **Administration > Statistiques** et qu'une URL interne non autorisée (`http://169.254.169.254`) est bloquée sur **Administration > Paramètres** / **BookStack**.
