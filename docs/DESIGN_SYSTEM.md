# Règles UX/UI & Design System — FabtrackJS (Option B)

Ce document définit les règles de conception, de mise en page et de qualité d'interface applicables à **toutes les vues EJS/HTML et feuilles CSS** de FabtrackJS. Toute nouvelle vue ou modification d'écran doit respecter ce contrat, vérifié automatiquement par [uiDesignSystemGuards.test.js](../tests/unit/uiDesignSystemGuards.test.js).

---

## 1. Philosophie visuelle & jetons CSS

FabtrackJS suit une esthétique **sobre, dense et fonctionnelle** inspirée du Fab Design System (Option B), pensée pour un usage quotidien sur borne kiosque et en administration :

- **Couleur d'identité :** Bleu Sorbonne (`--fab-identity`: `#1e52b6` en clair, `#4c8df5` en sombre).
- **Surfaces hiérarchisées** définies dans [public/stylesheets/main.css](../public/stylesheets/main.css) :
  - `--fab-bg-chrome` : barres de structure (en-têtes de tableau, topbar, statusbar).
  - `--fab-bg-workspace` : fond principal de page (`overflow-x: clip` sur `html, body`).
  - `--fab-bg-panel` : fond des cartes, formulaires et tableaux.
  - `--fab-bg-control` : fond neutre des contrôles, icônes KPI et badges informatifs.
  - `--fab-border` / `--fab-divider` : filets nets de `1 px` (toujours lisibles en mode clair comme en mode sombre).
- **Discipline colorimétrique :** la couleur est **sémantique**, jamais décorative :
  - **Neutre par défaut** : en-têtes, icônes secondaires, boutons d'action au repos, cartes KPI informatives, badges de catégorie/compteur.
  - **Rouge (`danger`)** : erreur bloquante, rupture de stock, panne machine ouverte, emprunt en retard, solde débiteur, action destructive (au survol).
  - **Ambre (`warning`)** : stock faible, élément en attente de régularisation/signature, avertissement actif.
  - **Vert (`success`)** : état nominal validé (en stock, réglé, charte signée, présent, en ligne).
- **Chiffres alignés :** utiliser la classe `.tabular-nums` sur tous les compteurs, montants, dates et indicateurs numériques.
- **Mode clair / sombre :** utiliser exclusivement les variables CSS (`--fab-*`, `--bs-*`) et classes adaptatives (`bg-body`, `bg-body-tertiary`, `bg-body-secondary`, `text-body`, `text-muted`). **Interdiction absolue** de `bg-light`, `bg-white`, `text-dark`.

---

## 2. Structure HTML, `<title>` et balise `<main>`

1. **Langue dynamique :** `<html lang="<%= typeof currentLocale !== 'undefined' ? currentLocale : 'fr' %>" data-bs-theme="auto">`.
2. **Format unique de `<title>` :**
   ```html
   <title>Titre de la page • <%= typeof platformName !== 'undefined' && platformName ? platformName : 'FabtrackJS' %></title>
   ```
   Ne jamais coder `Fabtrack - ...` en dur.
3. **Classes `<body>` standard :**
   - Pages avec `header.html` + `footer.html` : `<body class="d-flex justify-content-center bg-body-tertiary py-4">`
   - Pages autonomes centrées (Auth, 404, Erreur, Charte, Setup) : `<body class="d-flex justify-content-center align-items-center min-vh-100 bg-body-tertiary py-4">`
   - Page publique formulaire (`report-issue`) : `<body class="bg-body-tertiary py-4">`
4. **Règle critique `</main>` :**
   - [views/includes/footer.html](../views/includes/footer.html) ferme déjà la coquille admin (`</div></div>`) **et** la balise `</main>`.
   - Toute page incluant `footer.html` ouvre `<main class="main-container">` (ou `<main class="form-signin ...">`) et **ne doit jamais ajouter un second `</main>`**.
   - Seules les pages sans `footer.html` (`views/setup/index.ejs`, `views/public/report-issue.ejs`) ferment leur propre `</main>`.
