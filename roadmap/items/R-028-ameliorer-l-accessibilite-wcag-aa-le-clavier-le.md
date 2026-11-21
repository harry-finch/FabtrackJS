---
id: R-028
titre: "Améliorer l'accessibilité WCAG AA, le clavier, le mode sombre et le tactile"
resume: "Corriger <html lang>, ajouter les 65 labels manquants, réparer les contrastes mode sombre et la navigation clavier des tableaux."
statut: idee
jalon: v1.5
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** `AUD-029` (Opus #28)
- **Fichiers principaux :** 43 vues EJS, `public/stylesheets/main.css:2,23`, `public/javascripts/table-sorting.js`, `views/admin/manage-statistics.ejs:557-561`, `views/includes/inventory-checkout-modal.html`
- **Périmètre envisagé :**
  - Passer `<html lang="<%= currentLocale %>">` dynamique sur les 43 vues.
  - Ajouter les 65 `<label for>` / `aria-label` manquants sur les switches, filtres et champs de recherche.
  - Corriger `var(--bs-body-tertiary-bg)` → `var(--bs-tertiary-bg)` et remplacer les 45 classes `bg-light`/`bg-white`/`text-dark` cassant le mode sombre.
  - Rafraîchir les couleurs Chart.js au changement de thème.
  - Rendre accessibles au clavier les en-têtes triables (`tabindex`, `role="button"`, `aria-sort`, `Enter`/`Space`, fix multi-tableaux) et les cartes cliquables.
  - Ajouter `rel="noopener noreferrer"` sur les 17 `target="_blank"` et vérifier les cibles tactiles ≥ 44×44 px sur le kiosque.
- **Arbitrages & dépendances :** Aucune.
- **Critères d'acceptation visés :** Contraste ≥ 4,5:1 en mode sombre ; parcours clés accessibles au clavier ; 0 contrôle de formulaire sans nom accessible.
