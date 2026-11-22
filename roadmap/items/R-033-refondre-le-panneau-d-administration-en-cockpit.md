---
id: R-033
titre: "Refondre le panneau d'administration en cockpit avec menu latéral persistant (Prop. 3)"
resume: "Remplacer le mur de 25 cartes de /admin par un menu latéral persistant filtrable sur toutes les vues admin et un cockpit d'accueil « À traiter aujourd'hui »."
statut: a-tester
jalon: v1.5
cree: 2026-11-21
maj: 2026-11-22
livree:
---

## Objectif

Remplacer le mur de 25 cartes statiques de `/admin` par l'organisation validée sur maquette (**Proposition 3**) : un menu latéral persistant filtrable (`240 px`, tiroir mobile offcanvas) partagé par **100 % des pages d'administration**, des compteurs légers mis en cache avec invalidation temps réel, le masquage des plugins désactivés dans la navigation principale, et un véritable **cockpit d'accueil « À traiter aujourd'hui »** piloté par les données réelles du fablab.

## Contexte et motivation

- **Source :** Proposition 3 validée sur maquette interactive par l'utilisateur (Menu latéral persistant + Cockpit).
- Le mur de 25 cartes actuel oblige à revenir systématiquement sur `/admin` pour passer d'une section à l'autre, noie les alertes opérationnelles du jour et affiche même les plugins désactivés dans la navigation principale.

## Comportement attendu

1. **Service agrégateur léger et mis en cache (`services/adminCockpitService.js`) :**
   - `getSidebarCounters()` calcule les compteurs de la barre latérale (`presentCount`, `activeWarningsCount`, `overdueLoansCount`, `lowStockCount`, `machinesCount`, `openIssuesCount`, `pendingStaffCount`) en parallèle avec un cache TTL court (`30 s`) invalidé dès qu'une mutation `admin` passe sur `realtimeService`.
   - `getCockpitData()` agrège les 4 compteurs KPI et la liste actionnable « À traiter aujourd'hui » (emprunts en retard, consommables sous seuil/rupture, pannes machines ouvertes, comptes staff en attente de validation).
2. **Menu latéral persistant filtrable sur toutes les vues `/admin/*` et `/users/manage` (`views/includes/admin-sidebar.html` + `public/javascripts/admin-sidebar.js`) :**
   - Injecté automatiquement dans le shell `.fab-admin-shell` (`max-width: 1240px`) par `header.html`/`footer.html` dès que `isAdminLayout` est actif pour un administrateur (desktop persistant `240 px` + tiroir offcanvas accessible au clavier sur `< lg`).
   - Champ de filtre rapide (`Filtrer le menu…`) ouvrant automatiquement le groupe pliable **Configuration & Référentiels** lors d'une recherche.
   - 4 groupes principaux (**Pilotage**, **Communauté**, **Parc & Stocks**, **Extensions actives**) + section pliable **Configuration & Référentiels**.
   - Les plugins désactivés ne sont jamais affichés dans la navigation principale (gérés uniquement dans Configuration & Plugins).
   - Mise en évidence de la route active (`aria-current="page"`) et liens 100 % compatibles `APP_BASE_PATH`.
3. **Cockpit d'accueil `/admin` (`routes/admin/index.js` + `views/admin/main.ejs`) :**
   - 4 tuiles KPI synthétiques cliquables avec chiffres tabulaires (`tabular-nums`).
   - Panneau « À traiter aujourd'hui » listant les alertes réelles avec lien d'action directe (ou état vide positif si tout est à jour).
   - 4 raccourcis rapides (Kiosque, Statistiques & IA, Import Historique CSV, Configuration & Plugins).
4. **Passage de version :** `package.json` passe en `1.5.0` à la livraison complète du jalon `v1.5`.

## Plan technique

- Créer `services/adminCockpitService.js` et invalider son cache lors des publications `realtimeService.publish("admin", ...)`.
- Exposer `res.locals.isAdminLayout` et `res.locals.adminSidebarCounters` dans `app.js` pour les routes admin (`/admin/*`, `/users/manage`).
- Créer `views/includes/admin-sidebar.html` et `public/javascripts/admin-sidebar.js`, et intégrer `.fab-admin-shell` dans `views/includes/header.html`, `views/includes/footer.html` et `public/stylesheets/main.css`.
- Mettre à jour `routes/admin/index.js` et refondre `views/admin/main.ejs` en Cockpit « À traiter aujourd'hui ».
- Mettre à jour `package.json` (`1.5.0`) et ajouter `tests/unit/adminCockpitAndSidebarR033.test.js`.

## Critères d'acceptation

- Menu latéral `.fab-admin-sidebar` rendu sur 100 % des vues admin (desktop + tiroir offcanvas mobile) avec filtre temps réel, mise en évidence de la route active et compatibilité `APP_BASE_PATH`.
- Plugins désactivés absents du groupe « Extensions actives » et du menu principal.
- Cache des compteurs de barre latérale actif (TTL court + invalidation) évitant de requêter la base à chaque navigation.
- Cockpit `/admin` affichant les 4 KPI cliquables, la liste actionnable « À traiter aujourd'hui » et les 4 raccourcis sans mur de 25 cartes.
- `npm run lint`, `npm audit --omit=dev`, `DATABASE_URL="" npm run test:unit` et `fabboard roadmap lint` passent sans erreur.

## Risques et points de vigilance

- En cas d'indisponibilité temporaire d'une table ou d'un test unitaire sans DB, `getSidebarCounters()` et `getCockpitData()` doivent retourner des compteurs à zéro sans jamais faire échouer le rendu d'une page admin.
- Conserver 100 % des invariants `R-024` (CSP strict), `R-028` (WCAG AA + dark mode), `R-030` (`baseUrl`) et `R-031` (Option B).
