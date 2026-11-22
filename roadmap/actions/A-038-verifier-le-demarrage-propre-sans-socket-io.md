---
id: A-038
type: tester
titre: "Vérifier le démarrage propre sans socket.io après npm install --omit=dev"
element: R-022
statut: a-faire
cree: 2026-11-22
par: agent
fait:
---

Où : sur l'instance de test après git pull && npm install --omit=dev. Quoi faire : démarrer FabtrackJS (npm start ou npm run dev), ouvrir le kiosque /fabtrack et quelques pages admin. Quoi observer : démarrage propre sans socket.io, aucune erreur Prisma/pool ni écriture DB intempestive au chargement. Quoi répondre : confirmer OK ou noter l'erreur observée.
