---
id: R-011
titre: "Isoler la base de test, corriger la flakiness et installer la CI"
resume: "Imposer DATABASE_URL_TEST, supprimer le backdoor TEST_ADMIN_USER sur la base réelle, corriger LIKE 'TEST_%' et créer la CI GitHub Actions."
statut: a-tester
jalon: v1.2
cree: 2026-11-21
maj: 2026-11-21
livree:
---

## But

Garantir que la suite de tests ne puisse jamais toucher la base de données réelle ou de production (`DATABASE_URL_TEST` obligatoire avec garde-fou anti-prod et suffixe `_test`), éliminer les collisions et défauts de fiabilité dans les tests d'intégration, séparer les tests unitaires purs des tests d'intégration, et mettre en place un pipeline CI GitHub Actions reproductible accompagné d'un lint ESLint minimal.

## Inclus

- **Isolation stricte de la base de test (`tests/jest.setup.js`, `jest.config.js`) :**
  - Séparer `jest.config.js` en deux projets Jest : `unit` (`tests/unit/**/*.test.js`, sans connexion DB) et `integration` (`tests/integration/**/*.test.js`, chargeant `tests/jest.setup.js` avant `utilities/db.js`).
  - Dans `tests/jest.setup.js`, exporter `validateTestDatabaseUrl()` et imposer : refus si `NODE_ENV === "production"`, refus si `DATABASE_URL_TEST` est absent, refus si le nom de la base ne se termine pas par `_test`, puis surcharger `process.env.DATABASE_URL = process.env.DATABASE_URL_TEST`.
  - Déplacer les suites accédant à MariaDB (`inventoryService.test.js`, `rfidPlugin.test.js`, `machineMaintenance.test.js` et la partie DB de `historyImportService.test.js`) dans `tests/integration/`.
- **Correction de la flakiness et des helpers (`tests/helpers/testDb.js`, `tests/integration/*.test.js`) :**
  - Dans `ensureTestUsertype()`, supprimer le champ inexistant `description`.
  - Dans `cleanTestData()`, retirer les filtres dangereux `name.startsWith("Test")` et `surname.startsWith("Test")` sur `User` (cibler uniquement `TEST_EMAIL_DOMAIN`), et remplacer le préfixe SQL `TEST_` (collision `LIKE 'TEST_%'`) par un préfixe sans underscore (`FTKTEST-`).
  - Dans `tests/integration/aiStatistics.test.js`, corriger la casse `` `UserType` `` → `` `Usertype` `` (ligne 93) et restaurer tous les `SystemSetting` modifiés dans `afterAll`.
  - Dans `tests/integration/setup.test.js`, sauvegarder et restaurer `SystemSetting` et nettoyer proprement les entités de test pour garantir la rejouabilité.
  - Dans `tests/integration/historyImport.test.js`, intégrer les tests DB de `analyzeImport` et nettoyer les entités créées (`History`, `UserProject`, `Project`, `User`).
- **Tests unitaires critiques complémentaires (`tests/unit/authAndSubpathR011.test.js`) :**
  - Couvrir le garde-fou `validateTestDatabaseUrl`, le flux `POST /auth` (login approuvé, non approuvé, mauvais mot de passe) et le patch `APP_BASE_PATH` sur `res.redirect` (sous-chemin sans double préfixe, refus `//evil.com`).
- **CI GitHub Actions, ESLint minimal & `engines` (`package.json`, `eslint.config.js`, `.github/workflows/ci.yml`) :**
  - Ajouter `"engines": { "node": ">=20" }`, les scripts `test:unit`, `test:integration`, `lint`, et installer `eslint` + `@eslint/js` en `devDependencies` avec une configuration minimale passant à 0 erreur.
  - Créer `.github/workflows/ci.yml` (job `unit-and-lint` : `npm ci`, `npm run lint`, `npm audit --omit=dev`, `npm run test:unit` ; job `integration` : service MariaDB 10.11, import `prisma/schema.sql`, `npx prisma generate`, `DATABASE_URL_TEST=... npm run test:integration`).
- **Action opérationnelle production (`docs/MISE_A_JOUR_PROD.md`) :** vérifier l'absence de `TEST_ADMIN_USER` en base de production.

## Hors périmètre

- Réécriture stylistique complète du dépôt via Prettier ou règles ESLint de formatage strict.
- Déploiement de conteneurs Docker de production.

## Dépendances

- `prisma/schema.sql` resynchronisé en `R-009` (utilisé par le job d'intégration CI pour initialiser `fabtrack_test`).

## Critères d'acceptation

- `npm run test:integration` et `npm test` échouent immédiatement avec un message explicite si `DATABASE_URL_TEST` n'est pas défini ou ne se termine pas par `_test` (ou si `NODE_ENV=production`).
- `npm run test:unit` s'exécute sans aucune connexion MariaDB et passe à 100 %.
- `npm run lint` passe sans erreur et `npm audit --omit=dev` reste à 0 vulnérabilité.
- `.github/workflows/ci.yml` est valide et prêt à exécuter lint, audit, tests unitaires et tests d'intégration MariaDB.

## Vérifications de l'utilisateur

- Exécuter la vérification SQL en production pour confirmer l'absence du compte `TEST_ADMIN_USER` dans la table `Staff`.
- Vérifier en local (avec une base `fabtrack_test` dédiée dans `DATABASE_URL_TEST`) ou sur GitHub Actions que la suite d'intégration et le pipeline CI passent au vert.

