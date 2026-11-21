---
id: A-007
type: tester
titre: "Vérifier le comportement Fail-Closed de /api/machines/* en production"
element: R-006
statut: a-faire
cree: 2026-11-21
par: agent
fait:
---

Après déploiement, contrôler avec curl que GET /api/machines/usage?machineId=1 sans en-tête x-api-key retourne HTTP 401 Unauthorized, et vérifier la configuration FABTRACK_API_KEY / api_machine_token avant d'activer un client NFC externe.
