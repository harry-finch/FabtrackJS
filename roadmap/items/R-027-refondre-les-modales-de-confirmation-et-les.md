---
id: R-027
titre: "Refondre les modales de confirmation et les retours utilisateur"
resume: "Remplacer les 33 confirm(), 9 alert() et 1 prompt() natifs par une modale Bootstrap réutilisable et corriger les retours d'erreur."
statut: idee
jalon: v1.5
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** `AUD-029`, `AUD-011` (UX), `AUD-033` (Opus #28)
- **Fichiers principaux :** `views/includes/footer.html`, `public/javascripts/notifications.js`, `views/public/report-issue.ejs`, `views/index/reset.ejs`, `views/index/login.ejs`, vues admin et kiosque
- **Périmètre envisagé :**
  - Composant de modale Bootstrap réutilisable (thème sombre, clavier, traduisible) remplaçant tous les `confirm()`/`alert()`/`prompt()` natifs.
  - Afficher les erreurs/notifications de validation sur `/report-issue` (avec `clearNotification`).
  - Masquer les préfixes bruts `"Success:"`/`"Error:"`/`"Warning:"` dans les toasts.
  - Corriger `reset.ejs` (`user.nom` → `user.name`, bloc `#warning`) et retirer ou implémenter `rememberMe` dans `login.ejs`.
- **Arbitrages & dépendances :** Dépend de `R-012` et `R-013`.
- **Critères d'acceptation visés :** 0 dialogue navigateur natif ; erreurs clairement visibles sur `/report-issue` et `/reset/:token`.
