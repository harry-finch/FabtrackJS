---
id: R-013
titre: "Éradiquer les XSS templates/DOM et sécuriser /report-bug & mailService"
resume: "Supprimer les injections <%- JSON.stringify %>, icônes HTML brutes, confirm() inline, innerHTML dynamiques et HTML injection dans les e-mails."
statut: idee
jalon: v1.2
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** Top 10 (#9b) · `AUD-011`, `AUD-012` (Opus #9 + nouveaux)
- **Fichiers principaux :** `app.js`, `routes/index.js:339-368`, `services/mailService.js`, `schemas/bug.schema.js`, `views/fabtrack/edit-user.ejs:585-595,1234`, `public/javascripts/pagination.js`, `public/javascripts/fabtrack.js`, `public/javascripts/rfid-listener.js`, `views/admin/manage-warningtypes.ejs`, `manage-statistics.ejs:554`, `manage-communication.ejs:251,263`, `import-history.ejs:405`, `project-consumption.ejs:200`, `views/index/agreement-success.ejs:95-120`, 14 vues admin avec `onclick="return confirm(...)"`
- **Périmètre envisagé :**
  - Ajouter `res.locals.safeJson` pour remplacer tous les `<%- JSON.stringify(...) %>`.
  - Restreindre `Warningtype.icon` à une liste blanche de classes Font Awesome et retirer `<%- warningtype.icon %>`.
  - Remplacer les 15 `confirm()` inline avec interpolation EJS par des attributs `data-confirm` lus en JS.
  - Remplacer les `innerHTML` dynamiques non échappés par `textContent`/DOM API et valider le schéma `https?:` (`agreement-success.ejs`, `project.url`).
  - Protéger `POST /report-bug` par `isAuthenticated` + rate-limit, échapper tout HTML (`escapeHtml`) dans `mailService.js`, valider `pageUrl` et respecter les toggles `mail_notif_staff_registration` et `mail_notif_bug_report`.
- **Arbitrages & dépendances :** Dépend de `R-012`.
- **Critères d'acceptation visés :** Charges `</script><img onerror=1>`, `');alert(1);//`, `javascript:alert(1)` et HTML e-mail neutralisées ; `POST /report-bug` anonyme refusé.
