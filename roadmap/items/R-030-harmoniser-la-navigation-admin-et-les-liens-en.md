---
id: R-030
titre: "Harmoniser la navigation admin et les liens en sous-chemin reverse proxy"
resume: "Corriger les liens et formulaires absolus incompatibles avec APP_BASE_PATH, masquer la modale inventaire aux non-admins et vérifier les retours admin."
statut: a-tester
jalon: v1.5
cree: 2026-11-21
maj: 2026-11-22
livree:
---

## Objectif

Garantir un fonctionnement 100 % sans erreur 404 ni appel racine `/` lorsque FabtrackJS est déployé derrière un reverse proxy en sous-chemin (`APP_BASE_PATH="/fabtrack"`), restreindre l'inclusion de `inventory-checkout-modal.html` aux rôles autorisés (`admin`, `user`) et harmoniser la navigation retour `/admin` sur l'ensemble des vues d'administration.

## Contexte et motivation

- **Sources :** `AUD-010` (complément), `AUD-029`.
- Plus d'une centaine de liens `href="/..."`, une quarantaine de formulaires `action="/..."` et quelques `src="/..."` dans `views/admin/*.ejs` et `views/index/{forgot,register}.ejs` pointent directement à la racine `/` au lieu d'utiliser `baseUrl` (`APP_BASE_PATH`). Les liens `target="_blank"` (ex. `/report-issue/:id` sur `view-machine.ejs`) ne sont pas interceptés par `main.js` et cassent systématiquement en sous-chemin.
- `views/includes/header.html` inclut `inventory-checkout-modal.html` pour tous les rôles connectés, y compris les bornes kiosque `staff` qui n'ont pas accès à `/admin/inventory/*`.
- `views/admin/main.ejs` conserve un ternaire mort `btn-outline-secondary : btn-outline-secondary`, et `public/stylesheets/main.css` cible `a[href="/admin"]` au lieu de `a[href$="/admin"]`.

## Comportement attendu

1. **Zéro attribut `href="/..."`, `action="/..."` ou `src="/..."` racine dans `views/` :**
   - Tous les liens internes, formulaires et assets statiques dans `views/admin/*.ejs` et `views/index/*.ejs` préfixent leurs URL avec `<%= typeof baseUrl !== 'undefined' ? baseUrl : '/' %>`.
   - Les assignations JS dynamiques `form.action = "/..."` dans les vues admin utilisent `window.getAppBaseUrl ? window.getAppBaseUrl("...") : "/..."`.
2. **Inclusion conditionnelle de `inventory-checkout-modal.html` :**
   - `views/includes/header.html` n'inclut `inventory-checkout-modal.html` que lorsque `role === "admin" || role === "user"`.
3. **Cohérence admin & CSS sous-chemin :**
   - Suppression du ternaire mort sur la carte Ateliers de `views/admin/main.ejs`.
   - Règle CSS `a[href$="/admin"].btn:not(.header-action-btn)` dans `public/stylesheets/main.css` pour conserver le style bouton retour en sous-chemin.

## Plan technique

- Convertir les `href="/..."`, `action="/..."`, `src="/..."` restants dans les 27 vues `views/admin/*.ejs` et `views/index/{forgot,register}.ejs` pour utiliser `baseUrl`.
- Envelopper les affectations JS `.action = "/..."` dans les vues admin avec `window.getAppBaseUrl(...)`.
- Conditionner `<%- include('inventory-checkout-modal.html') %>` dans `views/includes/header.html`.
- Nettoyer le ternaire mort dans `views/admin/main.ejs` et mettre à jour le sélecteur CSS dans `public/stylesheets/main.css`.
- Ajouter la suite de tests unitaires `tests/unit/subpathAndAdminNavR030.test.js`.

## Critères d'acceptation

- 0 attribut HTML `href="/..."`, `action="/..."` ou `src="/..."` non préfixé par `baseUrl`/`basePath` dans `views/` (en dehors des liens `//` ou commentaires).
- Rendu EJS de `header.html` pour `role="staff"` n'inclut pas `#modalInventoryCheckout`, tandis que `role="admin"` et `role="user"` l'incluent.
- Rendu EJS des vues critiques (`views/admin/main.ejs`, `views/admin/view-machine.ejs`, `views/index/forgot.ejs`, `views/index/register.ejs`) avec `baseUrl="/fabtrack/"` produit exclusivement des URLs `/fabtrack/...`.
- `npm run lint`, `npm audit --omit=dev`, `DATABASE_URL="" npm run test:unit` et `fabboard roadmap lint` passent sans erreur.

## Risques et points de vigilance

- Éviter les doubles barres obliques (`//admin/...`) lors de la concaténation avec `baseUrl` (qui se termine toujours par `/`).
- Conserver `nonce="<%= typeof cspNonce !== 'undefined' ? cspNonce : '' %>"` et 0 attribut `on*=` sur toutes les vues modifiées.
