---
id: A-006
type: tester
titre: "Tester les endpoints API machines/NFC en local"
element: R-006
statut: a-faire
cree: 2026-11-21
par: agent
fait:
---

Vérifier /api/machines/verify-user, /start, /end, /record et /usage : refus 401 sans clé ou avec ?apiKey=, blocage avertissement actif (403 ACTIVE_WARNING), refus si atelier requis non validé (403 MACHINE_ACCESS_DENIED), badge inconnu sur /end sans effet de bord (404 USER_NOT_FOUND) et absence de email/rfid/token dans /usage.
