---
id: A-035
type: tester
titre: "Vérifier le masquage des piles d'appels et messages internes sur erreur serveur hors développement"
element: R-020
statut: a-faire
cree: 2026-11-22
par: agent
fait:
---

Où : sur l'instance de test/staging démarrée sans NODE_ENV=development (ou avec NODE_ENV=production). Quoi faire : provoquer ou observer une erreur 500 serveur. Quoi observer : la page d'erreur (ou réponse JSON) affiche uniquement le message générique en français sans stack trace ni requête Prisma, tandis que la stack reste dans les logs serveur. Quoi répondre : confirmer OK ou signaler une fuite d'information.
