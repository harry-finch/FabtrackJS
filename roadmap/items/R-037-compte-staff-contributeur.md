---
id: R-037
titre: "Associer une fiche contributeur aux membres de l’équipe"
resume: "À l’approbation, rattacher ou créer la fiche des médiateurs et administrateurs. Les intéressés renseignent leurs propres informations et leur charte est considérée comme signée."
statut: a-tester
jalon: v1.6
cree: 2026-11-22
maj: 2026-11-28
livree:
---
## But

Un membre de l’équipe doit pouvoir badger et suivre ses propres visites avec une fiche unique. L’approbation de son compte professionnel déclenche le rattachement de cette fiche.

## Inclus

- Couvrir les médiateurs et les administrateurs, nouvellement approuvés et déjà approuvés. Les comptes de borne sont des comptes techniques.
- Réutiliser la fiche active de même adresse e-mail en conservant son identité, son historique, ses projets et son badge. Sinon, créer la fiche avec le prénom, le nom, l’e-mail du compte et un type de contributeur.
- Faire renseigner les informations manquantes par la personne elle-même. Proposition de parcours : à l’inscription pour les nouveaux comptes ; à la prochaine connexion personnelle pour un compte déjà approuvé auquel il manque ces informations.
- Considérer la charte comme déjà signée dès le rattachement au compte personnel approuvé.

## Hors périmètre

Fusion de fiches portant des e-mails différents, attribution d’un badge et synchronisation avec les casiers.

## Dépendances

Aucune dépendance matérielle. Réutiliser le parcours d’approbation du personnel et les types de contributeurs du fablab.

## Critères d'acceptation

- L’approbation d’un médiateur ou d’un administrateur ayant renseigné ses informations établit le lien avec exactement une fiche. Deux approbations successives aboutissent à la même fiche.
- Avec une fiche active du même e-mail, le rattachement conserve son identifiant, son badge et ses visites. La charte y est acceptée et aucun nouvel e-mail de signature n’est envoyé.
- Un membre déjà approuvé sans fiche peut compléter lui-même les champs requis. Une donnée manquante donne lieu à une demande de saisie ; son identifiant de connexion ne devient pas un nom civil par défaut.
- Un compte en attente et un compte borne ne déclenchent aucune création de fiche contributeur. Une correspondance avec une fiche archivée est signalée pour examen avant toute réactivation.

## Vérifications de l'utilisateur

- Approuver un nouveau médiateur et vérifier que sa fiche contient les informations qu’il a lui-même fournies et que sa charte est acceptée.
- Essayer le rattachement d’un membre déjà équipé d’un badge et retrouver ses visites antérieures sur la même fiche.
