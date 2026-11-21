---
id: A-004
type: tester
titre: "Tester les uploads sécurisés en local (/report-issue, machines, settings)"
element: R-005
statut: a-faire
cree: 2026-11-21
par: agent
fait:
---

Lancer npm run dev (http://localhost:8080). Sur /report-issue, une fiche machine (/admin/machines/manage) et /admin/settings : 1) vérifier qu'une vraie image JPG/PNG s'uploade et s'affiche ; 2) renommer un fichier .html en .jpg (ou envoyer un .svg) et vérifier qu'il est rejeté avec un message clair sans erreur 500 ni fichier résiduel dans uploads/ ; 3) remplacer ou réinitialiser le logo/favicon et vérifier que l'ancien fichier est supprimé de uploads/.
