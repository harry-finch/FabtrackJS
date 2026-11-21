---
id: A-005
type: tester
titre: "Auditer le dossier uploads/ en production après déploiement R-005"
element: R-005
statut: a-faire
cree: 2026-11-21
par: agent
fait:
---

Après déploiement (voir docs/MISE_A_JOUR_PROD.md section R-005), exécuter : find uploads/ -type f ! \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' -o -iname '*.gif' -o -iname '*.ico' \) et vérifier qu'aucun fichier suspect (.html, .js, .svg non maîtrisé) n'y est présent.