5. **Hiérarchie de titres :**
   - **Exactement un `<h1>` visible par page** (jamais de `<h1>` dans une modale ; ne jamais démarrer directement par `<h4>`).
   - Enchaîner proprement `<h1>` → `<h2>` (titres de sections/cartes) → `<h3>` (sous-sections).

---

## 3. Chrome global & en-têtes de pages

### Barre supérieure, barre d'état et sidebar admin
- **Topbar (`44 px`)** ([header.html](../views/includes/header.html)) : identité compacte, sélecteur d'espace, navigation Kiosque/Administration, actions rapides (icônes + infobulles), sélecteur de langue segmenté, **switch de thème segmenté par icônes uniquement** (avec `title` et `aria-label`), menu utilisateur.
- **Statusbar (`24 px`)** ([footer.html](../views/includes/footer.html)) : espace actif, état RFID, statut temps réel SSE, version et licence MIT.
- **Sidebar admin persistante (`240 px`)** ([admin-sidebar.html](../views/includes/admin-sidebar.html)) : navigation filtrable avec compteurs en cache ; seules ses micro-pastilles de compteurs utilisent un arrondi circulaire.

### En-tête de page standard (`.fab-page-header`)
Toutes les pages d'administration et la fiche contributeur utilisent l'en-tête sobre issu du cockpit :

```html
<div class="fab-page-header">
  <div>
    <div class="d-flex flex-wrap align-items-center gap-2">
      <h1 class="fab-page-title">Titre de la page</h1>
      <span class="badge bg-body-secondary text-secondary-emphasis border tabular-nums">42 éléments</span>
    </div>
    <p class="fab-page-subtitle">Description concise du rôle de l'écran</p>
  </div>
  <div class="fab-page-actions">
    <a href="..." class="btn btn-outline-secondary btn-sm">Action secondaire</a>
    <button type="button" class="btn btn-primary btn-sm">Action principale</button>
  </div>
</div>
```

- **Pas de grosse carte-bannière** (`card border-0 shadow-sm`) ni d'icône circulaire `48 px` en haut de page.
- **Pas de bouton « Retour panneau admin »** sur les pages déjà accessibles via la sidebar persistante.
- **Bouton de retour contextuel autorisé uniquement** sur les sous-pages de détail, d'édition ou d'import (`edit-machine`, `view-machine`, `edit-staff`, `import-history`), pointant vers la liste parente (ex. `admin/machines/manage`, `admin/staff/manage`, `admin/view-history`).

---

## 4. Géométrie des boutons & badges

- **Rayon unique Option B (`4 px`) :**
  - **Zéro `rounded-pill`** sur les boutons, badges, champs de recherche, liens ou alertes (seules les micro-pastilles de la sidebar `.fab-sb-badge` sont rondes).
