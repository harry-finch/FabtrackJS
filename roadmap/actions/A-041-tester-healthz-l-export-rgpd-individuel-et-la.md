---
id: A-041
type: tester
titre: "Tester /healthz, l'export RGPD individuel et la simulation d'anonymisation CLI"
element: R-025
statut: a-faire
cree: 2026-11-22
par: agent
fait:
---

Où : sur l'instance de test (port 8080). Quoi faire : exécuter 'curl -i http://localhost:8080/healthz', télécharger l'export JSON sur '/users/<id>/export-rgpd' en tant qu'admin, puis lancer 'npm run rgpd:anonymize -- --dry-run'. Quoi observer : /healthz retourne 200 { status: 'ok', db: 'ok' }, le JSON RGPD téléchargé ne contient aucun token interne ni RFID en clair, et la simulation CLI liste proprement les comptes inactifs sans rien modifier. Quoi répondre : confirmer OK ou signaler une anomalie.
