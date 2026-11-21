---
id: A-013
type: tester
titre: "Vérifier le verrouillage de /setup sur instance installée"
element: R-009
statut: a-faire
cree: 2026-11-21
par: agent
fait:
---

Vérifier que GET /setup redirige vers /login et que POST /setup (Accept: application/json) retourne HTTP 403 ALREADY_INSTALLED sur une instance déjà initialisée.
