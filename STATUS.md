# État du projet

**Jalon** : **v1.0 — Suivi machines NFC, finitions & v1**, livrée (`2026-10-29`).
`v0.1`, `v0.2` et `v1.0` validées par l'utilisateur (`2026-11-21`). Suite : voir [ROADMAP.md](ROADMAP.md).

| Élément | État |
| --- | --- |
| Application | Plateforme Express / Prisma v7 complète : kiosque, suivi utilisateurs/machines NFC, prêts, pannes, i18n CSV, statistiques NL2SQL et plugins (`R-001` à `R-003`). |
| Tests | `DATABASE_URL="" npm run test:unit` (`2026-11-21`) : 18/18 suites unitaires pures passées, 259/259 tests passés sans connexion MariaDB (dont 6 tests de non-régression `R-017` : e-mail d'avertissement, KPI Sorbonne par date & `toggleSettled`, `KEEP_STATUS`/alerte stock inventaire, fiches usagers, stats/maintenances machines, fraîcheur BookStack). |
| Vérifié | Suite unitaire pure Jest (`npm run test:unit`), `npm run lint` (ESLint 0 erreur), `npm audit --omit=dev` (0 vulnérabilité), chargement `app.js`, contrôle feuille de route (`fabboard roadmap lint`). |
| Non vérifié | Suite d'intégration complète (`npm run test:integration` sur base `_test` MariaDB dédiée) et parcours manuel dans le navigateur lors de cette session. |

## Points ouverts

- Aucun point bloquant ouvert. En production, vérifier la check-list cumulative dans [docs/MISE_A_JOUR_PROD.md](docs/MISE_A_JOUR_PROD.md) (`R-012` `SECRET`, `R-014` SQL `Session` + index + `prisma generate`, `R-016` `DATABASE_URL_AI_RO` si l'assistant IA est activé).

## À suivre

- `R-004` à `R-010` (`v1.1`), `R-011` à `R-014` (`v1.2`) et `R-015` à `R-017` (`v1.3`) implémentés et passés à `a-tester` (actions `A-002` à `A-029`) ; procédure cumulative de déploiement maintenue dans [docs/MISE_A_JOUR_PROD.md](docs/MISE_A_JOUR_PROD.md).
- Éléments suivants (`R-018` à `R-033`, statut `idee`, jalons `v1.3` à `v1.5`) issus de l'audit technique `AUDIT-01` et des propositions UX/UI validées pour `v1.5` (`R-031`, `R-032`, `R-033`), prêts à être spécifiés. Voir [ROADMAP.md](ROADMAP.md).
