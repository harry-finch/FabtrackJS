---
id: R-004
titre: "Sécuriser la réinitialisation de mot de passe staff"
resume: "Supprimer la prise de contrôle de compte sans authentification sur POST /reset_password et l'énumération d'e-mails sur POST /reset."
statut: a-tester
jalon: v1.1
cree: 2026-11-21
maj: 2026-11-21
livree:
---

## But

Éliminer une vulnérabilité critique permettant à n'importe qui de changer le mot de passe d'un compte staff (y compris administrateur) sans authentification via `POST /reset_password`, ainsi que l'énumération d'adresses e-mail et les erreurs 500 sur `POST /reset`. Garantir que seuls des liens de réinitialisation cryptographiques, à usage unique, limités dans le temps et construits sur une URL canonique fiable permettent de redéfinir un mot de passe.

## Inclus

- Génération d'un jeton aléatoire cryptographique de 256 bits (`crypto.randomBytes(32)`) lors d'une demande sur `POST /reset`, valable 10 minutes, avec stockage en base uniquement de son empreinte SHA-256 dans `Staff.pwdToken` (colonne élargie de `VARCHAR(40)` à `VARCHAR(64)` dans `prisma/schema.prisma` et `prisma/schema.sql`).
- Réponse identique et générique sur `POST /reset` que l'adresse e-mail existe ou non en base (aucune erreur 500 `P2025`, aucun indice permettant d'énumérer les comptes) et envoi de l'e-mail uniquement si un compte correspond.
- Vérification sur `GET /reset/:token` de l'empreinte SHA-256 et de la date d'expiration ; redirection vers `/forgot` avec message explicite si le lien est invalide ou expiré.
- Remplacement dans `views/index/reset.ejs` du champ caché `id` par le `token` opaque, correction du titre (`user.name` au lieu de `user.nom`), ajout du bloc d'alerte `#warning` manquant et compatibilité sous-chemin (`baseUrl`).
- Validation stricte par schémas Zod (`schemas/auth.schema.js`) sur `POST /reset` et `POST /reset_password`, imposant **8 caractères minimum** sur la réinitialisation et vérifiant la correspondance `password` / `password_verif`, sans impact sur la connexion des comptes existants ayant un mot de passe plus court.
- Mise à jour atomique conditionnée à `(pwdToken == sha256(token) && tokenExpiry >= now)` qui efface immédiatement `pwdToken` et `tokenExpiry` après usage (usage unique strict, résistant aux requêtes concurrentes).
- Extraction de la logique métier dans `services/passwordResetService.js`.
- Durcissement de `mailService.resolveBaseUrl()` contre le *Host Header Poisoning* : en production (`NODE_ENV=production`), exiger `HOSTURL` ou `APP_URL` et ne jamais utiliser l'en-tête HTTP `Host` non fiable.
- Couverture par tests unitaires Jest dédiés (`passwordResetService`, schémas Zod auth, `resolveBaseUrl` en production) et création de la procédure cumulative de déploiement [docs/MISE_A_JOUR_PROD.md](../../docs/MISE_A_JOUR_PROD.md).

## Hors périmètre

- Protection CSRF globale et limitation de débit (*rate limiting*) sur `/reset` et `/auth` (traitées dans `R-012`).
- Politique globale de complexité des mots de passe à l'inscription ou rotation des mots de passe existants (traitée dans `R-012`).
- Isolation complète de la base de test d'intégration (traitée dans `R-011`).
- Refonte visuelle de `views/index/reset.ejs` au format Fab Design System (`R-031`).

## Dépendances

- Variable `HOSTURL` ou `APP_URL` configurée dans le `.env` de production (confirmé par l'utilisateur).
- Exécution en production de `ALTER TABLE Staff MODIFY COLUMN pwdToken VARCHAR(64) NULL;` et `npx prisma generate` (procédure dans [docs/MISE_A_JOUR_PROD.md](../../docs/MISE_A_JOUR_PROD.md)).

## Critères d'acceptation

- Un `POST /reset_password` contenant uniquement un `id` (sans `token` valide), un `token` malformé, expiré ou déjà consommé est systématiquement rejeté sans modifier le mot de passe en base.
- Un jeton valide ne fonctionne qu'une seule fois : une seconde soumission avec le même jeton (ou deux requêtes simultanées) échoue et `pwdToken` / `tokenExpiry` valent `null` après succès.
- `POST /reset` avec une adresse e-mail inexistante renvoie exactement la même redirection et notification qu'avec une adresse existante, sans erreur 500 et sans envoi d'e-mail.
- En base, `Staff.pwdToken` stocke uniquement l'empreinte SHA-256 (64 caractères hexadécimaux), jamais le jeton brut.
- Un mot de passe de moins de 8 caractères est refusé sur `POST /reset_password`, tandis qu'un compte existant avec un mot de passe plus court reste accepté sur `POST /auth`.
- En `NODE_ENV=production`, `mailService.resolveBaseUrl()` lève une erreur si `HOSTURL` et `APP_URL` sont absents et ignore tout `Host` HTTP non fiable lorsqu'ils sont définis.
- Tous les tests unitaires (`npx jest tests/unit/ --runInBand --forceExit`) passent sans erreur.

## Vérifications de l'utilisateur

- Tester le parcours complet de réinitialisation de mot de passe en local (e-mail existant et inexistant, mot de passe < 8 caractères refusé, lien réutilisé refusé, puis connexion avec le nouveau mot de passe).
- Appliquer la procédure R-004 de docs/MISE_A_JOUR_PROD.md en production (ALTER TABLE Staff, npx prisma generate, redémarrage) puis auditer la table Staff.
