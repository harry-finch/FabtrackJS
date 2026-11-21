---
id: A-003
type: tester
titre: "Appliquer R-004 en production et auditer la table Staff"
element: R-004
statut: a-faire
cree: 2026-11-21
par: agent
fait:
---

Suivre la section R-004 de docs/MISE_A_JOUR_PROD.md : sauvegarde MariaDB, git pull, ALTER TABLE Staff MODIFY COLUMN pwdToken VARCHAR(64) NULL;, npx prisma generate, redémarrage du service, puis audit de la table Staff via SELECT id, name, email, role, approved, createdAt, pwdToken, tokenExpiry FROM Staff ORDER BY id;.
