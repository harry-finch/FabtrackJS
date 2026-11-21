---
id: R-033
titre: "Refondre le panneau d'administration en cockpit avec menu latéral persistant (Prop. 3)"
resume: "Remplacer le mur de 25 cartes de /admin par un menu latéral persistant filtrable sur toutes les vues admin et un cockpit d'accueil « À traiter aujourd'hui »."
statut: idee
jalon: v1.5
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** Proposition UX/UI validée par l'utilisateur sur maquette interactive (Proposition 3 : Menu latéral persistant + Cockpit)
- **Fichiers principaux :** `views/admin/main.ejs`, `views/includes/admin-sidebar.html` (nouveau partial/layout partagé), vues `views/admin/*.ejs`, `routes/admin/index.js`, `services/` (service agrégeant les compteurs et alertes du cockpit), `public/stylesheets/main.css`
- **Décisions validées sur la maquette :**
  - **Organisation retenue :** Proposition 3 — menu latéral persistant (`~240 px`) partagé entre `/admin` et l'ensemble des sous-pages d'administration (fin des allers-retours systématiques vers `/admin`), couplé à un cockpit d'accueil orienté actions du jour au lieu du mur de 25 cartes actuelles.
  - **Cadre visuel :** intégré dans l'Option B validée (`R-031` : Fab Design System, bleu Sorbonne, sans marque établissement, clair/sombre), conteneur élargi (`max-width: 1240px`) sur les pages admin et menu repliable en tiroir sur petit écran.
- **Périmètre envisagé :**
  - **Menu latéral persistant filtrable (`4` groupes + bloc pliable) :**
    - Champ de filtre rapide en tête de menu (`Filtrer le menu…`) ouvrant automatiquement la section Configuration/Référentiels lors d'une recherche.
    - *Pilotage* : Tableau de bord (Cockpit), Statistiques & IA, Historique & Import CSV, Consommations, Communication.
    - *Communauté* : Contributeurs, Ateliers, Avertissements (pastille compteur actifs).
    - *Parc & Stocks* : Machines (compteur parc), Équipements & Prêts (pastille retards), Consommables (pastille stocks bas), Sorties & Rebuts.
    - *Extensions actives* : affichées dynamiquement uniquement si activées (UE, Projets Sorbonne, Repair Café, BookStack…) ; les extensions désactivées ne polluent plus le menu principal et restent gérées dans Configuration.
    - *Configuration & Référentiels* (section pliable en bas) : Configuration & Plugins, Comptes staff, Espaces, E-mails & Alertes + les 6 référentiels métier (Types contributeurs, Motifs de visite, Types machines, Niveaux d'accès, Catégories, Emplacements).
    - Mise en évidence de la route active sur toutes les vues `/admin/*` et liens compatibles `APP_BASE_PATH`.
  - **Cockpit d'accueil `/admin` (« À traiter aujourd'hui ») :**
    - 4 compteurs synthétiques cliquables (présents au lab, emprunts en retard, stocks sous seuil, état du parc machines / pannes ouvertes).
    - Liste actionnable « À traiter aujourd'hui » remontant les vrais points d'attention (prêts en retard, consommables sous seuil d'alerte, incidents/pannes machines ouverts) avec lien direct.
    - 4 raccourcis rapides vers les actions fréquentes (Kiosque, Statistiques, Paramètres, Parc machines / Import CSV).
  - **Cohérence croisée sur toutes les pages `/admin/*` :** intégrer le layout à menu latéral sur l'ensemble des vues d'administration (y compris `manage-users.ejs`, fiches machines, historiques et référentiels) avec tiroir mobile accessible au clavier.
- **Arbitrages & dépendances :**
  - S'appuie sur `R-031` (bandeau supérieur 44 px & jetons Option B), `R-030` (liens `APP_BASE_PATH` et harmonisation admin) et `R-028` (accessibilité WCAG AA, clavier, contrastes clair/sombre).
  - Synergie avec `R-032` : rafraîchissement sans rechargement des compteurs du menu latéral et des alertes du cockpit via SSE.
  - Point technique à prévoir à la spécification : mise en cache légère (TTL court + invalidation) des compteurs de la barre latérale afin d'éviter de rejouer plusieurs requêtes SQL à chaque changement de page admin.
- **Critères d'acceptation visés :** Menu latéral persistant, actif et filtrable sur 100 % des vues `/admin/*` (desktop et tiroir mobile) ; plugins désactivés masqués de la navigation principale ; cockpit `/admin` affichant les vrais compteurs et alertes du jour sans mur de 25 cartes ; compatibilité `APP_BASE_PATH`, thèmes clair/sombre et WCAG AA.
