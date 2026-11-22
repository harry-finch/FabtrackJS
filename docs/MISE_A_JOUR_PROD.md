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
| [R-012](../roadmap/items/R-012-protection-csrf-conversion-des-31-routes-get.md) | `v1.2` | **Obligatoire :** définir `SECRET` (aléatoire fort, != valeur par défaut) ; vérifier `TRUST_PROXY` (`1` derrière Nginx) et `ENABLE_HTTPS=true` en HTTPS | Aucune | Aucune (CSRF & rate-limit 100 % natifs) | Reconnexion sessions actives ; tester login, `POST /logout`, suppression admin, confirmation charte `GET`→`POST /agreement/:token` et rejet `403` sans CSRF |
| [R-013](../roadmap/items/R-013-eradiquer-les-xss-templates-dom-et-securiser.md) | `v1.2` | Aucune | Aucune | Aucune | Vérifier les icônes d'avertissement, les dialogues `data-confirm`, le tableau paginé usager et le switch « Signalement de bug » dans Administration > E-mails |
| [R-014](../roadmap/items/R-014-index-sql-critiques-sessions-mariadb-cache.md) | `v1.2` | Optionnel : `VISIT_AUTO_CLOSE_TIME=18:30` (défaut `18:30`) | **Obligatoire :** `CREATE TABLE IF NOT EXISTS Session` + 10 `CREATE INDEX` composites | **`npx prisma generate`** (nouveau modèle `Session`) | Vérifier qu'une session survit à `pm2 restart fabtrack` et qu'une modif admin est visible immédiatement sur le kiosque |
| [R-015](../roadmap/items/R-015-corriger-les-injections-transverses-et-l.md) | `v1.3` | Aucune | Aucune | Aucune | Vérifier que `/admin/settings` n'affiche plus les clés API/tokens en clair dans le HTML et tester un export CSV |
| [R-016](../roadmap/items/R-016-confiner-l-ia-nl2sql-role-mariadb-lecture-seule.md) | `v1.3` | Si IA NL2SQL activée : **`DATABASE_URL_AI_RO`** (obligatoire en prod) ; optionnel : `SETTINGS_ENCRYPTION_KEY`, `AI_LOCAL_ALLOWED_HOSTS`, `BOOKSTACK_ALLOWED_HOSTS` | Si IA NL2SQL activée : créer le compte MariaDB `fabtrack_ai_ro` en lecture seule | Aucune | Tester une requête IA sous compte RO et vérifier le blocage SSRF (`http://169.254.169.254`) |
| [R-017](../roadmap/items/R-017-corriger-les-bugs-metier-averes-warnings.md) | `v1.3` | Aucune | Aucune | Aucune | Correctifs métier sans action de déploiement (avertissements, KPI Sorbonne par dates, inventaire `KEEP_STATUS`/alerte stock, fiches usagers, stats/maintenances machines, BookStack) |
| [R-018](../roadmap/items/R-018-garantir-la-transactionnalite-des-ecritures.md) | `v1.3` | Aucune | **Obligatoire :** `ALTER TABLE Activity ADD COLUMN unitCost DECIMAL(10, 2) NULL;` | **`npx prisma generate`** (nouvelle colonne `Activity.unitCost`) | Tester refus double emprunt, import CSV > 200 Ko et non-rétroactivité d'une hausse de prix consommable |
| [R-019](../roadmap/items/R-019-migrer-les-schemas-vers-zod-v4-et-generaliser-la.md) | `v1.3` | Aucune | Aucune | Aucune | Validation Zod v4 & stripping anti mass-assignment sans action de déploiement (tester un formulaire invalide → message français et un `:id` invalide sans 500) |
| [R-020](../roadmap/items/R-020-supprimer-l-etat-global-mute-par-requete-et.md) | `v1.3` | Vérifier que `NODE_ENV=production` est défini en prod (les erreurs 5xx sont désormais masquées dès que `NODE_ENV !== "development"`) | Aucune | Aucune | Vérifier deux sessions concurrentes FR/EN sur les dates longues et l'absence de stack trace sur une erreur serveur |
| [R-021](../roadmap/items/R-021-agreger-les-statistiques-en-sql-unifier-app.md) | `v1.4` | Optionnel : `APP_TIMEZONE=Europe/Paris` (défaut `Europe/Paris`) | Aucune | Aucune | Vérifier `/admin/statistics` (périodes + export CSV), pagination `/admin/view-history` et `/users/manage`, et autocomplétion usager au kiosque (`/fabtrack`) |
| [R-022](../roadmap/items/R-022-unifier-l-acces-prisma-fin-du-hack-require-cache.md) | `v1.4` | Aucune | Aucune | **`npm install --omit=dev`** (retrait `socket.io`, `socket.io-client`, `randomized-string`, `node-fetch`, `uuid`) | Vérifier un démarrage propre (`npm start`) sans `socket.io` et l'accès kiosque + admin |
| [R-023](../roadmap/items/R-023-migrations-sql-versionnees-netbsd-et-typage.md) | `v1.4` | Aucune | **Obligatoire :** `npm run db:migrate` (pure JS compatible NetBSD ; applique `001` à `004` idempotentes : enums stricts, `DECIMAL(10,2)`, `Log.description TEXT`, FK typées `Activity`) | **`npx prisma generate`** | Vérifier `npm run db:migrate -- --status` et le backfill sans perte des FK `Activity` |
| [R-024](../roadmap/items/R-024-alleger-les-routes-vues-obeses-et-activer-une.md) | `v1.4` | Aucune | Aucune | Aucune | CSP stricte (`script-src` à nonce sans `'unsafe-inline'`, `script-src-attr 'none'`) : vérifier en console navigateur 0 erreur CSP sur kiosque et admin |
| [R-025](../roadmap/items/R-025-exploitation-production-healthz-logs-structures.md) | `v1.4` | Optionnel : `LOG_LEVEL=info` (voir `.env.example`) | Aucune | Aucune | Vérifier `curl -i http://localhost:8080/healthz`, l'export RGPD `/users/:id/export-rgpd` et `npm run rgpd:anonymize -- --dry-run` |
| [R-026](../roadmap/items/R-026-unifier-les-assets-front-en-local-pour-un.md) | `v1.5` | Aucune | Aucune | **`npm install --omit=dev`** (ajout `chart.js` servi localement) | Vérifier kiosque, `/admin/statistics` et page 404 sans requête CDN externe (fonctionnement hors-ligne) |
| [R-027](../roadmap/items/R-027-refondre-les-modales-de-confirmation-et-les.md) | `v1.5` | Aucune | Aucune | Aucune | Vérifier les modales de confirmation Bootstrap (0 `confirm()`/`alert()`/`prompt()` natif), les toasts sans préfixe brut (`Success:`/`Error:`) et les erreurs sur `/report-issue` |
| [R-028](../roadmap/items/R-028-ameliorer-l-accessibilite-wcag-aa-le-clavier-le.md) | `v1.5` | Aucune | Aucune | Aucune | Vérifier `<html lang>` dynamique, mode sombre (tableaux + graphiques `/admin/statistics` en direct), tri clavier (`Tab`/`Entrée`/`Espace`) et cibles tactiles kiosque |
| [R-029](../roadmap/items/R-029-uniformiser-la-terminologie-eliminer-le.md) | `v1.5` | Aucune | Aucune | Aucune | Vérifier la bascule FR/EN (inclut `common.menu`, toasts traduits sur `/admin/settings`), l'absence d'« Usager »/franglais et l'export `translations.csv` |

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

