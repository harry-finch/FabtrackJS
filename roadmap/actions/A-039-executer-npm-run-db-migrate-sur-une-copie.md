---
id: A-039
type: tester
titre: "Exécuter npm run db:migrate sur une copie anonymisée (y compris NetBSD)"
element: R-023
statut: a-faire
cree: 2026-11-22
par: agent
fait:
---

Où : sur une copie anonymisée de la base MariaDB (avec DATABASE_URL configuré). Quoi faire : lancer 'npm run db:migrate -- --status', puis 'npm run db:migrate -- --dry-run', puis 'npm run db:migrate' et 'npx prisma generate'. Quoi observer : les migrations 001 à 004 s'appliquent sans perte de données, la table _schema_version enregistre les 4 versions, et les colonnes Activity.machineId/consumableId/equipmentId sont remplies. Quoi répondre : confirmer OK ou noter l'erreur SQL éventuelle.
