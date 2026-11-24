<!-- Généré par FabBoard depuis roadmap/ : ne pas modifier à la main. -->

# FabtrackJS : feuille de route

**Avancement : 3 livrés sur 41** (7 %)

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
7. **[R-010 Corriger les CVE npm production et remplacer Font Awesome Pro](roadmap/items/R-010-corriger-les-cve-npm-production-et-remplacer.md)** · À tester · jalon v1.1
   Résoudre les 13 vulnérabilités npm de production (dont proxy-addr critique) et retirer la licence commerciale Font Awesome Pro.
8. **[R-011 Isoler la base de test, corriger la flakiness et installer la CI](roadmap/items/R-011-isoler-la-base-de-test-corriger-la-flakiness-et.md)** · À tester · jalon v1.2
   Imposer DATABASE_URL_TEST, supprimer le backdoor TEST_ADMIN_USER sur la base réelle, corriger LIKE 'TEST_%' et créer la CI GitHub Actions.
9. **[R-012 Protection CSRF, conversion des 31 routes GET mutantes et durcissement Auth](roadmap/items/R-012-protection-csrf-conversion-des-31-routes-get.md)** · À tester · jalon v1.2
   Passer les 31+ actions GET mutantes en POST, ajouter un jeton CSRF natif synchronisé en session et durcir sessions, cookies, rate-limiting et révocation staff.
10. **[R-013 Éradiquer les XSS templates/DOM et sécuriser /report-bug & mailService](roadmap/items/R-013-eradiquer-les-xss-templates-dom-et-securiser.md)** · À tester · jalon v1.2
   Supprimer les injections <%- JSON.stringify %>, icônes HTML brutes, confirm() inline, innerHTML dynamiques et HTML injection dans les e-mails.
11. **[R-014 Index SQL critiques, sessions MariaDB, cache global et clôture auto des visites](roadmap/items/R-014-index-sql-critiques-sessions-mariadb-cache.md)** · À tester · jalon v1.2
   Ajouter les index DB, remplacer MemoryStore par un store MariaDB natif Prisma, mutualiser le cache de référence et sortir la clôture auto des visites de GET /fabtrack/.
