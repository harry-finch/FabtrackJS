---
id: A-049
type: tester
titre: "Valider le Cockpit d'administration et le menu latéral persistant filtrable (R-033)"
element: R-033
statut: a-faire
cree: 2026-11-22
par: agent
fait:
---

1. Ouvrir /admin en tant qu'administrateur : vérifier le nouveau Cockpit (4 KPI cliquables, section 'À traiter aujourd'hui' et 4 raccourcis rapides) ainsi que la disparition du mur de 25 cartes.
2. Naviguer vers plusieurs sous-pages (/admin/statistics, /admin/machines/manage, /admin/settings, /users/manage) et vérifier que le menu latéral persistant reste visible, met en évidence la route active et ouvre automatiquement 'Configuration & Référentiels' lors d'une recherche dans 'Filtrer le menu…'.
3. Désactiver un plugin dans /admin/settings et vérifier qu'il disparaît du groupe 'Extensions actives' dans le menu latéral.
4. Réduire la fenêtre (< 992 px) et vérifier le tiroir mobile offcanvas ('Menu administration') au clavier et au tactile.
