# Procédure de mise à jour en production

> Document cumulatif maintenu à jour à chaque évolution de FabtrackJS (`R-…`).
> Avant chaque déploiement, suivre la **procédure standard** ci-dessous puis appliquer uniquement les **actions spécifiques** listées pour les éléments déployés.

---

## Procédure standard de déploiement

Exécuter ces commandes sur le serveur dans le dossier de FabtrackJS (avec un utilisateur disposant des droits MariaDB et gestionnaire de service) :

```bash
# 1. Sauvegarder la base de données avant toute mise à jour
mysqldump -u <DB_USER> -p <DB_NAME> > "backup_fabtrack_$(date +%Y%m%d_%H%M%S).sql"

# 2. Récupérer le code validé
git pull

# 3. Installer les dépendances si package.json / package-lock.json a changé
npm install --omit=dev

# 4. Exécuter les éventuelles commandes SQL et Prisma indiquées plus bas

# 5. Redémarrer l'application
pm2 restart fabtrack   # Ou systemctl restart fabtrack selon votre serveur

# 6. Vérifier que le service démarre proprement sans erreur dans les logs
pm2 logs fabtrack --lines 50
```

> **Note NetBSD :** sur NetBSD, `prisma.config.js` configure automatiquement `PRISMA_SCHEMA_ENGINE_BINARY=/dev/null` lors de `npx prisma generate` pour contourner l'absence de binaire natif précompilé.

---

## Tableau récapitulatif des actions par élément