12. **[R-015 Corriger les injections transverses et l'exposition de secrets](roadmap/items/R-015-corriger-les-injections-transverses-et-l.md)** · À tester · jalon v1.3
   Bloquer la Prototype Pollution i18n, les Open Redirects, les injections CSV et filtrer les secrets hors de res.locals et /api/list/*.
13. **[R-016 Confiner l'IA NL2SQL (rôle MariaDB lecture seule) et corriger les SSRF](roadmap/items/R-016-confiner-l-ia-nl2sql-role-mariadb-lecture-seule.md)** · À tester · jalon v1.3
   Exécuter les requêtes IA via un compte MariaDB lecture seule (fail-closed en prod), durcir le pare-feu SQL, bloquer les SSRF et chiffrer optionnellement les clés API au repos.
14. **[R-017 Corriger les bugs métier avérés (warnings, sorbonne, inventory, users, machines, bookstack)](roadmap/items/R-017-corriger-les-bugs-metier-averes-warnings.md)** · À tester · jalon v1.3
   Corriger six dysfonctionnements fonctionnels confirmés par l'audit sur les e-mails d'avertissement, filtres, stocks, profils et stats machines.
15. **[R-018 Garantir la transactionnalité des écritures critiques et historiser Activity.unitCost](roadmap/items/R-018-garantir-la-transactionnalite-des-ecritures.md)** · À tester · jalon v1.3
   Encapsuler stock, soldes, emprunts et import CSV dans des transactions Prisma, corriger le 413 import CSV et figer les tarifs consommables.
16. **[R-019 Migrer les schémas vers Zod v4 et généraliser la validation HTTP](roadmap/items/R-019-migrer-les-schemas-vers-zod-v4-et-generaliser-la.md)** · À tester · jalon v1.3
   Rétablir les messages d'erreur français sous Zod v4, activer le stripping contre le mass-assignment et valider paramètres, queries et POST restants.
17. **[R-020 Supprimer l'état global muté par requête et masquer les erreurs internes en prod](roadmap/items/R-020-supprimer-l-etat-global-mute-par-requete-et.md)** · À tester · jalon v1.3
   Passer la locale par requête dans dateService, synchroniser les plugins au changement uniquement et masquer stack/erreurs Prisma en production.
18. **[R-021 Agréger les statistiques en SQL, unifier APP_TIMEZONE et paginer côté serveur](roadmap/items/R-021-agreger-les-statistiques-en-sql-unifier-app.md)** · À tester · jalon v1.4
   Migrer les calculs statistiques de JS vers SQL, corriger le fuseau horaire, paginer historique/usagers et remplacer le dump autocomplete kiosque.
19. **[R-022 Unifier l'accès Prisma (fin du hack require.cache) et nettoyer code mort & socket.io](roadmap/items/R-022-unifier-l-acces-prisma-fin-du-hack-require-cache.md)** · À tester · jalon v1.4
   Remplacer les 37 new PrismaClient() par utilities/db, retirer socket.io inutilisé et supprimer les fichiers morts suivis dans Git.
20. **[R-023 Migrations SQL versionnées (NetBSD) et typage strict du schéma Prisma](roadmap/items/R-023-migrations-sql-versionnees-netbsd-et-typage.md)** · À tester · jalon v1.4
   Instaurer un historique de migrations SQL incrémentales compatible NetBSD et typer strictement enums, décimaux et relations d'Activity.
21. **[R-024 Alléger les routes/vues obèses et activer une CSP stricte sans unsafe-inline](roadmap/items/R-024-alleger-les-routes-vues-obeses-et-activer-une.md)** · À tester · jalon v1.4
   Extraire la logique métier vers services/, factoriser les duplications, sortir le JS inline et durcir la Content Security Policy.
22. **[R-025 Exploitation production (/healthz, logs structurés), RGPD et mise à niveau documentaire](roadmap/items/R-025-exploitation-production-healthz-logs-structures.md)** · À tester · jalon v1.4
   Ajouter /healthz et un logger structuré, outiller la conformité RGPD et réaligner 100 % de la documentation avec le code actuel.
23. **[R-026 Unifier les assets front en local pour un fonctionnement hors-ligne fiable](roadmap/items/R-026-unifier-les-assets-front-en-local-pour-un.md)** · À tester · jalon v1.5
   Servir une version unique de Bootstrap et Chart.js depuis node_modules, retirer @docsearch/css et alléger le GIF 404 de 4,6 Mo.
24. **[R-027 Refondre les modales de confirmation et les retours utilisateur](roadmap/items/R-027-refondre-les-modales-de-confirmation-et-les.md)** · À tester · jalon v1.5
   Remplacer les 33 confirm(), 9 alert() et 1 prompt() natifs par une modale Bootstrap réutilisable et corriger les retours d'erreur.
25. **[R-028 Améliorer l'accessibilité WCAG AA, le clavier, le mode sombre et le tactile](roadmap/items/R-028-ameliorer-l-accessibilite-wcag-aa-le-clavier-le.md)** · À tester · jalon v1.5
   Corriger <html lang>, ajouter les 65 labels manquants, réparer les contrastes mode sombre et la navigation clavier des tableaux.
26. **[R-029 Uniformiser la terminologie, éliminer le franglais et compléter l'i18n](roadmap/items/R-029-uniformiser-la-terminologie-eliminer-le.md)** · À tester · jalon v1.5
   Généraliser Contributeur / Motif de la visite, traduire les 35 vues et 242 messages flash en dur et nettoyer le catalogue i18n.
27. **[R-030 Harmoniser la navigation admin et les liens en sous-chemin reverse proxy](roadmap/items/R-030-harmoniser-la-navigation-admin-et-les-liens-en.md)** · À tester · jalon v1.5
   Corriger les liens et formulaires absolus incompatibles avec APP_BASE_PATH, masquer la modale inventaire aux non-admins et vérifier les retours admin.
28. **[R-031 Adopter le bandeau supérieur et les retouches visuelles Fab Design System (Option B)](roadmap/items/R-031-adopter-le-bandeau-superieur-et-les-retouches.md)** · À tester · jalon v1.5
   Remplacer l'en-tête centré et le sélecteur flottant par le bandeau 44 px Fab Design System en bleu Sorbonne et harmoniser cartes, boutons, tableaux et barre d'état.
29. **[R-032 Rafraîchir le kiosque et les tableaux sans rechargement avec synchro temps réel multi-postes](roadmap/items/R-032-rafraichir-le-kiosque-et-les-tableaux-sans.md)** · À tester · jalon v1.5
   Remplacer les rechargements complets de page sur le kiosque et les tableaux admin par des mises à jour dynamiques (fragments serveur + fetch) synchronisées en temps réel entre postes via SSE.
30. **[R-033 Refondre le panneau d'administration en cockpit avec menu latéral persistant (Prop. 3)](roadmap/items/R-033-refondre-le-panneau-d-administration-en-cockpit.md)** · À tester · jalon v1.5
   Remplacer le mur de 25 cartes de /admin par un menu latéral persistant filtrable sur toutes les vues admin et un cockpit d'accueil « À traiter aujourd'hui ».
31. **[R-039 Paginer l’historique du Repair Café et afficher les chiffres de l’année](roadmap/items/R-039-liste-des-objets-repares.md)** · Spécifiée · jalon v1.6
   Afficher les 25 dernières interventions, rechercher dans tout l’historique et calculer les indicateurs sur l’année civile en cours.
32. **[R-038 Afficher et personnaliser les titres des projets BookStack](roadmap/items/R-038-titre-des-projets.md)** · Spécifiée · jalon v1.6
   Afficher le titre du wiki dans Fabtrack, permettre un nom local et conserver un libellé utilisable quand BookStack est indisponible.
33. **[R-040 Synchroniser la restitution d’un équipement entre les postes](roadmap/items/R-040-synchroniser-la-restitution-d-un-equipement.md)** · Spécifiée · jalon v1.6
   Après un retour depuis la fiche contributeur ou la gestion des équipements, le kiosque et la supervision reflètent le prêt clôturé, y compris lorsque le dernier outil est rendu.
34. **[R-036 Réserver la borne au pointage individuel par badge](roadmap/items/R-036-limiter-utilisateur-borne.md)** · Spécifiée · jalon v1.6
   À l’entrée, le contributeur badgé précise son motif de visite, son projet et, s’il le souhaite, un complément. L’accueil accompagne les personnes sans badge ou sans fiche.
35. **[R-034 Support du lecteur RFID ACR122U (plugin FabtrackJS + agent local PC/SC)](roadmap/items/R-034-support-du-lecteur-rfid-acr122u-plugin.md)** · Spécifiée · jalon v1.6
   Permettre le pointage et l'enrôlement de badges RFID avec un lecteur USB PC/SC ACR122U via un pont local sur le poste borne et l'adaptation du plugin RFID côté FabtrackJS.
36. **[R-037 Associer une fiche contributeur aux membres de l’équipe](roadmap/items/R-037-compte-staff-contributeur.md)** · Spécifiée · jalon v1.6
   À l’approbation, rattacher ou créer la fiche des médiateurs et administrateurs. Les intéressés renseignent leurs propres informations et leur charte est considérée comme signée.
37. **[R-035 Transmettre les contributeurs badgés au serveur des casiers](roadmap/items/R-035-synchronisation-avec-les-casiers-connectes.md)** · Idée · jalon v1.6
   Envoyer périodiquement au serveur des casiers les utilisateurs dont la carte RFID est enregistrée dans Fabtrack, afin qu’ils puissent ouvrir les casiers.
38. **[R-041 Coût horaire machine](roadmap/items/R-041-cout-horaire-machine.md)** · Idée · jalon v1.7
   Ajouter un champ coût horaire pour les machines

## Actions à faire

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
- [ ] [A-014](roadmap/actions/A-014-verifier-l-affichage-des-icones-font-awesome.md) Vérifier l'affichage des icônes Font Awesome Free en local (R-010) (tester, R-010)
- [ ] [A-015](roadmap/actions/A-015-executer-npm-install-omit-dev-lors-du.md) Exécuter npm install --omit=dev lors du déploiement R-010 en production (tester, R-010)
- [ ] [A-016](roadmap/actions/A-016-verifier-l-absence-de-test-admin-user-en-base-de.md) Vérifier l'absence de TEST_ADMIN_USER en base de production (R-011) (tester, R-011)
- [ ] [A-017](roadmap/actions/A-017-valider-la-suite-d-integration-sur-fabtrack-test.md) Valider la suite d'intégration sur fabtrack_test et la CI GitHub Actions (R-011) (tester, R-011)
- [ ] [A-018](roadmap/actions/A-018-verifier-en-preproduction-production-la-presence.md) Vérifier en préproduction/production la présence d'un SECRET fort non-par-défaut, TRUST_PROXY et ENABLE_HTTPS dans .env avant redémarrage (tester, R-012)
- [ ] [A-019](roadmap/actions/A-019-valider-dans-le-navigateur-la-connexion-post.md) Valider dans le navigateur la connexion, POST /logout, les actions admin POST avec CSRF, la confirmation charte GET->POST /agreement/:token et le rejet 403 sans jeton CSRF (tester, R-012)
- [ ] [A-020](roadmap/actions/A-020-verifier-dans-le-navigateur-les-boites-data.md) Vérifier dans le navigateur les boîtes data-confirm sur suppressions admin, le rendu des icônes d'avertissement (kiosque/admin) et le tableau paginé d'historique usager (tester, R-013)
- [ ] [A-021](roadmap/actions/A-021-verifier-dans-administration-e-mails-le-nouveau.md) Vérifier dans Administration > E-mails le nouveau switch Signalement de bug et tester l'envoi d'un signalement connecté puis le refus d'un appel anonyme POST /report-bug (tester, R-013)
- [ ] [A-022](roadmap/actions/A-022-appliquer-les-requetes-sql-r-014-create-table.md) Appliquer les requêtes SQL R-014 (CREATE TABLE Session + 10 CREATE INDEX) et npx prisma generate en prod puis confirmer qu'une session survit à pm2 restart fabtrack (tester, R-014)
- [ ] [A-023](roadmap/actions/A-023-verifier-qu-un-changement-admin-motif-de-visite.md) Vérifier qu'un changement admin (motif de visite / workspace) apparaît immédiatement sur un autre poste kiosque sans reconnexion et qu'EXPLAIN utilise les nouveaux index (tester, R-014)
- [ ] [A-024](roadmap/actions/A-024-ouvrir-administration-parametres-verifier-dans.md) Ouvrir Administration > Paramètres, vérifier dans le code source HTML qu'aucune clé API ni api_machine_token n'apparaît en clair et confirmer que sauvegarder un réglage conserve les clés existantes (tester, R-015)
- [ ] [A-025](roadmap/actions/A-025-tester-un-export-csv-statistiques-ue-sorbonne-ou.md) Tester un export CSV (Statistiques, UE, Sorbonne ou Inventaire) et vérifier son ouverture propre dans LibreOffice/Excel (tester, R-015)
- [ ] [A-026](roadmap/actions/A-026-en-production-si-l-assistant-ia-nl2sql-est.md) En production (si l'assistant IA NL2SQL est activé), créer le compte MariaDB fabtrack_ai_ro et définir DATABASE_URL_AI_RO (et optionnellement SETTINGS_ENCRYPTION_KEY / AI_LOCAL_ALLOWED_HOSTS / BOOKSTACK_ALLOWED_HOSTS) (tester, R-016)
- [ ] [A-027](roadmap/actions/A-027-verifier-qu-une-requete-ia-legitime-s-execute.md) Vérifier qu'une requête IA légitime s'exécute sous compte RO et qu'une URL interne non autorisée (http://169.254.169.254) est bloquée sur Paramètres / BookStack (tester, R-016)
- [ ] [A-028](roadmap/actions/A-028-tester-un-ajout-d-avertissement-verifier-motif.md) Tester un ajout d'avertissement (vérifier motif/commentaire/auteur dans l'e-mail), un filtre par dates sur Sorbonne (KPI alignés) et une sortie équipement KEEP_STATUS (tester, R-017)
- [ ] [A-029](roadmap/actions/A-029-verifier-l-ajout-d-une-maintenance-machine.md) Vérifier l'ajout d'une maintenance machine antidatée (préservation de lastMaintenance) et le comportement sur /users/edit/:id introuvable (tester, R-017)
- [ ] [A-030](roadmap/actions/A-030-executer-alter-table-activity-add-column.md) Exécuter ALTER TABLE Activity ADD COLUMN unitCost DECIMAL(10, 2) NULL; et npx prisma generate en production avant redémarrage (docs/MISE_A_JOUR_PROD.md) (tester, R-018)
- [ ] [A-031](roadmap/actions/A-031-tester-un-double-emprunt-d-equipement-refuse-un.md) Tester un double emprunt d'équipement (refusé), un import CSV > 200 Ko avec projet existant et la non-rétroactivité d'une hausse de prix consommable (tester, R-018)
- [ ] [A-032](roadmap/actions/A-032-tester-les-messages-d-erreur-zod-v4-en-francais.md) Tester les messages d'erreur Zod v4 en français et le rejet d'un :id invalide (tester, R-019)
- [ ] [A-033](roadmap/actions/A-033-verifier-l-edition-d-un-usager-isexpert.md) Vérifier l'édition d'un usager (isExpert, termsAccepted), d'un consommable et d'une machine (tester, R-019)
- [ ] [A-034](roadmap/actions/A-034-verifier-l-isolation-des-dates-longues-sur-deux.md) Vérifier l'isolation des dates longues sur deux sessions concurrentes FR et EN (tester, R-020)
- [ ] [A-035](roadmap/actions/A-035-verifier-le-masquage-des-piles-d-appels-et.md) Vérifier le masquage des piles d'appels et messages internes sur erreur serveur hors développement (tester, R-020)
- [ ] [A-036](roadmap/actions/A-036-verifier-admin-statistics-periodes-graphiques-et.md) Vérifier /admin/statistics (périodes, graphiques et export CSV) sous agrégation SQL (tester, R-021)
- [ ] [A-037](roadmap/actions/A-037-tester-la-pagination-serveur-admin-view-history.md) Tester la pagination serveur (/admin/view-history, /users/manage) et l'autocomplétion kiosque (tester, R-021)
- [ ] [A-038](roadmap/actions/A-038-verifier-le-demarrage-propre-sans-socket-io.md) Vérifier le démarrage propre sans socket.io après npm install --omit=dev (tester, R-022)
- [ ] [A-039](roadmap/actions/A-039-executer-npm-run-db-migrate-sur-une-copie.md) Exécuter npm run db:migrate sur une copie anonymisée (y compris NetBSD) (tester, R-023)
- [ ] [A-040](roadmap/actions/A-040-verifier-l-absence-d-erreur-csp-en-console.md) Vérifier l'absence d'erreur CSP en console navigateur sur kiosque et écrans admin (tester, R-024)
- [ ] [A-041](roadmap/actions/A-041-tester-healthz-l-export-rgpd-individuel-et-la.md) Tester /healthz, l'export RGPD individuel et la simulation d'anonymisation CLI (tester, R-025)
- [ ] [A-042](roadmap/actions/A-042-verifier-le-fonctionnement-hors-ligne-0-requete.md) Vérifier le fonctionnement hors-ligne (0 requête CDN) sur kiosque, statistiques et 404 (tester, R-026)
- [ ] [A-043](roadmap/actions/A-043-valider-les-modales-bootstrap-les-toasts-propres.md) Valider les modales Bootstrap, les toasts propres et /report-issue (R-027) (tester, R-027)
- [ ] [A-044](roadmap/actions/A-044-valider-l-accessibilite-wcag-aa-le-mode-sombre.md) Valider l'accessibilité WCAG AA, le mode sombre Chart.js et la navigation clavier (R-028) (tester, R-028)
- [ ] [A-045](roadmap/actions/A-045-valider-la-terminologie-le-retrait-du-franglais.md) Valider la terminologie, le retrait du franglais et la synchro i18n FR/EN (R-029) (tester, R-029)
- [ ] [A-046](roadmap/actions/A-046-valider-la-navigation-admin-et-la-compatibilite.md) Valider la navigation admin et la compatibilité sous-chemin APP_BASE_PATH (R-030) (tester, R-030)
- [ ] [A-047](roadmap/actions/A-047-valider-le-bandeau-superieur-44-px-option-b-les.md) Valider le bandeau supérieur 44 px Option B, les sélecteurs segmentés et la barre d'état 24 px (R-031) (tester, R-031)
- [ ] [A-048](roadmap/actions/A-048-valider-le-rafraichissement-partiel-kiosque.md) Valider le rafraîchissement partiel kiosque/tableaux et la synchro SSE multi-postes (R-032) (tester, R-032)
- [ ] [A-049](roadmap/actions/A-049-valider-le-cockpit-d-administration-et-le-menu.md) Valider le Cockpit d'administration et le menu latéral persistant filtrable (R-033) (tester, R-033)
- [ ] [A-051](roadmap/actions/A-051-valider-le-pointage-individuel-a-la-borne.md) Valider le pointage individuel à la borne (valider, R-036)
- [ ] [A-052](roadmap/actions/A-052-valider-le-rattachement-des-fiches-de-l-equipe.md) Valider le rattachement des fiches de l’équipe (valider, R-037)
- [ ] [A-053](roadmap/actions/A-053-valider-la-priorite-des-titres-de-projet.md) Valider la priorité des titres de projet (valider, R-038)
- [ ] [A-054](roadmap/actions/A-054-valider-l-historique-et-les-chiffres-annuels-du.md) Valider l’historique et les chiffres annuels du Repair Café (valider, R-039)
- [ ] [A-055](roadmap/actions/A-055-fournir-les-specifications-d-import-du-serveur.md) Fournir les spécifications d’import du serveur des casiers (fournir, R-035)

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
