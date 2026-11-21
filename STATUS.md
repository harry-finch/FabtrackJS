# État du projet

**Jalon** : **v1.0 — Suivi machines NFC, finitions & v1**, livrée (`2026-10-29`).
`v0.1`, `v0.2` et `v1.0` validées par l'utilisateur (`2026-11-21`). Suite : voir [ROADMAP.md](ROADMAP.md).

| Élément | État |
| --- | --- |
| Application | Plateforme Express / Prisma v7 complète : kiosque, suivi utilisateurs/machines NFC, prêts, pannes, i18n CSV, statistiques NL2SQL et plugins (`R-001` à `R-003`). |
| Tests | `npx jest tests/unit/ --forceExit` (`2026-11-21`) : 7/8 suites passées, 94/95 tests passés (1 échec : `tests/unit/inventoryService.test.js` → `restoreEquipment()`). |
| Vérifié | Suite unitaire Jest (`tests/unit/`), contrôle feuille de route (`fabboard roadmap lint`). |
| Non vérifié | Suite d'intégration complète (`npm test` avec base MariaDB/MySQL) et parcours manuel dans le navigateur lors de cette session. |

## Points ouverts

- `tests/unit/inventoryService.test.js` : échec sur `restoreEquipment()` (`Équipement introuvable (#224)`).

## À suivre

- Aucun élément restant dans `roadmap/` pour l'instant (nouveaux jalons à ajouter).
