---
id: R-004
titre: "Sécuriser la réinitialisation de mot de passe staff"
resume: "Supprimer la prise de contrôle de compte sans authentification sur POST /reset_password et l'énumération d'e-mails sur POST /reset."
statut: idee
jalon: v1.1
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** Top 10 (#1) · `AUD-001` (Opus #1)
- **Fichiers principaux :** `routes/index.js:105-176`, `views/index/reset.ejs`, `schemas/auth.schema.js:27-35`, `services/mailService.js:166-185`
- **Périmètre envisagé :**
  - Remplacer le champ caché `id` par le `token` opaque dans `reset.ejs`.
  - Stocker uniquement le hash SHA-256 du jeton en base (`Staff.pwdToken`, vérifier la longueur `VarChar(64)`).
  - Revérifier `pwdToken` hashé et `tokenExpiry >= now()` dans `POST /reset_password` via `validateBody(resetPasswordSchema)` branché, puis invalider après usage unique.
  - Passer `POST /reset` en `updateMany` avec réponse générique constante (fin de l'erreur 500 `P2025` et de l'énumération d'e-mails).
  - Empêcher le Host Header Poisoning dans `mailService.resolveBaseUrl()` (exiger `HOSTURL`/`APP_URL` en production).
  - Action opérationnelle : auditer manuellement la table `Staff` en production après déploiement.
- **Arbitrages & dépendances :** Aucune.
- **Critères d'acceptation visés :** `POST /reset_password` avec `id` seul ou jeton invalide/expiré est rejeté ; un jeton valide ne fonctionne qu'une seule fois ; aucune énumération sur `/reset`.
