---
id: R-007
titre: "Verrouiller le rôle borne kiosque (staff) et corriger le RBAC médiateurs"
resume: "Empêcher la borne kiosque (staff) d'exécuter des actions financières ou destructives et rétablir les habilitations pour les médiateurs (user)."
statut: idee
jalon: v1.1
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** Top 10 (#4) · `AUD-008`
- **Fichiers principaux :** nouveau `middleware/requireRoles.js`, `routes/history.js`, `routes/users.js:481-675`, `routes/admin/inventory.js`, `routes/admin/machines.js`, `routes/admin/staff.js`, `routes/warning.js`
- **Périmètre envisagé :**
  - Créer un middleware déclaratif `requireRoles(...roles)` (renvoyant `401`/`403` JSON sur `/api/*` et requêtes AJAX au lieu de `302`).
  - Bloquer `role === "staff"` (borne kiosque) sur `cleardebt`, `credit`, `history/delete`, `history/update`, `project/(un)archive`, `admin/inventory/checkout`, `admin/machines/issues/:id/status`, `admin/machines/maintenance/create`, `users/resend`, `workshop-interest/*`, `warning/deactivate`.
  - Corriger le bug `"mediateur"` → `"user"` dans `routes/users.js:541,609` (attribution et révocation des badges d'atelier).
  - Dans `routes/admin/staff.js`, valider `role` sur liste blanche `["admin", "user", "staff"]` et empêcher l'auto-suppression/rétrogradation du dernier administrateur actif.
  - Empêcher `cleardebt` d'effacer un solde positif (`balance > 0`) et journaliser les opérations de solde.
- **Arbitrages & dépendances :**
  - Réserver `history/delete` et `warning/deactivate` à `admin`.
  - Autoriser `user` (médiateur) sur `inventory/checkout` consommables et `history/update-comment`.
  - Rendre `POST /history/credit` strictement positif (`> 0`) et prévoir une action séparée « Débit / Ajustement » réservée aux `admin`.
- **Critères d'acceptation visés :** Suite de tests Supertest à 3 profils (`admin`, `user`, `staff`) validant intégralement cette matrice de permissions.
