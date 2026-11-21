---
id: R-008
titre: "Corriger le bug confirm() dans main.js, sécuriser simpleLogger et SMTP_PORT"
resume: "Empêcher les suppressions accidentelles en sous-chemin, les crashs serveur sur promesses rejetées et la collision PORT/SMTP."
statut: idee
jalon: v1.1
cree: 2026-11-21
maj: 2026-11-21
livree:
---

- **Priorité / Source :** Top 10 (#5) · `AUD-010`, `AUD-016` (Opus #11 + nouveaux)
- **Fichiers principaux :** `public/javascripts/main.js:66-162`, `utilities/simpleLogger.js`, `services/mailService.js:18,75,80`, `services/settingsService.js:23`, `routes/api.js:24-77`, `routes/index.js:212`, `bin/www`
- **Périmètre envisagé :**
  - Tester `if (e.defaultPrevented) return;` (et clics modifiés `metaKey`/`ctrlKey`/`shiftKey`/`altKey`/`button !== 0`) dans les listeners `click` et `submit` de `main.js`.
  - Tronquer à 255 caractères et encapsuler `simpleLogger.logThat` dans `try/catch` (zéro `UnhandledPromiseRejection`).
  - Envelopper dans `asyncHandler` les 6 routes `async` de `routes/api.js` et `GET /logout`.
  - Remplacer `process.env.PORT` par `process.env.SMTP_PORT` dans `settingsService.js:23` et `mailService.js:18`.
  - Ajouter l'arrêt gracieux `SIGTERM`/`SIGINT` (`server.close`, `prisma.$disconnect`, `pool.end`) et `process.on("unhandledRejection")` dans `bin/www`.
- **Arbitrages & dépendances :** Aucune.
- **Critères d'acceptation visés :** Cliquer « Annuler » sur `confirm()` en sous-chemin ne navigue pas ; `logThat` > 255 caractères ne rejette pas ; `PORT=8080` n'altère plus `smtp_port=587`.