---

#### `R-012` — Protection CSRF, conversion des 33 routes GET mutantes et durcissement Auth

**1. Variables `.env` obligatoires / à contrôler en production**

- **Aucune** migration SQL et **aucune** nouvelle dépendance npm requises (implémentation 100 % native).
- En `NODE_ENV=production`, l'application **refuse désormais de démarrer** si `SECRET` est absent, vide ou égal à l'ancienne valeur par défaut (`fabtrack-secret-key-2024`). Générer une clé forte avant redémarrage si ce n'est pas déjà fait :

```bash
# Générer un secret aléatoire de 64 caractères hexadécimaux
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```env
SECRET=<votre_secret_aleatoire_64_hex>
TRUST_PROXY=1          # 1 derrière Nginx/Apache ; false si exposé directement sans proxy
ENABLE_HTTPS=true      # Active cookie Secure + HSTS si l'accès public passe en HTTPS
```

**2. Impacts fonctionnels & sécurité**

- Toutes les actions mutantes (`logout`, suppressions/transitions admin, `exit`, `cleardebt`, `warning/deactivate`, `users/resend`, etc.) s'exécutent désormais exclusivement en `POST` protégé par jeton CSRF synchronisé en session (`403` en cas d'absence ou d'altération).
- La validation de la charte usager (`/agreement/:token`) s'effectue désormais en deux temps : page de confirmation en lecture seule (`GET`) puis soumission (`POST`) avec validité du jeton limitée à 30 jours.
- Le réglage **Administration > Paramètres > Auto-inscription (`allow_self_registration`)** est désormais effectivement appliqué sur `/register`, `/create-account` et le lien de `/login`.
- La révocation ou rétrogradation d'un compte staff dans **Administration > Staff** coupe immédiatement l'accès de la session concernée (invalidation directe + micro-cache 30 s).

**3. Vérifications post-déploiement**

- Vérifier que l'application démarre proprement (`pm2 logs fabtrack --lines 50`) sans erreur sur `SECRET`.
- Tester une connexion (`/login`), une déconnexion (`POST /logout`), une action d'administration (ex. modification/suppression) et un appel `POST` sans jeton CSRF :

```bash
curl -i -X POST -H "Accept: application/json" "https://votre-domaine.org/fabtrack/logout"
# Attendu : HTTP/1.1 403 Forbidden (code EBADCSRFTOKEN)
```

---

#### `R-013` — Éradication des XSS templates/DOM, sécurisation `/report-bug` & `mailService`

**1. Variable `.env`, SQL et dépendances**

- **Aucune** modification `.env`, **aucune** migration SQL et **aucune** nouvelle dépendance npm requises : `git pull` et redémarrage du service suffisent.

**2. Impacts fonctionnels & sécurité**

- Les icônes des types d'avertissements (`Warningtype.icon`) sont désormais strictement filtrées sur une liste blanche de classes Font Awesome Free + couleurs Bootstrap (`text-*`). Les anciennes lignes stockées en base sous forme `<i class="fa-solid ..."></i>` restent rendues proprement via `sanitizeWarningIcon()`, sans jamais injecter de HTML brut.
- Toutes les boîtes de confirmation de suppression utilisent désormais l'attribut `data-confirm` géré centralement par `public/javascripts/main.js` (plus aucun `confirm()` inline).
- `POST /report-bug` requiert désormais une session staff authentifiée (`401` / redirection `/login` pour les appels anonymes), valide `pageUrl` en `http:`/`https:`, et un nouveau réglage **Administration > E-mails > Signalement de bug** (`mail_notif_bug_report`, activé par défaut) ainsi que `mail_notif_staff_registration` sont désormais effectivement appliqués.

---

#### `R-014` — Index SQL critiques, sessions MariaDB (`PrismaSessionStore`), cache global & clôture auto des visites

**1. Évolution SQL obligatoire (non destructive, avant redémarrage)**

Créer la table `Session` (pour la persistance des sessions en MariaDB sans nouvelle dépendance npm) et les index composites de performance :

```sql
CREATE TABLE IF NOT EXISTS `Session` (
    `sid` VARCHAR(128) NOT NULL,
    `data` LONGTEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `Session_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`sid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Log_timestamp_idx` ON `Log`(`timestamp`);
CREATE INDEX `Warning_userId_active_idx` ON `Warning`(`userId`, `active`);
CREATE INDEX `History_workspaceId_departure_arrival_idx` ON `History`(`workspaceId`, `departure`, `arrival`);
CREATE INDEX `History_userId_departure_arrival_idx` ON `History`(`userId`, `departure`, `arrival`);
CREATE INDEX `History_arrival_idx` ON `History`(`arrival`);
CREATE INDEX `Activity_resourceType_returnedAt_userId_idx` ON `Activity`(`resourceType`, `returnedAt`, `userId`);
CREATE INDEX `Activity_resourceType_resourceId_endedAt_idx` ON `Activity`(`resourceType`, `resourceId`, `endedAt`);
CREATE INDEX `Activity_createdAt_idx` ON `Activity`(`createdAt`);
CREATE INDEX `MachineIssue_machineId_status_createdAt_idx` ON `MachineIssue`(`machineId`, `status`, `createdAt`);
CREATE INDEX `MachineMaintenance_machineId_maintenanceDate_idx` ON `MachineMaintenance`(`machineId`, `maintenanceDate`);
```

*(Note : si un index existe déjà, MariaDB 10.1.4+ accepte `CREATE INDEX IF NOT EXISTS ...` ; sinon ignorer l'erreur « Duplicate key name » sur cet index précis.)*

**2. Client Prisma obligatoire**

Le schéma incluant le nouveau modèle `Session`, régénérer le client Prisma avant redémarrage :

```bash
npx prisma generate
```

**3. Variable `.env` optionnelle**

- `VISIT_AUTO_CLOSE_TIME=18:30` (optionnel, défaut `18:30`) : heure de clôture automatique des visites oubliées des jours précédents (également surchargeable via le paramètre système `visit_auto_close_time`). La clôture garantit toujours `departure >= arrival` (aucune durée négative).

**4. Vérifications post-déploiement**

- Se connecter, exécuter `pm2 restart fabtrack`, puis recharger `/fabtrack` : la session doit rester active sans reconnexion.
- Créer ou renommer un motif de visite en admin et vérifier sa visibilité immédiate sur un autre poste kiosque connecté sans reconnexion.
- Vérifier avec `EXPLAIN SELECT * FROM History WHERE workspaceId = 1 AND departure IS NULL AND arrival >= CURDATE();` que `History_workspaceId_departure_arrival_idx` est utilisé.

---

### Jalon `v1.3` — Injections transverses, secrets & durcissement complémentaire

#### `R-015` — Injections transverses (Prototype Pollution, Open Redirect, CSV) & filtrage des secrets

**1. Variable `.env`, SQL et dépendances**

- **Aucune** modification `.env`, **aucune** migration SQL et **aucune** nouvelle dépendance npm requises (`git pull` + redémarrage).

**2. Impacts fonctionnels & sécurité**

- Les secrets stockés en base (`api_machine_token`, `smtp_pass`, `bookstack_token_id`/`secret`, `ai_*_api_key`) sont désormais **filtrés hors de `res.locals.settings`** et passés en **écriture seule** dans **Administration > Paramètres** (laisser un champ vide conserve la valeur existante ; **Tester la connexion IA** réutilise la clé enregistrée si le champ est laissé vide).
- Les endpoints `/api/list/all-staff` et `/api/list/all-users` n'exposent plus `password`, `pwdToken`, `tokenExpiry`, `token` ni `rfid`.
- Tous les exports CSV neutralisent désormais les formules (`= + - @ \t \r`) et assainissent l'en-tête `Content-Disposition`.

---

#### `R-016` — Confinement IA NL2SQL (rôle MariaDB RO), anti-SSRF & chiffrement AES-256-GCM des clés API

**1. Compte MariaDB lecture seule (`DATABASE_URL_AI_RO` — requis en prod si l'assistant IA est activé)**

En `NODE_ENV=production`, l'assistant IA NL2SQL fonctionne désormais en **Fail-Closed** : il refuse toute exécution tant que `DATABASE_URL_AI_RO` n'est pas défini. Si vous utilisez l'assistant IA, créer un utilisateur MariaDB dédié limité en `SELECT` aux seules tables/vues non sensibles :

```sql
CREATE USER IF NOT EXISTS 'fabtrack_ai_ro'@'localhost' IDENTIFIED BY '<MOT_DE_PASSE_FORT>';

GRANT SELECT (id, name, surname, usertypeId, createdAt, birthYear, balance, termsAccepted, isExpert, deletedAt)
  ON <DB_NAME>.`User` TO 'fabtrack_ai_ro'@'localhost';
GRANT SELECT ON <DB_NAME>.`Usertype` TO 'fabtrack_ai_ro'@'localhost';
GRANT SELECT ON <DB_NAME>.`Project` TO 'fabtrack_ai_ro'@'localhost';
GRANT SELECT ON <DB_NAME>.`Projecttype` TO 'fabtrack_ai_ro'@'localhost';
GRANT SELECT ON <DB_NAME>.`UserProject` TO 'fabtrack_ai_ro'@'localhost';
GRANT SELECT ON <DB_NAME>.`History` TO 'fabtrack_ai_ro'@'localhost';
GRANT SELECT ON <DB_NAME>.`Activity` TO 'fabtrack_ai_ro'@'localhost';
GRANT SELECT ON <DB_NAME>.`Machine` TO 'fabtrack_ai_ro'@'localhost';
GRANT SELECT ON <DB_NAME>.`MachineType` TO 'fabtrack_ai_ro'@'localhost';
GRANT SELECT ON <DB_NAME>.`Consumable` TO 'fabtrack_ai_ro'@'localhost';
GRANT SELECT ON <DB_NAME>.`Equipment` TO 'fabtrack_ai_ro'@'localhost';
GRANT SELECT ON <DB_NAME>.`Workspace` TO 'fabtrack_ai_ro'@'localhost';
GRANT SELECT (id, code, name, department, active, createdAt) ON <DB_NAME>.`TeachingUnit` TO 'fabtrack_ai_ro'@'localhost';
GRANT SELECT ON <DB_NAME>.`Category` TO 'fabtrack_ai_ro'@'localhost';
GRANT SELECT ON <DB_NAME>.`Location` TO 'fabtrack_ai_ro'@'localhost';
GRANT SELECT ON <DB_NAME>.`Workshop` TO 'fabtrack_ai_ro'@'localhost';
GRANT SELECT ON <DB_NAME>.`UserWorkshopCompletion` TO 'fabtrack_ai_ro'@'localhost';
GRANT SELECT (id, machineId, status, createdAt, resolvedAt) ON <DB_NAME>.`MachineIssue` TO 'fabtrack_ai_ro'@'localhost';
GRANT SELECT ON <DB_NAME>.`MachineMaintenance` TO 'fabtrack_ai_ro'@'localhost';
GRANT SELECT ON <DB_NAME>.`InventoryMovement` TO 'fabtrack_ai_ro'@'localhost';
FLUSH PRIVILEGES;
```

**2. Variables `.env` (`R-016`)**

```env
# Requis en production uniquement si l'assistant IA NL2SQL est activé :
DATABASE_URL_AI_RO="mysql://fabtrack_ai_ro:<MOT_DE_PASSE_FORT>@localhost:3306/<DB_NAME>"

# Optionnel (2A) : active le chiffrement AES-256-GCM au repos des clés API/SMTP dans SystemSetting
# (rétrocompatible avec les clés déjà enregistrées en clair)
SETTINGS_ENCRYPTION_KEY="<cle_aleatoire_64_hex>"

# Optionnel : allowlist SSRF si votre Ollama local ou BookStack tourne sur une IP privée / localhost
AI_LOCAL_ALLOWED_HOSTS="localhost:11434"
BOOKSTACK_ALLOWED_HOSTS=""
```

---

#### `R-018` — Transactionnalité des écritures critiques & historisation `Activity.unitCost`

**1. Évolution SQL obligatoire (non destructive, avant redémarrage)**

Ajouter la colonne `unitCost` sur la table `Activity` pour figer le prix unitaire d'un consommable au moment de la consommation :

```sql
ALTER TABLE `Activity` ADD COLUMN `unitCost` DECIMAL(10, 2) NULL;
```

*(Les lignes historiques conservant `unitCost = NULL` continuent d'utiliser automatiquement `Consumable.cost` en repli.)*

**2. Client Prisma obligatoire**

```bash
npx prisma generate
```

---

### Jalon `v1.4` — Performance avancée, architecture, migrations & exploitation

#### `R-023` — Migrations SQL versionnées (compatible NetBSD) & typage strict Prisma

Les évolutions de schéma s'appliquent désormais via un runner pure JS (`scripts/migrate.js`, pilote `mariadb` natif, sans binaire moteur Prisma — 100 % compatible **NetBSD**) avec suivi dans la table `_schema_version`.

**1. Vérifier et appliquer les migrations SQL**

```bash
# Consulter l'état des migrations
npm run db:migrate -- --status

# Prévisualiser sans exécuter
npm run db:migrate -- --dry-run

# Appliquer les migrations en attente (001 à 004 idempotentes, sans perte de données)
npm run db:migrate
```

*(Pour une toute nouvelle installation initialisée directement avec `prisma/schema.sql`, marquer l'historique en baseline sans ré-exécuter les `ALTER` : `npm run db:migrate -- --baseline`.)*

**2. Régénérer le client Prisma et redémarrer**

```bash
npx prisma generate
pm2 restart fabtrack
```













