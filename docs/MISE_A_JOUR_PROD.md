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
