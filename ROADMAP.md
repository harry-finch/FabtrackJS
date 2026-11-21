<!-- Généré par FabBoard depuis roadmap/ : ne pas modifier à la main. -->

# FabtrackJS : feuille de route

**Avancement : 3 livrés sur 33** (9 %)

## Restant à faire

1. **[R-004 Sécuriser la réinitialisation de mot de passe staff](roadmap/items/R-004-securiser-la-reinitialisation-de-mot-de-passe.md)** · À tester · jalon v1.1
   Supprimer la prise de contrôle de compte sans authentification sur POST /reset_password et l'énumération d'e-mails sur POST /reset.
2. **[R-005 Sécuriser les uploads de fichiers (/report-issue, machines, settings)](roadmap/items/R-005-securiser-les-uploads-de-fichiers-report-issue.md)** · À tester · jalon v1.1
   Fermer la XSS stockée anonyme par upload public, filtrer les images machines/branding et empêcher la saturation disque.
3. **[R-006 Verrouiller l'API machines/NFC en Fail-Closed et corriger machineUsageService](roadmap/items/R-006-verrouiller-l-api-machines-nfc-en-fail-closed-et.md)** · À tester · jalon v1.1
   Sécuriser les endpoints /api/machines/* par défaut, supprimer la fuite PII de User et corriger les failles d'autorisation et d'IDOR.
4. **[R-007 Verrouiller le rôle borne kiosque (staff) et corriger le RBAC médiateurs](roadmap/items/R-007-verrouiller-le-role-borne-kiosque-staff-et.md)** · À tester · jalon v1.1
   Empêcher la borne kiosque (staff) d'exécuter des actions financières ou destructives et rétablir les habilitations pour les médiateurs (user).
5. **[R-008 Corriger le bug confirm() dans main.js, sécuriser simpleLogger et SMTP_PORT](roadmap/items/R-008-corriger-le-bug-confirm-dans-main-js-securiser.md)** · À tester · jalon v1.1
   Empêcher les suppressions accidentelles en sous-chemin, les crashs serveur sur promesses rejetées et la collision PORT/SMTP.
6. **[R-009 Réparer le bootstrap /setup et resynchroniser prisma/schema.sql](roadmap/items/R-009-reparer-le-bootstrap-setup-et-resynchroniser.md)** · À tester · jalon v1.1
   Importer setupService dans app.js, corriger la création des espaces de travail au setup et réaligner schema.sql avec v1.0.
7. **[R-010 Corriger les CVE npm production et remplacer Font Awesome Pro](roadmap/items/R-010-corriger-les-cve-npm-production-et-remplacer.md)** · Idée · jalon v1.1
   Résoudre les 13 vulnérabilités npm de production (dont proxy-addr critique) et retirer la licence commerciale Font Awesome Pro.
8. **[R-011 Isoler la base de test, corriger la flakiness et installer la CI](roadmap/items/R-011-isoler-la-base-de-test-corriger-la-flakiness-et.md)** · Idée · jalon v1.2
   Imposer DATABASE_URL_TEST, supprimer le backdoor TEST_ADMIN_USER sur la base réelle, corriger LIKE 'TEST_%' et créer la CI GitHub Actions.
9. **[R-012 Protection CSRF, conversion des 31 routes GET mutantes et durcissement Auth](roadmap/items/R-012-protection-csrf-conversion-des-31-routes-get.md)** · Idée · jalon v1.2
   Passer les 31 actions GET mutantes en POST, ajouter un jeton CSRF et durcir sessions, cookies, rate-limiting et révocation staff.
10. **[R-013 Éradiquer les XSS templates/DOM et sécuriser /report-bug & mailService](roadmap/items/R-013-eradiquer-les-xss-templates-dom-et-securiser.md)** · Idée · jalon v1.2
   Supprimer les injections <%- JSON.stringify %>, icônes HTML brutes, confirm() inline, innerHTML dynamiques et HTML injection dans les e-mails.
11. **[R-014 Index SQL critiques, sessions MariaDB, cache global et clôture auto des visites](roadmap/items/R-014-index-sql-critiques-sessions-mariadb-cache.md)** · Idée · jalon v1.2
   Ajouter les index DB, remplacer MemoryStore et le cache par session, et sortir la clôture des visites de GET /fabtrack/.
12. **[R-015 Corriger les injections transverses et l'exposition de secrets](roadmap/items/R-015-corriger-les-injections-transverses-et-l.md)** · Idée · jalon v1.3
   Bloquer la Prototype Pollution i18n, les Open Redirects, les injections CSV et filtrer les secrets hors de res.locals et /api/list/*.
13. **[R-016 Confiner l'IA NL2SQL (rôle MariaDB lecture seule) et corriger les SSRF](roadmap/items/R-016-confiner-l-ia-nl2sql-role-mariadb-lecture-seule.md)** · Idée · jalon v1.3
   Exécuter les requêtes IA via un compte MariaDB lecture seule sur des vues sans PII, durcir le pare-feu SQL et bloquer les SSRF.
14. **[R-017 Corriger les bugs métier avérés (warnings, sorbonne, inventory, users, machines, bookstack)](roadmap/items/R-017-corriger-les-bugs-metier-averes-warnings.md)** · Idée · jalon v1.3
   Corriger six dysfonctionnements fonctionnels confirmés par l'audit sur les e-mails d'avertissement, filtres, stocks, profils et stats machines.
15. **[R-018 Garantir la transactionnalité des écritures critiques et historiser Activity.unitCost](roadmap/items/R-018-garantir-la-transactionnalite-des-ecritures.md)** · Idée · jalon v1.3
   Encapsuler stock, soldes, emprunts et import CSV dans des transactions Prisma, corriger le 413 import CSV et figer les tarifs consommables.
16. **[R-019 Migrer les schémas vers Zod v4 et généraliser la validation HTTP](roadmap/items/R-019-migrer-les-schemas-vers-zod-v4-et-generaliser-la.md)** · Idée · jalon v1.3
   Rétablir les messages d'erreur français sous Zod v4, activer le stripping contre le mass-assignment et valider paramètres, queries et POST restants.
17. **[R-020 Supprimer l'état global muté par requête et masquer les erreurs internes en prod](roadmap/items/R-020-supprimer-l-etat-global-mute-par-requete-et.md)** · Idée · jalon v1.3
   Passer la locale par requête dans dateService, synchroniser les plugins au changement uniquement et masquer stack/erreurs Prisma en production.
18. **[R-021 Agréger les statistiques en SQL, unifier APP_TIMEZONE et paginer côté serveur](roadmap/items/R-021-agreger-les-statistiques-en-sql-unifier-app.md)** · Idée · jalon v1.4
   Migrer les calculs statistiques de JS vers SQL, corriger le fuseau horaire, paginer historique/usagers et remplacer le dump autocomplete kiosque.
19. **[R-022 Unifier l'accès Prisma (fin du hack require.cache) et nettoyer code mort & socket.io](roadmap/items/R-022-unifier-l-acces-prisma-fin-du-hack-require-cache.md)** · Idée · jalon v1.4
   Remplacer les 37 new PrismaClient() par utilities/db, retirer socket.io inutilisé et supprimer les fichiers morts suivis dans Git.
20. **[R-023 Migrations SQL versionnées (NetBSD) et typage strict du schéma Prisma](roadmap/items/R-023-migrations-sql-versionnees-netbsd-et-typage.md)** · Idée · jalon v1.4
   Instaurer un historique de migrations SQL incrémentales compatible NetBSD et typer strictement enums, décimaux et relations d'Activity.
21. **[R-024 Alléger les routes/vues obèses et activer une CSP stricte sans unsafe-inline](roadmap/items/R-024-alleger-les-routes-vues-obeses-et-activer-une.md)** · Idée · jalon v1.4
   Extraire la logique métier vers services/, factoriser les duplications, sortir le JS inline et durcir la Content Security Policy.
22. **[R-025 Exploitation production (/healthz, logs structurés), RGPD et mise à niveau documentaire](roadmap/items/R-025-exploitation-production-healthz-logs-structures.md)** · Idée · jalon v1.4
   Ajouter /healthz et un logger structuré, outiller la conformité RGPD et réaligner 100 % de la documentation avec le code actuel.
23. **[R-026 Unifier les assets front en local pour un fonctionnement hors-ligne fiable](roadmap/items/R-026-unifier-les-assets-front-en-local-pour-un.md)** · Idée · jalon v1.5
   Servir une version unique de Bootstrap et Chart.js depuis node_modules, retirer @docsearch/css et alléger le GIF 404 de 4,6 Mo.
24. **[R-027 Refondre les modales de confirmation et les retours utilisateur](roadmap/items/R-027-refondre-les-modales-de-confirmation-et-les.md)** · Idée · jalon v1.5
   Remplacer les 33 confirm(), 9 alert() et 1 prompt() natifs par une modale Bootstrap réutilisable et corriger les retours d'erreur.
25. **[R-028 Améliorer l'accessibilité WCAG AA, le clavier, le mode sombre et le tactile](roadmap/items/R-028-ameliorer-l-accessibilite-wcag-aa-le-clavier-le.md)** · Idée · jalon v1.5
   Corriger <html lang>, ajouter les 65 labels manquants, réparer les contrastes mode sombre et la navigation clavier des tableaux.
26. **[R-029 Uniformiser la terminologie, éliminer le franglais et compléter l'i18n](roadmap/items/R-029-uniformiser-la-terminologie-eliminer-le.md)** · Idée · jalon v1.5
   Généraliser Contributeur / Motif de la visite, traduire les 35 vues et 242 messages flash en dur et nettoyer le catalogue i18n.
27. **[R-030 Harmoniser la navigation admin et les liens en sous-chemin reverse proxy](roadmap/items/R-030-harmoniser-la-navigation-admin-et-les-liens-en.md)** · Idée · jalon v1.5
   Corriger les liens et formulaires absolus incompatibles avec APP_BASE_PATH, masquer la modale inventaire aux non-admins et vérifier les retours admin.
28. **[R-031 Adopter le bandeau supérieur et les retouches visuelles Fab Design System (Option B)](roadmap/items/R-031-adopter-le-bandeau-superieur-et-les-retouches.md)** · Idée · jalon v1.5
   Remplacer l'en-tête centré et le sélecteur flottant par le bandeau 44 px Fab Design System en bleu Sorbonne et harmoniser cartes, boutons, tableaux et barre d'état.
29. **[R-032 Rafraîchir le kiosque et les tableaux sans rechargement avec synchro temps réel multi-postes](roadmap/items/R-032-rafraichir-le-kiosque-et-les-tableaux-sans.md)** · Idée · jalon v1.5
   Remplacer les rechargements complets de page sur le kiosque et les tableaux admin par des mises à jour dynamiques (fragments serveur + fetch) synchronisées en temps réel entre postes via SSE.
30. **[R-033 Refondre le panneau d'administration en cockpit avec menu latéral persistant (Prop. 3)](roadmap/items/R-033-refondre-le-panneau-d-administration-en-cockpit.md)** · Idée · jalon v1.5
   Remplacer le mur de 25 cartes de /admin par un menu latéral persistant filtrable sur toutes les vues admin et un cockpit d'accueil « À traiter aujourd'hui ».

## Actions à faire

- [ ] [A-001](roadmap/actions/A-001-valider-la-mise-d-equerre-de-fabtrackjs.md) Valider la mise d'équerre de FabtrackJS (valider)
- [ ] [A-002](roadmap/actions/A-002-tester-la-reinitialisation-de-mot-de-passe-en.md) Tester la réinitialisation de mot de passe en local (tester, R-004)
- [ ] [A-003](roadmap/actions/A-003-appliquer-r-004-en-production-et-auditer-la.md) Appliquer R-004 en production et auditer la table Staff (tester, R-004)
- [ ] [A-004](roadmap/actions/A-004-tester-les-uploads-securises-en-local-report.md) Tester les uploads sécurisés en local (/report-issue, machines, settings) (tester, R-005)
- [ ] [A-005](roadmap/actions/A-005-auditer-le-dossier-uploads-en-production-apres.md) Auditer le dossier uploads/ en production après déploiement R-005 (tester, R-005)
- [ ] [A-006](roadmap/actions/A-006-tester-les-endpoints-api-machines-nfc-en-local.md) Tester les endpoints API machines/NFC en local (tester, R-006)
- [ ] [A-007](roadmap/actions/A-007-verifier-le-comportement-fail-closed-de-api.md) Vérifier le comportement Fail-Closed de /api/machines/* en production (tester, R-006)
- [ ] [A-008](roadmap/actions/A-008-tester-la-matrice-rbac-admin-mediateur-borne.md) Tester la matrice RBAC (admin, médiateur, borne kiosque) en local (tester, R-007)
- [ ] [A-009](roadmap/actions/A-009-verifier-les-comptes-staff-et-roles-apres.md) Vérifier les comptes Staff et rôles après déploiement R-007 en production (tester, R-007)
- [ ] [A-010](roadmap/actions/A-010-tester-le-clic-annuler-sur-confirm-en-sous.md) Tester le clic Annuler sur confirm() en sous-chemin (R-008) (tester, R-008)
- [ ] [A-011](roadmap/actions/A-011-verifier-smtp-port-avant-deploiement-r-008-en.md) Vérifier SMTP_PORT avant déploiement R-008 en production (tester, R-008)
- [ ] [A-012](roadmap/actions/A-012-tester-le-bootstrap-setup-base-vierge-ou-rendu.md) Tester le bootstrap /setup (base vierge ou rendu) en local (tester, R-009)
- [ ] [A-013](roadmap/actions/A-013-verifier-le-verrouillage-de-setup-sur-instance.md) Vérifier le verrouillage de /setup sur instance installée (tester, R-009)

## Livré

### v0.1 : Base Node.js & suivi utilisateurs

- [R-001 Base Node.js & suivi utilisateurs](roadmap/items/R-001-base-node-js-suivi-utilisateurs.md) · livrée le 2024-08-21
  Réécriture Express/MySQL, authentification, gestion staff, notifications et avertissements.

### v0.2 : Plateforme complète, Prisma v7 & plugins

- [R-002 Plateforme complète, Prisma v7 & plugins](roadmap/items/R-002-plateforme-complete-prisma-v7-plugins.md) · livrée le 2026-09-22
  Migration Prisma v7, validation Zod, suite Jest/Supertest, prêts de matériel, pannes/bugs, i18n CSV, statistiques NL2SQL et plugins.

### v1.0 : Suivi machines NFC, finitions & v1

- [R-003 Suivi machines NFC, finitions & v1](roadmap/items/R-003-suivi-machines-nfc-finitions-v1.md) · livrée le 2026-10-29
  Terminologie contributeur/motif de la visite, API d'usage machines avec présence NFC et token API admin.
