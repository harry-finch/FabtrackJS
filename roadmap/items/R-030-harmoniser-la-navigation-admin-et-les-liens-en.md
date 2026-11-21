---
id: R-030
titre: "Harmoniser la navigation admin et les liens en sous-chemin reverse proxy"
resume: "Corriger les liens et formulaires absolus incompatibles avec APP_BASE_PATH, masquer la modale inventaire aux non-admins et vérifier les retours admin."
statut: idee
jalon: v1.5
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** `AUD-010` (complément), `AUD-029`
- **Fichiers principaux :** `views/public/report-issue.ejs`, `views/index/{login,register,reset,forgot}.ejs`, `views/includes/header.html:237`, `views/admin/main.ejs:333`, `views/admin/manage-communication.ejs:357`, `views/admin/view-machine.ejs:57`, vues `views/admin/*.ejs`
- **Périmètre envisagé :**
  - Convertir les 138 `href="/..."` et 47 `action="/..."` restants (notamment `report-issue.ejs`, vues auth et liens `target="_blank"`).
  - Conditionner l'inclusion de `inventory-checkout-modal.html` dans `header.html` aux rôles autorisés.
  - Vérification croisée des boutons retour/fils d'Ariane `/admin` et suppression du ternaire mort `admin/main.ejs:333`.
- **Arbitrages & dépendances :** Dépend de `R-008` et `R-012`.
- **Critères d'acceptation visés :** Parcours complet testé sous `APP_BASE_PATH="/fabtrack"` sans aucune 404 ni appel racine `/`.
