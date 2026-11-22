---
id: A-043
type: tester
titre: "Valider les modales Bootstrap, les toasts propres et /report-issue (R-027)"
element: R-027
statut: a-faire
cree: 2026-11-22
par: agent
fait:
---

1. Cliquer sur une action destructive [data-confirm] en admin (ex. suppression catégorie) et vérifier que la modale Bootstrap s'ouvre en thème clair et sombre, qu'Échap annule sans soumettre et que Confirmer soumet correctement.
2. Déclencher une notification (succès/erreur/avertissement) et vérifier que le toast n'affiche plus le préfixe brut 'Success:'/'Error:'/'Warning:'.
3. Soumettre un fichier invalide ou un formulaire incomplet sur /report-issue et vérifier que la bannière d'erreur s'affiche puis disparaît au rechargement.
4. Vérifier /login (absence de la case morte 'Se souvenir de moi') et /fabtrack ('Tester un badge' RFID ouvre la modale de saisie Bootstrap).
