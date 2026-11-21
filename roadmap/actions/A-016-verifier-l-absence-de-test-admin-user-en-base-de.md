---
id: A-016
type: tester
titre: "Vérifier l'absence de TEST_ADMIN_USER en base de production (R-011)"
element: R-011
statut: a-faire
cree: 2026-11-21
par: agent
fait:
---

Exécuter la requête SQL sur Staff (docs/MISE_A_JOUR_PROD.md, section R-011) pour confirmer qu'aucun compte TEST_ADMIN_USER ou @test-fabtrack.local n'existe en production.