- **Hiérarchie dans une barre d'actions :**
  - **Au maximum un bouton `btn-primary btn-sm`** (l'action principale de création ou d'enregistrement).
  - Toutes les actions secondaires utilisent `btn-outline-secondary btn-sm` (éviter les barres d'outils multicolores combinant `btn-warning`, `btn-outline-success`, `btn-outline-info`, etc.).
- **Style des badges :**
  - Toujours utiliser des **badges subtils bordés**, jamais de badges pleins saturés (`bg-success`, `bg-danger`, `bg-primary`, `bg-info`, `bg-secondary` nus) :
    - Neutre / catégorie / compteur : `badge bg-body-secondary text-secondary-emphasis border`
    - Succès : `badge bg-success-subtle text-success border border-success-subtle`
    - Alerte / attente : `badge bg-warning-subtle text-warning-emphasis border border-warning-subtle`
    - Erreur / critique : `badge bg-danger-subtle text-danger border border-danger-subtle`

---

## 5. Cartes, barres de filtres & KPI

- **Cartes standard :** toujours `card border` (rayon `6 px`, filet `1 px var(--fab-border)`). Ne plus utiliser `card border-0 shadow-sm` (qui disparaît visuellement en mode sombre).
- **Barres de filtres :** utiliser `<div class="fab-filter-bar">` contenant le formulaire ou les boutons de filtrage (`btn-sm btn-outline-secondary`).
- **Gabarit unique de carte KPI (`.fab-kpi-card`) :**
  ```html
  <div class="card h-100 fab-kpi-card <%= alertCount > 0 ? 'border-danger' : '' %>">
    <div class="card-body p-3 d-flex align-items-center justify-content-between gap-3">
      <div>
        <div class="small text-muted fw-semibold">Libellé KPI</div>
        <div class="kpi-value tabular-nums <%= alertCount > 0 ? 'text-danger' : 'text-body' %> mt-1"><%= alertCount %></div>
        <div class="small text-muted mt-1">Sous-libellé concis</div>
      </div>
      <span class="fab-kpi-icon <%= alertCount > 0 ? 'bg-danger-subtle text-danger border-danger-subtle' : '' %>" aria-hidden="true">
        <i class="fa-solid fa-triangle-exclamation"></i>
      </span>
    </div>
  </div>
  ```
  - L'icône KPI (`.fab-kpi-icon`) est un carré doux `38×38 px` neutre par défaut ; elle ne prend une teinte d'alerte (`danger` / `warning`) que lorsque le compteur signale une situation à traiter (`> 0`).
- **Séparation de sections :** utiliser `.fab-section-header` + `<h2 class="fab-section-title">` pour marquer nettement deux blocs fonctionnels distincts (ex. formulaire vs statistiques sur la fiche profil).

---

## 6. Tableaux & actions de ligne

- **Curseur de tri honnête :** seuls les `<th data-sort="...">` (ou `th[onclick]`) affichent `cursor: pointer`. Les en-têtes non triables conservent le curseur par défaut.
- **Colonne unique `Actions` :**
  - Ne jamais dédier une colonne par bouton. Regrouper toutes les actions de ligne dans une unique colonne alignée à droite (`text-end pe-3`).
  - Utiliser `<div class="fab-row-actions">` (boutons indépendants `30×30 px`, espacés par `gap: 0.35rem`, sobres au repos, teinte sémantique uniquement au survol).
  - Chaque bouton-icône doit comporter `title="..."`, `aria-label="..."` et `aria-hidden="true"` sur l'icône `<i class="fa-solid ...">`.
- **Contenus longs dans une cellule :** lorsqu'une information secondaire est longue (ex. intitulé d'objet Repair Café ou commentaire dans l'historique), privilégier une icône compacte avec infobulle Bootstrap (`data-bs-toggle="tooltip" data-bs-title="..."`).
- **État vide obligatoire :** tout tableau doit prévoir un rendu explicite lorsqu'aucune donnée n'est présente (ligne `colspan="N"` ou panneau dédié `#kioskEmptyState` sur le kiosque).

---

## 7. Formulaires & modales

- **Cohérence des libellés (règle de non-mélange) :**
  - Formulaires courts (kiosque, fiche profil, authentification) : `form-floating`.
  - Formulaires riches, paramètres et modales complexes : `form-label` au-dessus du champ.
  - **Ne jamais mélanger `form-floating` et `form-label` sur des champs texte/select à l'intérieur d'une même carte ou modale.**
- **Structure d'une carte-formulaire :**
  - `card border` avec `card-header bg-body-tertiary` (titre `<h2>` ou `<h5>`), `card-body p-4` et `card-footer bg-body-tertiary py-3 px-4 d-flex justify-content-end gap-2` pour les boutons *Annuler* / *Enregistrer*.
- **Structure d'une modale Bootstrap :**
  - `.modal-content` standard (rayon `6 px`, bordure `1 px` héritée de `main.css`, sans `border-0` ni en-tête coloré criard).
  - `.modal-header` sobre avec `<h5 class="modal-title">` et bouton de fermeture `aria-label="Fermer"`.
  - `.modal-footer bg-body-tertiary` regroupant systématiquement `btn btn-outline-secondary btn-sm` (Annuler / Fermer) et `btn btn-primary btn-sm` (ou `btn-danger btn-sm` pour une suppression). Ne pas mettre de bouton submit `w-100` isolé dans `.modal-body`.
  - Pour toute action destructive, utiliser `data-confirm="..."` (géré par `dialogs.js` et `confirm-modal.html`), jamais `onclick="return confirm(...)"`.

---

## 8. Kiosque, pages autonomes & langue

- **Bannière RFID du kiosque :** utiliser `.fab-rfid-bar` (barre compacte bordée neutre, bouton `btn-outline-secondary btn-sm`, badge `bg-success-subtle`).
- **Pages d'authentification (`login`, `register`, `forgot`, `reset`) :** centrées verticalement (`min-vh-100`) dans `.fab-auth-card` bordée, alignées visuellement avec `404`, `error`, `agreement-*` et `setup`.
- **Langue & terminologie :**
  - **100 % français cohérent** dans l'interface par défaut (ou via `__('clé')` synchronisée dans `locales/fr.json`, `locales/en.json` et `translations.csv`). Aucun texte anglais résiduel (`In Stock`, `Cancel`, `Close`, `Save changes`, `Active`, `Unknown`, etc.).
  - Respecter la convention métier : **« Contributeur »** (jamais *Usager*) et **« Motif de la visite »** (jamais *Type de projet* côté UI).

---

## 9. Accessibilité, sécurité & reverse proxy

- **WCAG 2.1 AA :**
  - Contraste ≥ 4.5:1 en clair et sombre ; `:focus-visible` net.
  - Tout champ visible possède un `<label for="...">` ou `aria-label`.
  - Cibles tactiles ≥ `44×44 px` sur les contrôles kiosque et écrans tactiles (`pointer: coarse`).
  - `rel="noopener noreferrer"` sur tous les liens `target="_blank"`.
- **CSP stricte :** zéro attribut `on*=` inline ; `nonce="<%= typeof cspNonce !== 'undefined' ? cspNonce : '' %>"` sur tout `<script>` inline.
- **Icônes :** uniquement des icônes **Font Awesome Free 7** (validées par [assetsAndIconsR010.test.js](../tests/unit/assetsAndIconsR010.test.js)).
- **Sous-chemin (`APP_BASE_PATH`) :** préfixer tous les liens/formulaires avec `baseUrl` (`typeof baseUrl !== 'undefined' ? baseUrl : '/'`) et les appels `fetch()` avec `window.getAppBaseUrl(...)`.

---

## 10. Checklist avant commit d'une vue

- [ ] `<title>` au format `Titre • platformName` et exactement un `<h1>`.
- [ ] Pas de `</main>` en double si `footer.html` est inclus.
- [ ] En-tête `.fab-page-header` sans bouton « Retour panneau admin » redondant.
- [ ] Zéro `rounded-pill`, zéro `card border-0`, zéro badge plein saturé, zéro `bg-light`/`bg-white`/`text-dark`.
- [ ] Actions de tableau regroupées dans `.fab-row-actions` avec `title` + `aria-label`.
- [ ] Pas de mélange `form-floating` / `form-label` dans une même carte/modale.
- [ ] Zéro libellé anglais codé en dur, zéro `on*=` inline, `_csrf` présent sur chaque `<form method="POST">`.
- [ ] `npm run lint && DATABASE_URL="" npm run test:unit` au vert (y compris `uiDesignSystemGuards.test.js`).
