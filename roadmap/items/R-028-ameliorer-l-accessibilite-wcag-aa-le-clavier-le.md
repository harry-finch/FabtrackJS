---
id: R-028
titre: "Améliorer l'accessibilité WCAG AA, le clavier, le mode sombre et le tactile"
resume: "Corriger <html lang>, ajouter les 65 labels manquants, réparer les contrastes mode sombre et la navigation clavier des tableaux."
statut: a-tester
jalon: v1.5
cree: 2026-11-21
maj: 2026-11-22
livree:
---

## Objectif

Amener FabtrackJS au niveau WCAG 2.1 AA sur les parcours clés (kiosque, administration, signalement public, authentification) : attribut `<html lang>` dynamique, 0 contrôle de formulaire sans nom accessible, contrastes cohérents en mode sombre (y compris graphiques Chart.js), navigation clavier complète sur les tableaux triables et cartes cliquables, liens `target="_blank"` sécurisés et cibles tactiles ≥ 44×44 px sur le kiosque.

## Contexte et motivation

- **Source :** `AUD-029` (Opus #28).
- Les 43 vues EJS déclarent un `<html lang="en">` ou `<html lang="fr">` figé au lieu de refléter `currentLocale`.
- Plusieurs dizaines de contrôles de formulaire (interrupteurs, champs de recherche, filtres de dates, sélecteurs) n'ont ni `<label for>` ni `aria-label`.
- `public/stylesheets/main.css` utilise une variable Bootstrap inexistante (`var(--bs-body-tertiary-bg)` au lieu de `var(--bs-tertiary-bg)`), et 13 vues contiennent des classes `bg-light`/`bg-white`/`text-dark` cassant la lisibilité en mode sombre.
- `views/admin/manage-statistics.ejs` calcule les couleurs Chart.js une seule fois au chargement et ne réagit pas au changement de thème.
- Les en-têtes `th[data-sort]` ne sont pas accessibles au clavier (`tabindex`, `role="button"`, `aria-sort`, `Enter`/`Space`) et `main.js` ne transmet pas la table cible sur les pages multi-tableaux.
- 9 liens `target="_blank"` n'ont pas `rel="noopener noreferrer"`.

## Comportement attendu

1. **Attribut `<html lang>` dynamique :** toutes les vues HTML/EJS rendent `<html lang="<%= typeof currentLocale !== 'undefined' ? currentLocale : 'fr' %>" ...>`.
2. **Noms accessibles sur tous les contrôles de formulaire :** chaque `<input>`, `<select>` et `<textarea>` visible possède un `<label for="...">` associé ou un `aria-label` explicite (les champs honeypot cachés ont `aria-hidden="true" tabindex="-1"`).
3. **Mode sombre & contrastes WCAG AA :**
   - `public/stylesheets/main.css` corrige `var(--bs-body-tertiary-bg)` → `var(--bs-tertiary-bg)` et ajoute un indicateur `:focus-visible` nettement visible.
   - Remplacement des surfaces figées `bg-light`/`bg-white`/`text-dark` par les utilitaires adaptatifs Bootstrap 5.3 (`bg-body-tertiary`, `bg-body`, `text-body`, `text-body-emphasis`) tout en conservant un contraste ≥ 4,5:1 sur les badges colorés (`bg-warning-subtle text-warning-emphasis`, etc.).
   - `public/javascripts/color-mode-toggler.js` émet un événement `fabtrack:themechange` écouté par `views/admin/manage-statistics.ejs` pour mettre à jour en direct tous les graphiques Chart.js.
4. **Navigation clavier & multi-tableaux :**
   - `public/javascripts/table-sorting.js` initialise `tabindex="0"`, `role="button"`, `aria-sort="none"` sur chaque `th[data-sort]`, met à jour `aria-sort` (`ascending`/`descending`), répond à `Enter` et `Space`, évite le double déclenchement avec `main.js`, et trie toujours la table parente (`th.closest("table")`).
   - Les cartes cliquables (`.action-card[data-radio-target]`, bascule kiosque `#registerbutton`) sont accessibles au clavier (`tabindex="0"`, `role="button"`, `Enter`/`Space`).
5. **Liens externes & tactile :**
   - Tous les liens `target="_blank"` portent `rel="noopener noreferrer"`.
   - Les boutons d'action principaux et contrôles tactiles du kiosque respectent une zone tactile minimale de 44×44 px.

## Plan technique

- Mettre à jour `public/stylesheets/main.css`, `public/javascripts/color-mode-toggler.js`, `public/javascripts/table-sorting.js`, `public/javascripts/main.js`.
- Mettre à jour `views/includes/inventory-checkout-modal.html` et la gestion thème Chart.js dans `views/admin/manage-statistics.ejs`.
- Balayer l'ensemble des 43 vues EJS et partials (`views/admin/`, `views/fabtrack/`, `views/includes/`, `views/index/`, `views/public/`, `views/setup/`, `views/errors/`) pour `<html lang>`, labels/aria-label, classes mode sombre et `rel="noopener noreferrer"`.
- Ajouter la suite de tests unitaires `tests/unit/accessibilityDarkModeR028.test.js`.

## Critères d'acceptation

- 0 vue avec `<html lang="en">` ou `<html lang="fr">` codé en dur.
- 0 contrôle de formulaire visible sans `<label for>` ni `aria-label` ni `aria-labelledby`.
- 0 occurrence de `--bs-body-tertiary-bg` dans `public/stylesheets/main.css`.
- 0 lien `target="_blank"` sans `rel="noopener noreferrer"`.
- Les en-têtes `th[data-sort]` gèrent `tabindex="0"`, `role="button"`, `aria-sort`, `Enter`/`Space` et le tri multi-tableaux.
- Les graphiques Chart.js de `/admin/statistics` se mettent à jour sur `fabtrack:themechange`.
- `npm run lint`, `npm audit --omit=dev`, `DATABASE_URL="" npm run test:unit` et `fabboard roadmap lint` passent sans erreur.

## Risques et points de vigilance

- Ne jamais introduire d'attribut `on*=` inline ni de `<script>` sans `nonce` (CSP stricte `R-024`).
- Préserver la compatibilité `stabilityR008.test.js` (un seul listener `click` et `submit` dans `main.js`) et la validité des icônes FontAwesome (`assetsAndIconsR010.test.js`).
