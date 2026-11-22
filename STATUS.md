# État du projet

**Jalon** : **v1.0 — Suivi machines NFC, finitions & v1**, livrée (`2026-10-29`).
`v0.1`, `v0.2` et `v1.0` validées par l'utilisateur (`2026-11-21`). Suite : voir [ROADMAP.md](ROADMAP.md).

| Élément | État |
| --- | --- |
| Application | Plateforme Express / Prisma v7 complète : kiosque, suivi utilisateurs/machines NFC, prêts, pannes, i18n CSV, statistiques NL2SQL et plugins (`R-001` à `R-003`). |
| Tests | `DATABASE_URL="" npm run test:unit` (`2026-11-22`) : 25/25 suites unitaires pures passées, 339/339 tests passés sans connexion MariaDB (dont 9 tests `R-024` : CSP stricte à nonce sans `unsafe-inline`, 0 `on*=` dans `views/`, services factorisés consommables/prêts/CSV/CRUD). |
| Vérifié | Suite unitaire pure Jest (`npm run test:unit`), `npm run lint` (ESLint 0 erreur), `npm audit --omit=dev` (0 vulnérabilité), `npx prisma validate` & `npx prisma generate`, synchronisation `prisma/schema.sql`, chargement `app.js`, contrôle feuille de route (`fabboard roadmap lint`). |
| Non vérifié | Suite d'intégration complète (`npm run test:integration` sur base `_test` MariaDB dédiée) et exécution `npm run db:migrate` sur base MariaDB/NetBSD réelle. |

## Points ouverts

- Aucun point bloquant ouvert. En production, vérifier la check-list cumulative dans [docs/MISE_A_JOUR_PROD.md](docs/MISE_A_JOUR_PROD.md) (`R-012` `SECRET`, `R-016` `DATABASE_URL_AI_RO` si IA activée, `R-021` `APP_TIMEZONE`, `R-022` `npm install --omit=dev`, `R-023` `npm run db:migrate` + `npx prisma generate`).

## À suivre

- `R-004` à `R-010` (`v1.1`), `R-011` à `R-014` (`v1.2`), `R-015` à `R-020` (`v1.3`) et `R-021` à `R-024` (`v1.4`) implémentés et passés à `a-tester` (actions `A-002` à `A-040`) ; procédure cumulative de déploiement maintenue dans [docs/MISE_A_JOUR_PROD.md](docs/MISE_A_JOUR_PROD.md).
- Éléments suivants (`R-025` à `R-033`, statut `idee`, jalons `v1.4` à `v1.5`) issus de l'audit technique `AUDIT-01` et des propositions UX/UI validées pour `v1.5` (`R-031`, `R-032`, `R-033`), prêts à être spécifiés. Voir [ROADMAP.md](ROADMAP.md).
