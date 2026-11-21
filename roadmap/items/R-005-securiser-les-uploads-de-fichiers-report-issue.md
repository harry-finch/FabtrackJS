---
id: R-005
titre: "Sécuriser les uploads de fichiers (/report-issue, machines, settings)"
resume: "Fermer la XSS stockée anonyme par upload public, filtrer les images machines/branding et empêcher la saturation disque."
statut: a-tester
jalon: v1.1
cree: 2026-11-21
maj: 2026-11-21
livree:
---

## But

Fermer une vulnérabilité critique de XSS stockée anonyme par upload de fichier sur `/report-issue` et sécuriser l'ensemble des téléversements d'images de la plateforme (pannes machines, fiches machines, logo et favicon). Empêcher le stockage de fichiers falsifiés (`.html`, `.svg`, scripts), la suppression de fichiers hors du répertoire `uploads/`, la saturation disque par fichiers orphelins ou spam, et l'exécution de contenu actif depuis `/uploads/*`.

## Inclus

- Service centralisé [uploadSecurityService.js](../../services/uploadSecurityService.js) (sans nouvelle dépendance npm) :
  - Pré-filtrage strict **`ET`** (extension autorisée **ET** type MIME correspondant au même format) avant stockage.
  - Contrôle post-upload des **magic bytes** réels du fichier (PNG, JPEG, GIF, WEBP, ICO) puis **renommage canonique** selon le format réel détecté ; suppression immédiate si le contenu ne correspond pas.
  - Suppression confinée (`safeUnlinkInDir`) empêchant toute sortie de répertoire (`../`, liens symboliques, préfixes invalides) et nettoyage automatique des fichiers uploadés en cas d'échec de validation Zod (`middleware/validate.js`) ou d'erreur serveur.
  - Validation du champ texte `picture` sur les machines (`validatePictureField`).
  - Wrapper Multer uniforme traduisant les erreurs de format ou de taille en notifications utilisateur (ou JSON 400 pour les API) sans erreur 500.
- Route publique `POST /report-issue` ([report-issue.js](../../routes/report-issue.js)) : limitation de débit par IP ([rateLimit.js](../../middleware/rateLimit.js), 10 envois / 15 min), images raster uniquement (JPG, PNG, WEBP, GIF, 10 Mo max), nettoyage du fichier en cas de machine introuvable ou d'erreur, redirections encodées et usage de `mailService.resolveBaseUrl()` compatible reverse proxy et sécurisé en production.
- Routes machines ([machines.js](../../routes/admin/machines.js)) : remplacement de `upload.any()` par `upload.single("machinePicture")` (JPG, PNG, WEBP, GIF, 5 Mo max), suppression de l'ancienne photo lors d'un remplacement/suppression, et confinement strict de la suppression des photos d'incidents dans `uploads/issues/`.
- Routes paramètres ([settings.js](../../routes/admin/settings.js), Option A validée) : **formats raster uniquement** — logo (`PNG, JPG, WEBP`, 3 Mo max) et favicon (`PNG, ICO`, 1 Mo max), rejet strict des `.svg`, et suppression des anciens fichiers personnalisés lors d'un remplacement ou reset (`views/admin/manage-settings.ejs` et `views/public/report-issue.ejs` alignés).
- Durcissement du service statique `/uploads` ([app.js](../../app.js)) : `dotfiles: "deny"`, `index: false`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, et `Content-Disposition: attachment` hors images raster autorisées.
- Tests unitaires Jest isolés (`tests/unit/uploadSecurityService.test.js`) et mise à jour de [docs/MISE_A_JOUR_PROD.md](../../docs/MISE_A_JOUR_PROD.md) (audit lecture seule du dossier `uploads/`).

## Hors périmètre

- Protection CSRF globale sur les formulaires (traitée dans `R-012`).
- Refonte de l'affichage des bannières de notification dans `views/public/report-issue.ejs` (traitée dans `R-027`).
- Stockage objet externe (S3/MinIO) ou recompression d'images par bibliothèque native (`sharp`, incompatible NetBSD sans compilation).

## Dépendances

- Aucune (s'appuie sur `mailService.resolveBaseUrl()` durci dans `R-004`).

## Critères d'acceptation

- Un fichier `.html`, `.js` ou `.svg` envoyé avec `Content-Type: image/png` ou renommé en `.jpg` sur `/report-issue`, `/admin/machines/create`, `/admin/machines/update` ou `/admin/settings` est rejeté avec un message clair (sans erreur 500) et sans laisser aucun fichier résiduel dans `uploads/`.
- En cas d'échec de validation Zod ou de machine introuvable sur `POST /report-issue`, le fichier téléversé est immédiatement supprimé du disque.
- `safeUnlinkInDir` refuse toute tentative de path traversal (`../`), lien symbolique sortant ou chemin hors `uploads/`.
- `GET /uploads/*` renvoie `X-Content-Type-Options: nosniff` et `Content-Security-Policy: default-src 'none'; sandbox` (et `Content-Disposition: attachment` hors images raster).
- Au-delà du seuil de requêtes sur `POST /report-issue`, le rate limiter bloque la requête en amont sans écrire de fichier ni envoyer d'e-mail.
- Remplacer ou réinitialiser le logo/favicon supprime l'ancien fichier personnalisé de `uploads/`.
- Tous les tests unitaires (`npx jest tests/unit/ --runInBand --forceExit`) passent sans erreur.

## Vérifications de l'utilisateur

- Tester en local l'upload d'une vraie image JPG/PNG puis d'un faux fichier (.html renommé en .jpg ou .svg) sur /report-issue, une fiche machine et /admin/settings, et vérifier que le faux fichier est refusé sans résidu dans uploads/.
- Lors du passage en prod, exécuter l'audit du dossier uploads/ documenté dans docs/MISE_A_JOUR_PROD.md pour vérifier qu'aucun fichier suspect (.html, .svg, .js) n'y a été déposé avant le correctif.
