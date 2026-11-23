---
id: R-038
titre: "Afficher et personnaliser les titres des projets BookStack"
resume: "Afficher le titre du wiki dans Fabtrack, permettre un nom local et conserver un libellé utilisable quand BookStack est indisponible."
statut: specifiee
jalon: v1.6
cree: 2026-11-22
maj: 2026-11-23
livree:
---
## But

Reconnaître un projet par son nom lorsqu’on le choisit à l’accueil ou qu’on consulte son historique. L’équipe peut adopter un nom d’usage dans Fabtrack tout en gardant le lien vers sa documentation.

## Inclus

- Résoudre le titre de la page ou du livre BookStack lié, pour les projets nouveaux et existants. Utiliser le même libellé dans les sélecteurs et dans les vues qui désignent le projet ; garder l’accès au lien documentaire.
- Proposition de priorité d’affichage : nom personnalisé dans Fabtrack, puis dernier titre connu du wiki, puis URL du projet.
- Permettre au personnel autorisé à gérer le projet de définir ou d’effacer son nom local. Un nom local s’applique au projet partagé ; le renommage dans Fabtrack est indépendant de celui du wiki.
- En cas d’indisponibilité de BookStack, permettre le choix du projet et l’enregistrement de la visite avec les données disponibles.

## Hors périmètre

Écriture dans BookStack, modification des URL documentaires et rapprochement de projets distincts qui portent le même titre.

## Dépendances

Service BookStack existant pour récupérer le titre distant. Le nom local et le repli sur l’URL peuvent être utilisés lorsque l’intégration est désactivée.

## Critères d'acceptation

- Pour un projet existant lié à une page ou à un livre, une récupération réussie affiche le titre du document correspondant. Le lien et l’identité du projet restent utilisables dans les anciennes visites.
- Sans nom personnalisé, le nouveau titre d’un document renommé apparaît après une actualisation réussie. Avec un nom personnalisé, le libellé local reste affiché. L’effacer rétablit le dernier titre wiki connu.
- Wiki indisponible, document introuvable ou projet sans page BookStack : le libellé suit la priorité définie ci-dessus. La sélection d’un projet continue de fonctionner.

## Vérifications de l'utilisateur

- Choisir un projet existant par son titre au kiosque et ouvrir sa documentation depuis Fabtrack.
- Donner au projet un nom propre au fablab, vérifier son affichage, puis effacer ce nom pour retrouver le titre du wiki.
