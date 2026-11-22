---
id: A-042
type: tester
titre: "Vérifier le fonctionnement hors-ligne (0 requête CDN) sur kiosque, statistiques et 404"
element: R-026
statut: a-faire
cree: 2026-11-22
par: agent
fait:
---

Où : kiosque /fabtrack, /admin/statistics et une URL inexistante (/introuvable), onglet Réseau DevTools ouvert. Quoi faire : recharger chaque écran (idéalement sans accès Internet ou en bloquant jsdelivr/cdnjs). Quoi observer : zéro requête vers un CDN externe, Bootstrap/FontAwesome/Chart.js servis depuis /vendor/* et page 404 légère avec illustration SVG. Quoi répondre : confirmer OK ou signaler un asset manquant.
