---
id: R-032
titre: "Rafraîchir le kiosque et les tableaux sans rechargement avec synchro temps réel multi-postes"
resume: "Remplacer les rechargements complets de page sur le kiosque et les tableaux admin par des mises à jour dynamiques (fragments serveur + fetch) synchronisées en temps réel entre postes via SSE."
statut: a-tester
jalon: v1.5
cree: 2026-11-21
maj: 2026-11-22
livree:
---

## Objectif

Éliminer les rechargements complets de page lors des actions quotidiennes au kiosque (entrée, sortie, Repair Café, commentaire, activité, règlement de solde, scan RFID) et synchroniser automatiquement en temps réel (< 2 s) les bornes kiosque, les postes médiateurs et les tableaux opérationnels d'administration grâce à un flux natif **Server-Sent Events (SSE)** sans Socket.IO.

## Contexte et motivation

- **Source :** Demande UX/UI de l'utilisateur pour le jalon `v1.5`.
- Aujourd'hui chaque action au kiosque ou scan RFID (`window.location.reload()`) déclenche un rechargement intégral de la page, faisant perdre la fluidité sur borne tactile et obligeant les médiateurs à rafraîchir manuellement leur poste pour voir les arrivées/départs des autres bornes.
- Socket.IO ayant été retiré en `R-022`, un bus SSE natif HTTP/1.1 est léger, compatible reverse proxy Nginx (`X-Accel-Buffering: no`, pas de compression tamponnée), reconnecté nativement par le navigateur (`EventSource`) et compatible avec `APP_BASE_PATH`.

## Comportement attendu

1. **Bus temps réel SSE natif (`services/realtimeService.js` + `routes/events.js`) :**
   - Endpoint authentifié `GET /events/stream` (`isLoggedIn`, auto-monté sous `/events`, compatible `APP_BASE_PATH`).
   - En-têtes `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no` ; exclusion de `/events` dans le middleware `compression()` d'`app.js`.
   - Diffusion uniquement d'événements légers d'invalidation (`{ channel, workspaceId, action, entity, ts }`) sans aucune donnée personnelle (PII) : chaque poste recharge ensuite son fragment filtré selon son propre rôle via les routes authentifiées.
   - Heartbeat périodique (`25 s`, `.unref()`) et nettoyage automatique à la déconnexion.
2. **Lot 1 — Kiosque sans rechargement (`views/fabtrack/partials/present-table.ejs`, `services/kioskService.js`, `GET /fabtrack/present-table`) :**
   - Extraction de la logique de chargement des présents dans `services/kioskService.js` et du tableau des présents dans `views/fabtrack/partials/present-table.ejs`.
   - Endpoint `GET /fabtrack/present-table` (`Cache-Control: no-store`) servant le fragment HTML avec toutes les règles de rôles (`staff`/`user`/`admin`), traductions et `baseUrl`.
   - Soumission AJAX (`fetch` + `Accept: application/json`, `X-Requested-With: XMLHttpRequest`) des actions kiosque (`/history/create`, `/history/exit/:id`, `/history/exit-repair`, `/history/update-comment`, `/history/activity`, `/history/cleardebt/:id`) avec fallback `res.redirect` intact si JS désactivé.
   - Remplacement du `window.location.reload()` de `public/javascripts/rfid-listener.js` par `window.refreshKioskPresentTable()`.
   - Réinitialisation du formulaire, affichage toast dynamique (`window.showAppToast`), ré-initialisation des tooltips Bootstrap et conservation du tri actif.
3. **Lot 2 — Rafraîchissement partiel des tableaux admin via SSE (`public/javascripts/live-refresh.js`) :**
   - Sur les pages admin opérationnelles (`/admin/view-history`, `/admin/equipment`, `/admin/consumables`, `/admin/inventory`, `/admin/machines`, `/admin/users`, `/admin/warnings`, `/admin/repaircafe`, `/admin/workshops`), les événements SSE `admin` rafraîchissent silencieusement le tableau via `fetch(window.location.href)` + `DOMParser` en conservant filtres, recherche, pagination et tri courants.
   - Suspension automatique du rafraîchissement si une modale Bootstrap (`.modal.show`) est ouverte ou si l'utilisateur saisit dans un champ de formulaire.
   - Indicateur discret `#fabRealtimeStatus` (« En direct » / « Reconnexion… ») dans la barre d'état `24 px` (`views/includes/footer.html`).

## Plan technique

- Créer `services/realtimeService.js`, `services/kioskService.js` et `routes/events.js`.
- Extraire `views/fabtrack/partials/present-table.ejs` et mettre à jour `views/fabtrack/index.ejs` et `routes/fabtrack.js`.
- Ajouter les réponses AJAX JSON + publications SSE dans `routes/history.js` et `plugins/rfidPlugin.js`.
- Désactiver la compression sur `/events` dans `app.js`.
- Créer `public/javascripts/live-refresh.js`, l'inclure dans `views/includes/footer.html`, et mettre à jour `public/javascripts/rfid-listener.js`.
- Ajouter la suite de tests unitaires `tests/unit/realtimeAndPartialRefreshR032.test.js`.

## Critères d'acceptation

- `GET /events/stream` exige une session authentifiée, émet `X-Accel-Buffering: no` et `text/event-stream`, et nettoie ses clients à la fermeture.
- `realtimeService.publish` diffuse uniquement des événements d'invalidation filtrés par `workspaceId` sans aucune PII.
- `GET /fabtrack/present-table` rend le partial EJS des présents avec respect du masquage `staff`.
- Les mutations kiosque (`/history/create`, `/history/exit/:id`, `/history/exit-repair`, `/history/update-comment`, `/history/activity`) retournent du JSON en AJAX et publient un événement SSE tout en conservant la redirection classique en mode HTML.
- `public/javascripts/rfid-listener.js` utilise `window.refreshKioskPresentTable()` au lieu d'un `window.location.reload()` systématique.
- `npm run lint`, `npm audit --omit=dev`, `DATABASE_URL="" npm run test:unit` et `fabboard roadmap lint` passent sans erreur.

## Risques et points de vigilance

- Ne jamais laisser un timer SSE empêcher l'arrêt propre de Node ou de Jest (toujours utiliser `.unref()` et exposer `shutdown()`).
- S'assurer que `compression()` ne tamponne pas `/events/stream` et que les reverse proxies Nginx reçoivent `X-Accel-Buffering: no`.
- Ne jamais interrompre un formulaire ou une modale ouverte lors d'un rafraîchissement SSE sur un tableau admin.
