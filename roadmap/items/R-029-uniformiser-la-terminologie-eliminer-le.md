---
id: R-029
titre: "Uniformiser la terminologie, éliminer le franglais et compléter l'i18n"
resume: "Généraliser Contributeur / Motif de la visite, traduire les 35 vues et 242 messages flash en dur et nettoyer le catalogue i18n."
statut: idee
jalon: v1.5
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** `AUD-033` (Opus #27)
- **Fichiers principaux :** `locales/fr.json`, `locales/en.json`, `translations.csv`, `config/i18n.js`, `views/includes/header.html:142`, 35 vues/partials non traduits, `routes/**/*.js`, `public/javascripts/fabtrack.js`
- **Périmètre envisagé :**
  - Retirer les derniers résidus « Usager » et « Type de projet » au profit de « Contributeur » et « Motif de la visite ».
  - Éliminer le franglais des vues admin et du kiosque.
  - Envelopper les 35 vues/partials en dur dans `__(...)`.
  - Passer les 242 messages flash à `{ type, key, params }` traduits au rendu.
  - Ajouter `common.menu`, nettoyer les 90 clés inutilisées et supprimer les `|| true` de `config/i18n.js`.
- **Arbitrages & dépendances :** Dépend de `R-027`.
- **Critères d'acceptation visés :** Interface 100 % traduite FR/EN ; zéro occurrence visible d'« Usager » ou « Type de projet » ; export/import CSV synchronisé.
