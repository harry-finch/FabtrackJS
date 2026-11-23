---
id: R-036
titre: "Réserver la borne au pointage individuel par badge"
resume: "À l’entrée, le contributeur badgé précise son motif de visite, son projet et, s’il le souhaite, un complément. L’accueil accompagne les personnes sans badge ou sans fiche."
statut: specifiee
jalon: v1.6
cree: 2026-11-22
maj: 2026-11-23
livree:
---
## But

Permettre à un contributeur de pointer seul à la borne pour son propre passage. Une personne qui vient pour la première fois ou qui a oublié son badge doit savoir où trouver un membre de l’équipe.

## Inclus

- Avec le rôle borne, afficher l’invitation à badger et une consigne permanente pour passer à l’accueil en cas de première visite ou d’oubli de badge. Un badge inconnu renvoie à ce même accueil.
- À l’entrée, reconnaître le contributeur puis lui proposer le motif de la visite, le projet concerné et les champs complémentaires du motif, dont le commentaire facultatif. Appliquer les règles de la charte et les conditions de saisie déjà utilisées à l’accueil.
- Proposition pour le projet du jour : permettre de choisir un projet de la personne ou de renseigner un nouveau lien selon le motif. Valider l’entrée après confirmation. À la sortie, un scan du même badge clôt la visite ouverte selon les règles de l’espace.
- Réserver au personnel identifié avec son propre compte l’inscription, l’association d’un badge, la consultation des présences et des profils et la saisie d’activités. Appliquer ces droits à la page, aux fragments et aux requêtes serveur.

## Hors périmètre

Refonte du poste des médiateurs et installation d’un nouveau modèle de lecteur.

## Dépendances

Le plugin RFID assure la lecture. Le parcours fonctionne avec les lecteurs clavier existants. R-034 ajoute l’ACR122U au même parcours ; son enrôlement de badges relève du poste utilisé par le personnel.

## Critères d'acceptation

- Avec un badge connu et une charte acceptée, confirmer une entrée enregistre une seule visite pour le bon contributeur, dans le bon espace, avec le motif, le projet et le commentaire saisis. Le champ facultatif peut rester vide.
- Annuler ou abandonner avant confirmation laisse la visite non enregistrée. Une nouvelle personne qui badge ne voit aucune donnée de la saisie précédente. Une double lecture ou une double confirmation ne crée pas de visite supplémentaire.
- Lors d’une visite ouverte, badger enregistre la sortie et remet la borne en attente pour la personne suivante.
- Un badge inconnu ou une entrée refusée au titre de la charte oriente vers l’accueil. Le rôle borne ne permet ni recherche de personnes, ni lecture d’une fiche ou d’une liste de présents, ni création de compte ou d’activité, y compris par appel direct. Un médiateur peut toujours inscrire une personne et associer son badge à l’accueil.

## Vérifications de l'utilisateur

- Faire une entrée avec motif, projet et commentaire, puis une sortie avec le même badge sur une borne.
- Essayer le parcours d’une personne sans badge et celui d’une personne dont le badge est inconnu, puis vérifier la prise en charge au poste d’accueil.
