---
id: R-031
titre: "Adopter le bandeau supérieur et les retouches visuelles Fab Design System (Option B)"
resume: "Remplacer l'en-tête centré et le sélecteur flottant par le bandeau 44 px Fab Design System en bleu Sorbonne et harmoniser cartes, boutons, tableaux et barre d'état."
statut: a-tester
jalon: v1.5
cree: 2026-11-21
maj: 2026-11-22
livree:
---

## Objectif

Déployer la variante validée sur maquette (**Option B — Fab Design System**) : un bandeau supérieur `44 px` fixe en bleu Sorbonne (sans badge d'établissement), des sélecteurs segmentés `24 px` de langue et de thème remplaçant définitivement le sélecteur flottant violet bas-droite, des retouches douces sur les cartes/tableaux/boutons/chiffres tabulaires, et une barre d'état discrète `24 px` en pied d'application.

## Contexte et motivation

- **Source :** Maquette interactive Option B validée par l'utilisateur (inspirée de `fab-design-system`).
- L'ancien en-tête centré consomme beaucoup de hauteur verticale sur toutes les pages et ne propose pas de navigation principale immédiate ni de sélecteur d'espace visible d'un coup d'œil.
- Le bouton flottant violet `.btn-bd-primary` en bas à droite (`views/includes/light-dark.html`) chevauche régulièrement les boutons d'action et les toasts sur mobile et tablette.
- Les surfaces, bordures et tableaux manquent de jetons neutres unifiés clair/sombre et de chiffres tabulaires (`tabular-nums`).

## Comportement attendu

1. **Bandeau supérieur Fab (`44 px`, `sticky`) dans `views/includes/header.html` :**
   - Liseré d'identité `2 px` bleu Sorbonne en haut (`#112970` / `#2e6bd1` en clair, `#4c8df5` en sombre).
   - Tuile graphite `24×24` portant le monogramme hexagonal `logo-fabtrack.svg` (ou logo personnalisé), nom `platformName` et sous-titre `platformSubtitle` masqué sous `1180 px` (sans badge d'établissement).
   - Sélecteur d'espace Fablab direct (`.fab-pbox` avec pastille verte active et menu déroulant `.workspace-link`).
   - Navigation principale discrète (`Kiosque`, `Administration` pour `role === "admin"`, état actif via `currentPath`).
   - Actions rapides icônes avec infobulles (`Signaler une panne`, `Signaler un bug`, `Sortie d'inventaire` réservée à `admin`/`user`).
   - Sélecteurs segmentés `24 px` : langue (`FR | EN` ou `localesMeta`, compatibles `APP_BASE_PATH`) et thème (`Auto | Clair | Sombre`, pilotés par `color-mode-toggler.js`).
   - Menu utilisateur compact (nom, badge de rôle, navigation, déconnexion `POST /logout` protégée CSRF).
2. **Suppression du sélecteur flottant violet :**
   - Retrait des boutons `.btn-bd-primary` de `views/includes/light-dark.html` et `public/stylesheets/main.css`.
   - Sur les pages autonomes sans `header.html` (`/login`, `/register`, `/report-issue`, `/setup`, `/404`), une barre segmentée discrète `.fab-standalone-controls` reste disponible en haut à droite (automatiquement masquée sur les pages dotées de `.fab-topbar`).
3. **Retouches douces Fab Design System (`public/stylesheets/main.css`) :**
   - Jetons neutres clair/sombre (`--fab-identity`, `--fab-bg-chrome`, `--fab-bg-workspace`, `--fab-bg-panel`, `--fab-bg-elevated`, `--fab-bg-control`, `--fab-border`, `--fab-divider`, `--fab-text-*`, `--fab-accent`).
   - Cartes à rayon `6 px` et bordure `1 px`, contrôles à rayon `4 px`, tableaux à en-tête `--fab-bg-chrome` + survol `--fab-bg-hover` + `tabular-nums`, bannière RFID sobre à liseré latéral `3 px` `--bs-info`.
4. **Barre d'état discrète (`24 px`) dans `views/includes/footer.html` :**
   - Affiche l'espace actif, l'état RFID (si plugin activé), un indicateur temps réel prêt pour `R-032` (`#fabRealtimeStatus`), la version `appVersion` et les liens discrets MIT / FontAwesome / GitHub.

## Plan technique

- Exposer `res.locals.appVersion` depuis `package.json` dans `app.js`.
- Refondre `views/includes/header.html`, `views/includes/light-dark.html`, `views/includes/footer.html`.
- Adapter `public/javascripts/color-mode-toggler.js` aux boutons segmentés `[data-bs-theme-value]` sans dépendre de `#bd-theme`.
- Enrichir `public/stylesheets/main.css` avec les jetons Option B, le bandeau `44 px`, les sélecteurs `24 px` et la barre d'état `24 px`, et retirer `.btn-bd-primary`.
- Ajouter la suite de tests unitaires `tests/unit/fabDesignSystemR031.test.js`.

## Critères d'acceptation

- Bandeau `.fab-topbar` (`44 px`, bleu Sorbonne, sans badge établissement) rendu sur toutes les vues incluant `header.html` avec liens compatibles `APP_BASE_PATH`.
- Disparition totale de `.btn-bd-primary` dans `views/` et `public/stylesheets/main.css`.
- Sélecteurs segmentés langue + thème (`Auto | Clair | Sombre`) fonctionnels et accessibles (`aria-pressed`, `aria-current`).
- Barre d'état `.fab-statusbar` (`24 px`) rendue dans `footer.html` avec toasts positionnés au-dessus.
- `npm run lint`, `npm audit --omit=dev`, `DATABASE_URL="" npm run test:unit` et `fabboard roadmap lint` passent sans erreur.

## Risques et points de vigilance

- Préserver la compatibilité avec `views/admin/*.ejs` et `views/fabtrack/*.ejs` qui conservent `<main class="main-container">` sans nécessiter de réécriture lourde des balises `<body>`.
- Respecter 100 % des invariants existants : CSP strict (`nonce`, 0 `on*=`), 0 `href="/..."`, 0 `bg-light`/`bg-white`/`text-dark`, 0 icône FA invalide.
