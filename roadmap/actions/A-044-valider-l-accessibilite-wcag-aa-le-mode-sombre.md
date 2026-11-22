---
id: A-044
type: tester
titre: "Valider l'accessibilité WCAG AA, le mode sombre Chart.js et la navigation clavier (R-028)"
element: R-028
statut: a-faire
cree: 2026-11-22
par: agent
fait:
---

1. Passer le site en thème sombre et vérifier le contraste sur le kiosque, /admin/manage-emails, /admin/view-machine, /admin/manage-statistics (basculer clair <-> sombre en direct sur les graphiques Chart.js sans recharger).
2. Naviguer au clavier (Tab, Entrée, Espace) sur un tableau triable (ex. /admin/users, /admin/machines), vérifier la mise à jour d'aria-sort et le tri multi-tableaux.
3. Basculer la langue FR <-> EN et vérifier que l'attribut <html lang=...> change dynamiquement.
4. Sur borne tactile ou vue mobile, vérifier les cibles tactiles du kiosque et les modales d'inventaire au clavier.