| Élément | Jalon | `.env` | Base de données (SQL) | Dépendances / Prisma | Action post-déploiement |
| --- | --- | --- | --- | --- | --- |
| [R-004](../roadmap/items/R-004-securiser-la-reinitialisation-de-mot-de-passe.md) | `v1.1` | Vérifier `HOSTURL` ou `APP_URL` | `ALTER TABLE Staff MODIFY COLUMN pwdToken VARCHAR(64) NULL;` | `npx prisma generate` | Auditer manuellement la table `Staff` |
| [R-005](../roadmap/items/R-005-securiser-les-uploads-de-fichiers-report-issue.md) | `v1.1` | Aucune | Aucune | Aucune | Auditer le dossier `uploads/` (fichiers non-raster / `.svg`) |
| [R-006](../roadmap/items/R-006-verrouiller-l-api-machines-nfc-en-fail-closed-et.md) | `v1.1` | Définir `FABTRACK_API_KEY` (ou `api_machine_token` en admin) avant tout client NFC | Aucune | Aucune | Vérifier que `/api/machines/*` retourne HTTP `401` sans clé |
| [R-007](../roadmap/items/R-007-verrouiller-le-role-borne-kiosque-staff-et.md) | `v1.1` | Aucune | Aucune | Aucune | Contrôler les rôles Staff (`admin`, `user`, `staff`) et reconnecter les sessions actives |
| [R-008](../roadmap/items/R-008-corriger-le-bug-confirm-dans-main-js-securiser.md) | `v1.1` | Utiliser `SMTP_PORT` (et non `PORT`) si le port SMTP vient du `.env` | Aucune | Aucune | Tester « Annuler » sur un `confirm()` en sous-chemin et vérifier l'envoi d'un e-mail test |
| [R-009](../roadmap/items/R-009-reparer-le-bootstrap-setup-et-resynchroniser.md) | `v1.1` | Aucune | Aucune sur base existante (`prisma/schema.sql` resynchronisé pour nouvelles installations) | Aucune | Vérifier que `/setup` reste verrouillé (redirection `/login` ou HTTP `403`) |
| [R-010](../roadmap/items/R-010-corriger-les-cve-npm-production-et-remplacer.md) | `v1.1` | Aucune | Aucune | **`npm install --omit=dev`** (obligatoire : correctifs CVE + `@fortawesome/fontawesome-free`) | Vérifier l'affichage des icônes (kiosque, admin, avertissements) et `npm audit --omit=dev` |
| [R-011](../roadmap/items/R-011-isoler-la-base-de-test-corriger-la-flakiness-et.md) | `v1.2` | Aucune en prod (`DATABASE_URL_TEST` requis uniquement pour les tests d'intégration) | Aucune | Aucune en prod (`eslint` uniquement en `devDependencies`) | Vérifier l'absence de `TEST_ADMIN_USER` dans `Staff` en production |

---

## Détail des actions par jalon

### Jalon `v1.1` — Sécurité critique & stabilisation d'urgence

#### `R-004` — Sécuriser la réinitialisation de mot de passe staff

**1. Variable `.env` obligatoire en production**

En mode `NODE_ENV=production`, `mailService.resolveBaseUrl()` n'utilise plus l'en-tête HTTP `Host` de la requête pour construire les liens d'e-mail (protection contre le *Host Header Poisoning*). Vérifier dans `.env` que l'une des deux variables est bien définie :

```env
HOSTURL=https://votre-domaine.org/fabtrack
# ou APP_URL=https://votre-domaine.org/fabtrack
```

**2. Évolution SQL sans perte de données**

La colonne `Staff.pwdToken` passe de `VARCHAR(40)` à `VARCHAR(64)` pour stocker les empreintes SHA-256 :

```sql
ALTER TABLE Staff MODIFY COLUMN pwdToken VARCHAR(64) NULL;
```

**3. Client Prisma**

```bash
npx prisma generate
```

*(Puis redémarrer l'application comme indiqué à l'étape 5 de la procédure standard.)*

**4. Audit manuel post-déploiement de la table `Staff`**

Par mesure de précaution après correction de l'ancienne faille sur `/reset_password`, vérifier qu'aucun compte staff suspect ou non légitime n'existe et qu'aucun mot de passe/rôle n'a été altéré :

```sql
SELECT id, name, email, role, approved, createdAt, pwdToken, tokenExpiry
FROM Staff
ORDER BY id;
```

En cas de compte inconnu, de rôle anormal ou de doute sur un compte administrateur : désactiver/supprimer le compte suspect (`approved = 0`) puis lancer une réinitialisation légitime depuis `/forgot`.

---

#### `R-005` — Sécuriser les uploads de fichiers (`/report-issue`, machines, settings)

**1. Variable `.env`, SQL et dépendances**

- **Aucune** modification `.env`, **aucune** requête SQL et **aucune** nouvelle dépendance npm requises : `git pull` et redémarrage du service suffisent.

**2. Note fonctionnelle (logo / favicon personnalisés)**

- Les formats vectoriels `.svg` sont désormais bloqués à l'upload dans **Administration > Paramètres** (seuls `PNG`, `JPG`, `WebP` pour le logo et `ICO`, `PNG` pour le favicon sont acceptés ; le logo par défaut reste en SVG intégré). Si un logo ou favicon `.svg` déjà en place venait à poser problème ou avait été déposé avant la mise à jour, le remplacer par un fichier PNG ou rétablir celui par défaut.

**3. Audit post-déploiement du dossier `uploads/`**

Par mesure de précaution après fermeture de la vulnérabilité sur l'upload public `/report-issue`, vérifier qu'aucun fichier inattendu (`.html`, `.js`, `.svg` non maîtrisé, etc.) n'a été déposé avant la mise à jour :

```bash
find uploads/ -type f ! \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' -o -iname '*.gif' -o -iname '*.ico' \)
```

En cas de fichier suspect (notamment dans `uploads/issues/`), le supprimer immédiatement.

---

#### `R-006` — Verrouiller l'API machines/NFC en Fail-Closed (`checkApiKeyOrSession` & `machineUsageService`)

**1. Configuration API Fail-Closed (`.env` / Paramètres admin)**

- Aucune migration SQL ni dépendance npm requise.
- L'API `/api/machines/*` fonctionne désormais en **Fail-Closed** : si aucune clé n'est configurée côté serveur, toute requête non authentifiée par session staff retourne HTTP `401` (le passage de la clé via `?apiKey=` en URL est supprimé ; seuls les en-têtes `x-api-key` et `Authorization: Bearer <clé>` sont acceptés).
- Tant qu'aucun lecteur NFC externe n'est branché, laisser aucune clé configurée maintient l'API fermée par défaut. Lorsqu'un lecteur NFC sera déployé, définir `FABTRACK_API_KEY` dans `.env` (ou renseigner `api_machine_token` dans **Administration > Paramètres**) et configurer le lecteur pour envoyer l'en-tête `x-api-key`.

**2. Vérification post-déploiement**

Contrôler que les endpoints machines refusent bien les appels anonymes après redémarrage :

```bash
curl -i "https://votre-domaine.org/fabtrack/api/machines/usage?machineId=1"
# Attendu : HTTP/1.1 401 Unauthorized
```

---

#### `R-007` — Verrouiller le rôle borne kiosque (`staff`) et corriger le RBAC médiateurs (`user`)

**1. Variable `.env`, SQL et dépendances**

- **Aucune** modification `.env`, **aucune** requête SQL et **aucune** nouvelle dépendance npm requises : `git pull` et redémarrage du service suffisent.

**2. Vérification post-déploiement (comptes & sessions)**

- Se rendre dans **Administration > Staff** (`/admin/staff/manage`) et vérifier que chaque compte porte bien son rôle attendu (`admin` pour administrateur, `user` pour médiateur, `staff` pour borne kiosque). En particulier, aucun compte actif ne doit utiliser l'ancien intitulé erroné `mediateur` (qui doit être `user`).
- **Reconnexion des sessions actives :** le redémarrage de l'application vide le cache en mémoire des sessions ; demander aux administrateurs, médiateurs et bornes kiosques de se reconnecter afin de charger les nouveaux attributs de session (dont `staffId`, nécessaire à la protection contre l'auto-suppression / auto-rétrogradation).
- Vérifier que les bornes kiosques (`staff`) peuvent toujours enregistrer arrivées et sorties sur `/fabtrack`, tandis que les opérations de solde (`credit > 0`, `cleardebt < 0`), d'ajustement (`balance-adjust`, réservé `admin`), d'avertissements (`warning/deactivate`, réservé `admin`) et d'habilitations ateliers (`users/:id/workshop-badge/*` pour `admin` + `user`) respectent la nouvelle matrice.

