# Consignes pour les agents

> Ce fichier est repris dans `CLAUDE.md`.

**FabtrackJS** est une plateforme web de suivi d'activité, d'équipements, de prêts et de consommables pour fablabs (Node.js, Express, MariaDB/MySQL avec Prisma ORM v7, EJS + Bootstrap 5). Lire [README.md](README.md), [DEVELOPMENT.md](DEVELOPMENT.md), [STATUS.md](STATUS.md) et [ROADMAP.md](ROADMAP.md) avant toute modification.

## Skills à utiliser (`.agents/skills/`)

- `fabtrack-dev` : toute modification du code FabtrackJS (routes, services, templates EJS, Prisma, tests, déploiement).
- `nodejs-mysql-sec-expert` : conception de routes Express, requêtes Prisma/MySQL, sécurité API et authentification.
- `ui-ux-web-expert` : modification ou création d'écrans et composants web (EJS, Bootstrap 5, accessibilité).
- `agent-learnings-manager` : début de session, résolution de bug complexe ou mise à jour de `fabtrack-dev`.
- `fab-roadmap` : spécifier un élément, tenir les statuts, créer une action utilisateur, valider `roadmap/`.
- `project-documentation` : création ou mise à jour de la documentation du projet.
- `fab-illustration-system`, `hairline-create`, `hairline-adopt` : illustrations Hairline du projet et de la carte FabBoard.

## Feuille de route

La feuille de route est dans `roadmap/` (un fichier par élément dans `items/`, un par action dans `actions/`), lue par FabBoard ; `ROADMAP.md` est généré, ne jamais le modifier à la main. Utiliser la skill `fab-roadmap` pour spécifier, tenir les statuts et créer une action quand on attend l'utilisateur ; exécuter `fabboard roadmap lint` avant chaque commit.

## Règles

- Placer la logique métier dans `services/`, jamais directement dans les contrôleurs `routes/`.
- Valider les entrées HTTP avec les schémas Zod (`schemas/`) via `middleware/validate.js`.
- Conserver la distinction `projecttype` (modèle Prisma, base de données, routes backend) vs « Motif de la visite » (UI et traductions).
- Respecter le fonctionnement derrière reverse proxy en sous-chemin : `mailService.resolveBaseUrl()` pour les liens d'email et `window.getAppBaseUrl(...)` côté client.
- Vérifier de façon croisée les autres pages `/admin` lors d'une correction sur une vue ou un contrôleur admin.
- Mettre à jour la documentation dans le même changement que le comportement.

## Commandes

- Lancement dev : `npm run dev` → `http://localhost:8080`
- Lancement prod : `npm start`
- Tests unitaires : `npx jest tests/unit/ --forceExit`
- Suite complète (avec base de test) : `npm test`
- Initialisation / setup : `npm run setup`
- Contrôle feuille de route : `fabboard roadmap lint`
