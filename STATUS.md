# État du projet

**Jalon** : **v1.0 — Suivi machines NFC, finitions & v1**, livrée (`2026-10-29`).
`v0.1`, `v0.2` et `v1.0` validées par l'utilisateur (`2026-11-21`). Suite : voir [ROADMAP.md](ROADMAP.md).

| Élément | État |
| --- | --- |
| Application | Plateforme Express / Prisma v7 complète : kiosque, suivi utilisateurs/machines NFC, prêts, pannes, i18n CSV, statistiques NL2SQL et plugins (`R-001` à `R-003`). |
| Tests | `DATABASE_URL="" npm run test:unit` (`2026-11-21`) : 12/12 suites unitaires pures passées, 184/184 tests passés sans connexion MariaDB ; garde-fou `DATABASE_URL_TEST` vérifié sur `npm run test:integration`. |
| Vérifié | Suite unitaire pure Jest (`npm run test:unit`), `npm run lint` (ESLint 0 erreur), `npm audit --omit=dev` (0 vulnérabilité), garde-fou `DATABASE_URL_TEST`, validation YAML `.github/workflows/ci.yml`, contrôle feuille de route (`fabboard roadmap lint`). |
| Non vérifié | Suite d'intégration complète (`npm run test:integration` sur base `_test` MariaDB dédiée), exécution sur runner GitHub Actions et parcours manuel dans le navigateur lors de cette session. |

## Points ouverts

- Aucun point bloquant ouvert ; l'ancien souci de flakiness (`inventoryService.test.js` / `LIKE 'TEST_%'`) et l'isolation de la base de test sont traités dans `R-011` (`a-tester`).

## À suivre

- `R-004` à `R-010` (`v1.1`) et `R-011` (`v1.2`) implémentés et passés à `a-tester` (actions `A-002` à `A-017`) ; procédure cumulative de déploiement maintenue dans [docs/MISE_A_JOUR_PROD.md](docs/MISE_A_JOUR_PROD.md).
- Éléments suivants (`R-012` à `R-033`, statut `idee`, jalons `v1.2` à `v1.5`) issus de l'audit technique `AUDIT-01` et des propositions UX/UI validées pour `v1.5` (`R-031`, `R-032`, `R-033`), prêts à être spécifiés. Voir [ROADMAP.md](ROADMAP.md).
