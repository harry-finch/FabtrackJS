---
id: R-026
titre: "Unifier les assets front en local pour un fonctionnement hors-ligne fiable"
resume: "Servir une version unique de Bootstrap et Chart.js depuis node_modules, retirer @docsearch/css et alléger le GIF 404 de 4,6 Mo."
statut: idee
jalon: v1.5
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** `AUD-029` (Opus #17)
- **Fichiers principaux :** `views/includes/pagehead.html`, `views/includes/footer.html`, `views/setup/index.ejs:326`, `views/public/report-issue.ejs:265`, `views/admin/manage-statistics.ejs:12`, `public/images/404.gif`
- **Périmètre envisagé :**
  - Servir une seule version de Bootstrap et une version épinglée de Chart.js depuis `node_modules` sur toutes les vues.
  - Retirer `@docsearch/css@3` inutilisé et les classes mortes `animate__animated`.
  - Remplacer `404.gif` (4,6 Mo) par une alternative WebP/SVG (< 200 Ko) et dédupliquer les favicons/logos inutilisés dans `public/images/`.
- **Arbitrages & dépendances :** Dépend de `R-010` (bascule Font Awesome Free).
- **Critères d'acceptation visés :** 0 CDN non maîtrisé ; page 404 < 300 Ko ; version de Bootstrap homogène sur 100 % des vues.
