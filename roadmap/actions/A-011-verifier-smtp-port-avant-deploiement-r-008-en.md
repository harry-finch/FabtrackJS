---
id: A-011
type: tester
titre: "Vérifier SMTP_PORT avant déploiement R-008 en production"
element: R-008
statut: a-faire
cree: 2026-11-21
par: agent
fait:
---

Vérifier que le port SMTP de production est configuré via Administration > E-mails ou via SMTP_PORT dans .env (et non plus via PORT) puis tester l'envoi d'un e-mail.
