---
id: R-005
titre: "Sécuriser les uploads de fichiers (/report-issue, machines, settings)"
resume: "Fermer la XSS stockée anonyme par upload public, filtrer les images machines/branding et empêcher la saturation disque."
statut: idee
jalon: v1.1
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** Top 10 (#2) · `AUD-002` (Opus #2)
- **Fichiers principaux :** `routes/report-issue.js`, `routes/admin/machines.js:21-38,352-361,487-675`, `routes/admin/settings.js:33-73,101-157,257-283`, `app.js:91-96`
- **Périmètre envisagé :**
  - Remplacer le filtre `OU` de `/report-issue` par un contrôle strict `ET` (liste blanche d'extensions raster + vérification des magic bytes) avec renommage selon le type réel détecté.
  - Ajouter `fileFilter`, limite `fileSize` et `upload.single` sur `routes/admin/machines.js`, valider `req.body.picture` et confiner `fs.unlinkSync` dans `uploads/issues/`.
  - Bloquer ou assainir les `.svg` dans `routes/admin/settings.js` et supprimer les anciens fichiers lors du remplacement ou reset.
  - Supprimer `req.file.path` sur disque en cas d'échec Zod ou machine introuvable (fin des fichiers orphelins).
  - Servir `/uploads` avec `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox` et `Content-Disposition: attachment` hors images raster.
  - Ajouter un rate-limit sur `POST /report-issue`, gestion propre des erreurs Multer (400 / notification flash au lieu de 500) et `encodeURIComponent` sur la redirection.
- **Arbitrages & dépendances :** Aucune.
- **Critères d'acceptation visés :** Un fichier `.html` ou `.svg` maquillé en `image/png` sur `/report-issue` ou `/admin/machines/create` est rejeté sans fichier résiduel ; `GET /uploads/*` renvoie les en-têtes durcis.
