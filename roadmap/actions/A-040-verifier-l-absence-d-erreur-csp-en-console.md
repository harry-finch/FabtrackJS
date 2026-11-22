---
id: A-040
type: tester
titre: "Vérifier l'absence d'erreur CSP en console navigateur sur kiosque et écrans admin"
element: R-024
statut: a-faire
cree: 2026-11-22
par: agent
fait:
---

Où : sur l'instance de test avec la console DevTools ouverte (kiosque /fabtrack, /users/manage, /admin/settings, /admin/emails, /admin/machines/manage, /admin/warningtypes/manage, /admin/communication, /admin/statistics, /setup). Quoi faire : cliquer sur les tris de tableaux, les filtres, les boutons d'édition/annulation, le sélecteur d'icônes et les modales. Quoi observer : zéro blocage Content-Security-Policy dans la console et interactions fonctionnelles. Quoi répondre : confirmer OK ou signaler l'écran/interaction bloqué.
