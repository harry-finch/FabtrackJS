---
id: A-046
type: tester
titre: "Valider la navigation admin et la compatibilité sous-chemin APP_BASE_PATH (R-030)"
element: R-030
statut: a-faire
cree: 2026-11-22
par: agent
fait:
---

1. Démarrer FabtrackJS avec APP_BASE_PATH='/fabtrack' derrière un reverse proxy (ou vérifier le rendu des liens dans l'inspecteur) et parcourir /fabtrack, /admin, les sous-pages admin, /report-issue/:id, /login, /register, /forgot : aucune requête vers la racine / et aucune 404.
2. Se connecter avec un compte rôle 'staff' (borne kiosque) et vérifier que le bouton et la modale Sortie d'inventaire ne sont pas présents dans le DOM.
3. Vérifier la cohérence des boutons de retour '/admin' sur les sous-pages d'administration.
