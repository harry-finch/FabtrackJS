---
id: R-031
titre: "Adopter le bandeau supérieur et les retouches visuelles Fab Design System (Option B)"
resume: "Remplacer l'en-tête centré et le sélecteur flottant par le bandeau 44 px Fab Design System en bleu Sorbonne et harmoniser cartes, boutons, tableaux et barre d'état."
statut: idee
jalon: v1.5
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** Proposition UX/UI validée par l'utilisateur sur maquette interactive (Option B, inspirée de `fab-design-system`)
- **Fichiers principaux :** `views/includes/header.html`, `views/includes/light-dark.html`, `views/includes/footer.html`, `views/includes/pagehead.html`, `public/stylesheets/main.css`, `public/images/logo-fabtrack.svg`, `public/javascripts/color-modes.js`, `public/javascripts/workspace.js`
- **Décisions validées sur la maquette :**
  - **Variante retenue :** Option B — bandeau supérieur Fab (`44 px`) + retouches visuelles douces du corps de page et barre d'état discrète en pied de page, tout en conservant la mise en page centrée (`max-width: 1140px`), la lisibilité du corps (`14–15 px`) et les parcours existants (kiosque, admin, fiches machines) pour ne pas faire perdre leurs repères aux utilisateurs.
  - **Couleur d'identité :** conserver le bleu existant de FabtrackJS (« bleu Sorbonne ») — `#4c8df5` en thème sombre et sur la tuile graphite du logo (déjà défini dans `roadmap/projet.toml` et `logo-fabtrack.svg`), et déclinaison bleu Sorbonne cohérente en thème clair (`#00006e` / `#112970` / `#2e6bd1` à calibrer lors de la spécification pour le contraste du liseré `2 px`). Ne pas basculer sur corail, turquoise ou violet.
  - **Marque établissement :** mise de côté pour le moment — pas de badge « Sorbonne Université » dans le bandeau supérieur.
- **Périmètre envisagé :**
  - **Bandeau supérieur Fab (`44 px`, `sticky`) :** liseré d'identité `2 px` en haut (`--identity`), tuile graphite `24×24` portant le monogramme hexagonal Fabtrack (`logo-fabtrack.svg`), nom et sous-titre configurables (`platformName` / `platformSubtitle`, sous-titre masqué sous 1180 px), sélecteur d'espace Fablab direct (`.pbox` + popover avec pastille d'état active), navigation principale discrète (`Kiosque`, `Administration` pour `admin`), actions rapides icônes avec infobulles sombres (`Signaler une panne`, `Signaler un bug`, `Sortie d'inventaire / Rebut` filtré par rôle), sélecteurs segmentés `24 px` de langue (`FR | EN` ou dynamique selon `localesMeta`) et de thème (`Auto | Clair | Sombre`), menu utilisateur compact (nom, badge de rôle, navigation, déconnexion).
  - **Suppression du sélecteur flottant violet :** retirer les boutons flottants bas-droite `.btn-bd-primary` (`views/includes/light-dark.html`), remplacés par les sélecteurs segmentés du bandeau.
  - **Retouches douces Fab Design System sur le corps :** jetons neutres clair/sombre (`--bg-chrome`, `--bg-workspace`, `--bg-panel`, `--bg-elevated`, `--bg-control`, `--border`, `--divider`, `--text-*`, `--accent`, teintes sémantiques) mappés sur les variables Bootstrap 5 ; cartes/tuiles admin à fond `--bg-panel`, bordure `1 px`, rayon `6 px` sans ombres lourdes ; titres de sections admin sobres soulignés d'un filet `--divider` ; boutons, champs et badges au rayon `4 px` (abandon des `rounded-pill` systématiques) ; bannière RFID sobre avec liseré latéral `3 px` `--info` ; tableaux à en-tête `--bg-chrome`, survol `--bg-hover` et chiffres tabulaires (`tabular-nums`) sur soldes, durées et KPI.
  - **Barre d'état discrète (`24 px`, pied d'application) :** remplace le grand footer centré par une barre d'état compacte (état lecteur RFID, espace actif, version, lien discret À propos/Licence).
- **Hors périmètre :**
  - Badge ou logo d'établissement (« Sorbonne Université ») dans le bandeau supérieur (mis de côté pour le moment).
  - Refonte en mise en page CAO 3 colonnes ou densification excessive (`12 px`) sur les écrans kiosque et admin.
  - Changement de couleur d'identité (hors bleu Sorbonne).
- **Arbitrages & dépendances :** À coordonner avec `R-007` (visibilité des actions par rôle : `admin`, `user`/médiateur, `staff`/kiosque), `R-028` (accessibilité WCAG AA, clavier et contraste mode sombre) et `R-030` (liens compatibles `APP_BASE_PATH` et masquage de la modale d'inventaire).
- **Critères d'acceptation visés :** Bandeau `44 px` uniforme sur toutes les vues (kiosque, admin, fiches, sous-pages) en clair et en sombre ; disparition du bouton flottant violet ; changement d'espace, de langue et de thème fonctionnel sous `APP_BASE_PATH` ; contrastes WCAG AA vérifiés sur Kiosque, Panneau Admin et Fiche Machine.
