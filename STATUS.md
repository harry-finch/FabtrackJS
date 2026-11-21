# État du projet

**Jalon** : **v1.0 — Suivi machines NFC, finitions & v1**, livrée (`2026-10-29`).
`v0.1`, `v0.2` et `v1.0` validées par l'utilisateur (`2026-11-21`). Suite : voir [ROADMAP.md](ROADMAP.md).

| Élément | État |
| --- | --- |
| Application | Plateforme Express / Prisma v7 complète : kiosque, suivi utilisateurs/machines NFC, prêts, pannes, i18n CSV, statistiques NL2SQL et plugins (`R-001` à `R-003`). |
| Tests | `npx jest tests/unit/ --runInBand --forceExit` (`2026-11-21`) : 10/10 suites passées, 123/123 tests passés (dont tests isolés `R-004` et `R-005`). |
| Vérifié | Suite unitaire Jest (`tests/unit/` en `--runInBand`), génération client Prisma (`npx prisma generate`), compilation EJS + chargement `app.js` / routes modifiées, contrôle feuille de route (`fabboard roadmap lint`). |
| Non vérifié | Suite d'intégration complète (`npm test` avec base MariaDB/MySQL) et parcours manuel dans le navigateur lors de cette session. |

## Points ouverts

- `tests/unit/inventoryService.test.js` : cause racine identifiée de l'échec intermittent (`restoreEquipment()`, `Équipement introuvable (#224)`) lors d'exécutions parallèles sans `--runInBand` (collision SQL `LIKE 'TEST_%'` avec `rfidPlugin.test.js`) ; correction et isolation de la base de test suivies dans `R-011`.

## À suivre

- `R-004` et `R-005` (`v1.1`) implémentés et passés à `a-tester` (actions `A-002` à `A-005`) ; procédure cumulative de déploiement maintenue dans [docs/MISE_A_JOUR_PROD.md](docs/MISE_A_JOUR_PROD.md).
- Éléments suivants (`R-006` à `R-033`, statut `idee`, jalons `v1.1` à `v1.5`) issus de l'audit technique `AUDIT-01` et des propositions UX/UI validées pour `v1.5` (`R-031`, `R-032`, `R-033`), prêts à être spécifiés. Voir [ROADMAP.md](ROADMAP.md).