---

#### `R-008` — Corriger le bug `confirm()` (`main.js`), sécuriser `simpleLogger`, `SMTP_PORT` et l'arrêt gracieux (`bin/www`)

**1. Variable `.env` SMTP (`PORT` → `SMTP_PORT`)**

- **Aucune** migration SQL ni nouvelle dépendance npm requises.
- La variable `process.env.PORT` est désormais strictement réservée au port HTTP de l'application (`bin/www`). Le port SMTP ne lit plus `PORT` mais `SMTP_PORT` (ou la valeur enregistrée dans **Administration > E-mails**, sinon `587` par défaut).
- Si votre fichier `.env` de production définissait le port SMTP via `PORT` (sans l'avoir enregistré en base dans **Administration > E-mails**), ajouter explicitement :

```env
SMTP_PORT=587
```

**2. Vérifications post-déploiement**

- En déploiement sous-chemin (ex. `/fabtrack/`), cliquer sur une action protégée par `confirm()` puis sur **Annuler** : vérifier qu'aucune navigation ni suppression n'a lieu.
- Envoyer un e-mail de test depuis **Administration > E-mails** pour confirmer la résolution du port SMTP.

---

#### `R-009` — Réparer le bootstrap `/setup` et resynchroniser `prisma/schema.sql`

**1. Variable `.env`, SQL et dépendances**

- **Aucune** modification `.env`, **aucune** nouvelle dépendance npm et **aucune** migration SQL nécessaire sur une base de production déjà initialisée (`prisma/schema.sql` est désormais entièrement aligné avec `prisma/schema.prisma` pour les nouvelles installations vierges).

**2. Vérification post-déploiement**

Contrôler qu'une instance déjà initialisée refuse bien l'accès à `/setup` :

```bash
curl -i -H "Accept: application/json" -X POST "https://votre-domaine.org/fabtrack/setup"
# Attendu : HTTP/1.1 403 Forbidden (code ALREADY_INSTALLED)
```

---

#### `R-010` — Correctifs CVE npm production & migration Font Awesome Free

**1. Dépendances npm obligatoires**

- **Aucune** modification `.env` ni requête SQL.
- Les anciens fichiers Font Awesome Pro (`public/stylesheets/fontawsome-all.min.css` et `public/webfonts/*`) ont été supprimés au profit du paquet `@fortawesome/fontawesome-free` servi sur `/vendor/fontawesome`, et les paquets vulnérables de production ont été mis à jour (`npm audit --omit=dev` à 0 vulnérabilité). L'étape suivante est donc **obligatoire** avant de redémarrer le service :

```bash
npm install --omit=dev
```

*(Si vous utilisez `npm ci --omit=dev`, il utilisera le `package-lock.json` à jour ; `postinstall` exécute `prisma generate` si `prisma` est présent, sinon exécuter `npx prisma generate` comme prévu pour `R-004`.)*

**2. Vérifications post-déploiement**

- Contrôler que les icônes s'affichent correctement sur le kiosque, les fiches usagers et les écrans d'administration (vider le cache navigateur si besoin : `Ctrl+Shift+R`).
- Si des types d'avertissements personnalisés avaient été saisis manuellement en base avec une classe Font Awesome Pro (ex. `fa-duotone` ou `fa-shield-check`), les mettre à jour dans **Administration > Types d'avertissements**.

---

### Jalon `v1.2` — Qualité, tests, CI & dette technique

#### `R-011` — Isoler la base de test (`DATABASE_URL_TEST`), corriger la flakiness & CI GitHub Actions

**1. Impact production**

- **Aucune** modification `.env`, **aucune** migration SQL et **aucune** nouvelle dépendance de production (`eslint` et `@eslint/js` sont uniquement en `devDependencies`).
- En environnement local ou CI, les tests d'intégration (`npm run test:integration` / `npm test`) exigent désormais explicitement une variable `DATABASE_URL_TEST` pointant vers une base se terminant par `_test`, et refusent de démarrer si `NODE_ENV=production`. Les tests unitaires purs (`npm run test:unit`) s'exécutent sans aucune base de données.

**2. Vérification opérationnelle post-déploiement (absence de `TEST_ADMIN_USER`)**

Vérifier en base de production qu'aucun compte de test hérité d'une ancienne exécution de `npm test` n'existe dans la table `Staff` :

```sql
SELECT id, name, email, role, approved
FROM Staff
WHERE name = 'TEST_ADMIN_USER' OR email LIKE '%@test-fabtrack.local';
```

Si une ligne apparaît, la supprimer immédiatement (`DELETE FROM Staff WHERE name = 'TEST_ADMIN_USER';`).







