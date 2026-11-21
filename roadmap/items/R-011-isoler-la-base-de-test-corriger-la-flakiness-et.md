---
id: R-011
titre: "Isoler la base de test, corriger la flakiness et installer la CI"
resume: "Imposer DATABASE_URL_TEST, supprimer le backdoor TEST_ADMIN_USER sur la base réelle, corriger LIKE 'TEST_%' et créer la CI GitHub Actions."
statut: idee
jalon: v1.2
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** Top 10 (#8) · `AUD-006`, `AUD-030` (Opus #4, #23)
- **Fichiers principaux :** `jest.config.js`, `tests/helpers/testDb.js`, `tests/unit/inventoryService.test.js`, `tests/integration/setup.test.js`, `tests/integration/aiStatistics.test.js`, `tests/integration/historyImport.test.js`, `.github/workflows/ci.yml`, `package.json`
- **Périmètre envisagé :**
  - Exiger `DATABASE_URL_TEST` avec garde-fou anti-prod et vérification de suffixe `_test` dans `tests/jest.setup.js`.
  - Corriger `ensureTestUsertype()` (retirer `description`), supprimer le filtre dangereux `startsWith("Test")` sur `User`, corriger la casse `` `UserType` `` → `` `Usertype` `` dans `aiStatistics.test.js:93` et restaurer `SystemSetting` dans `afterAll`.
  - Séparer les tests unitaires purs (sans DB) et les tests d'intégration (`--runInBand`), et corriger le préfixe de nettoyage pour éliminer la collision SQL `LIKE 'TEST_%'`.
  - Ajouter les tests manquants critiques : auth/login/reset, RBAC 3 rôles, uploads `/report-issue`, `machineUsageService`, patch `APP_BASE_PATH`.
  - Créer la GitHub Action (service MariaDB, import `schema.sql`, `npm test`, `npm audit --omit=dev`, `fabboard roadmap lint`) + ESLint minimal + `"engines": { "node": ">=20" }`.
  - Action opérationnelle : vérifier l'absence de `TEST_ADMIN_USER` en production.
- **Arbitrages & dépendances :** Aucune (recommandé tôt pour sécuriser les chantiers suivants).
- **Critères d'acceptation visés :** `npm test` échoue immédiatement sans `DATABASE_URL_TEST` ; 5 exécutions consécutives passent à 100 % sur base `_test` ; pipeline CI verte.
