---
id: R-032
titre: "Rafraîchir le kiosque et les tableaux sans rechargement avec synchro temps réel multi-postes"
resume: "Remplacer les rechargements complets de page sur le kiosque et les tableaux admin par des mises à jour dynamiques (fragments serveur + fetch) synchronisées en temps réel entre postes via SSE."
statut: idee
jalon: v1.5
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** Idée UX/UI demandée par l'utilisateur pour le jalon `v1.5`
- **Fichiers principaux :** `views/fabtrack/index.ejs`, `views/fabtrack/partials/` (nouveau), `routes/fabtrack.js`, `routes/history.js`, `routes/users.js`, `public/javascripts/fabtrack.js`, `public/javascripts/rfid-listener.js`, `public/javascripts/notifications.js`, `services/` (service de bus temps réel SSE), `views/admin/*.ejs` et `routes/admin/*.js`
- **Périmètre envisagé :**
  - **Lot 1 — Kiosque sans rechargement + synchronisation temps réel multi-postes :**
    - Extraire le tableau des présents de `views/fabtrack/index.ejs` dans un partial EJS dédié servi par un endpoint léger (`GET /fabtrack/present-table`), afin d'éviter toute duplication de template et de conserver en un seul endroit les règles de rôles (`staff`/`user`/`admin`), badges, emprunts, traductions `__(...)` et `APP_BASE_PATH`.
    - Soumettre les actions du kiosque en `fetch()` (enregistrement d'arrivée `/history/create`, création de contributeur `/users/create`, sortie `/history/exit`, sortie Repair Café, ajout d'activité, commentaire, règlement de solde, désactivation d'avertissement) avec réponse JSON (`{ ok, type, message, refreshAutocomplete, refreshConsumables }`) et fallback `res.redirect` classique.
    - Afficher les notifications toast dynamiquement (`window.showToast`) sans recharger la page, réinitialiser le formulaire, réactiver les tooltips Bootstrap, préserver le tri actif et recharger en arrière-plan l'autocomplétion (`api/list/autocomplete-lists`) ainsi que les stocks de consommables lorsqu'ils changent.
    - Remplacer le `window.location.reload()` du lecteur RFID (`public/javascripts/rfid-listener.js`) par le rafraîchissement partiel du tableau.
    - Mettre en place un flux **Server-Sent Events (SSE)** léger (HTTP natif, sans Socket.IO, avec reconnexion automatique, support `APP_BASE_PATH` et en-tête `X-Accel-Buffering: no` pour reverse proxy Nginx) qui diffuse les événements de mutation par espace (`workspaceId`) afin que la borne kiosque et le poste médiateur se mettent à jour automatiquement dès qu'une entrée, sortie, activité ou badge RFID survient sur un autre poste.
  - **Lot 2 — Généralisation du même principe aux autres tableaux de la plateforme :**
    - Étendre le mécanisme « fragment HTML serveur (partial EJS) + `fetch()` + notifications SSE par canal » aux principaux tableaux opérationnels et d'administration : historique (`view-history.ejs`), équipements & emprunts (`manage-equipment.ejs`), consommables & mouvements de stock (`manage-consumables.ejs`, `manage-inventory-movements.ejs`), machines & sessions NFC (`manage-machines.ejs`, `view-machine.ejs`), contributeurs (`manage-users.ejs`), avertissements (`manage-warnings.ejs`), Repair Café (`manage-repaircafe.ejs`), ateliers (`manage-workshops.ejs`) et référentiels admin.
    - Conserver les filtres, recherches, pagination et tri courants lors du rafraîchissement d'un tableau, et ne jamais interrompre une modale ou un formulaire en cours d'édition par l'utilisateur.
- **Sécurité & confidentialité :** Authentification obligatoire sur le flux SSE (`isLoggedIn`), envoi uniquement d'événements légers d'invalidation (ex. `{ channel: "kiosk", workspaceId }`) — le rechargement du fragment passant toujours par les endpoints authentifiés qui appliquent le filtrage par rôle (aucune fuite de données vers les bornes `staff`).
- **Arbitrages & dépendances :**
  - Dépend de `R-012` (passage en `POST` + jeton CSRF des routes mutantes actuellement en `GET`) et s'articule avec `R-021` (pagination/filtrage serveur), `R-022` (suppression de Socket.IO), `R-027` (modales/toasts unifiés) et `R-031` (indicateur discret de connexion temps réel dans la barre d'état `24 px`).
  - Lors de la spécification détaillée, possibilité de découper en deux éléments distincts (Lot 1 Kiosque + SSE, Lot 2 Tableaux admin) si le périmètre s'avère trop large pour un seul ticket.
- **Critères d'acceptation visés :** Aucun rechargement complet de page lors d'une entrée, création de contributeur, sortie, activité, commentaire ou scan RFID sur le kiosque ; mise à jour automatique en < 2 s entre deux postes ouverts sur le même espace ; même fonctionnement fluide sur les tableaux admin ciblés avec conservation des filtres/tri et compatibilité `APP_BASE_PATH` + reverse proxy.
