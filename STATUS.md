# État du projet

**Jalon** : **v1.0 — Suivi machines NFC, finitions & v1**, livrée (`2026-10-29`).
`v0.1`, `v0.2` et `v1.0` validées par l'utilisateur (`2026-11-21`). Suite : voir [ROADMAP.md](ROADMAP.md).

| Élément | État |
| --- | --- |
| Application | Plateforme Express / Prisma v7 complète : kiosque, suivi utilisateurs/machines NFC, prêts, pannes, i18n CSV, statistiques NL2SQL et plugins (`R-001` à `R-003`). |
| Tests | `DATABASE_URL="" npm run test:unit` (`2026-11-22`) : 32/32 suites unitaires pures passées, 384/384 tests passés sans connexion MariaDB (dont 4 tests `R-031` : bandeau 44 px Option B bleu Sorbonne, disparition `.btn-bd-primary`, contrôles segmentés langue/thème, barre d'état 24 px). |
| Vérifié | Suite unitaire pure Jest (`npm run test:unit`), `npm run lint` (ESLint 0 erreur), `npm audit --omit=dev` (0 vulnérabilité), `npx prisma validate` & `npx prisma generate`, synchronisation `prisma/schema.sql`, chargement `app.js`, contrôle feuille de route (`fabboard roadmap lint`). |
| Non vérifié | Suite d'intégration complète (`npm run test:integration` sur base `_test` MariaDB dédiée) et exécution `npm run db:migrate` sur base MariaDB/NetBSD réelle. |

## Points ouverts

- Aucun point bloquant ouvert. En production, vérifier la check-list cumulative dans [docs/MISE_A_JOUR_PROD.md](docs/MISE_A_JOUR_PROD.md) (`R-012` `SECRET`, `R-016` `DATABASE_URL_AI_RO` si IA activée, `R-021` `APP_TIMEZONE`, `R-022` `npm install --omit=dev`, `R-023` `npm run db:migrate` + `npx prisma generate`, `R-025` `.env.example` & `/healthz`).

## À suivre

- Jalons `v1.1` (`R-004` à `R-010`), `v1.2` (`R-011` à `R-014`), `v1.3` (`R-015` à `R-020`) et **`v1.4` complet (`R-021` à `R-025`)** implémentés et passés à `a-tester` (actions `A-002` à `A-041`) ; procédure cumulative de déploiement maintenue dans [docs/MISE_A_JOUR_PROD.md](docs/MISE_A_JOUR_PROD.md).
- Prochain jalon : **`v1.5`** (`R-026` à `R-033`, statut `idee` : assets front hors-ligne, modales, accessibilité WCAG AA, terminologie/i18n, navigation admin, bandeau supérieur, rafraîchissement kiosque/tableaux et refonte panneau admin). Voir [ROADMAP.md](ROADMAP.md).
