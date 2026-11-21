---
id: R-016
titre: "Confiner l'IA NL2SQL (rôle MariaDB lecture seule) et corriger les SSRF"
resume: "Exécuter les requêtes IA via un compte MariaDB lecture seule sur des vues sans PII, durcir le pare-feu SQL et bloquer les SSRF."
statut: idee
jalon: v1.3
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** `AUD-014` (Opus #10 + nouveaux)
- **Fichiers principaux :** `services/aiQueryService.js`, `routes/admin/settings.js:328-352`, `routes/admin/statistics.js:409-433`, `services/bookstackService.js:14-57`
- **Périmètre envisagé :**
  - Pool MariaDB dédié en lecture seule (`DATABASE_URL_AI_RO`) limité à des vues SQL sans PII ni tokens + `SET STATEMENT max_statement_time=5 FOR ...`.
  - Rejeter les commentaires SQL (`/*...*/`, `--`), `SELECT *`, `information_schema`/`mysql`/`performance_schema`/`Log` et envelopper la limite (`SELECT * FROM (...) _q LIMIT 200`).
  - Ne plus renvoyer `dbErr.message` brut au LLM cloud ; actualiser `SAFE_SCHEMA_PROMPT` v1.0.
  - Valider `ai_local_url` et `bookstack_url` contre les SSRF (schéma `http(s):`, blocage IP privées/métadonnées sauf allowlist `.env`), ne plus exposer `errText` brut au client, passer la clé Gemini en en-tête `x-goog-api-key` et encoder `model` ; option chiffrement au repos des clés API.
- **Arbitrages & dépendances :** Dépend de `R-015`.
- **Critères d'acceptation visés :** Tests unitaires rejetant `SELECT * FROM User`, `/*...*/`, `information_schema`, `http://169.254.169.254` ; requêtes légitimes exécutées sous rôle RO.
