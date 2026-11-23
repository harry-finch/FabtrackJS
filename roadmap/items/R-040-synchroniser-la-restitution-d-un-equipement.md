---
id: R-040
titre: "Synchroniser la restitution d’un équipement entre les postes"
resume: "Après un retour depuis la fiche contributeur ou la gestion des équipements, le kiosque et la supervision reflètent le prêt clôturé, y compris lorsque le dernier outil est rendu."
statut: specifiee
jalon: v1.6
cree: 2026-11-23
maj: 2026-11-23
livree:
---
## But

Quand un outil est rendu, le médiateur à la borne et la personne qui supervise les équipements doivent pouvoir se fier à ce qu’ils voient à l’écran. Aujourd’hui les deux entrées enregistrent le retour, mais seule la fiche contributeur signale le changement aux autres postes. Le rafraîchissement admin porte sur les tableaux et laisse les compteurs en dehors de la mise à jour.

## Inclus

- Donner le même effet métier au bouton « Restituer » de la fiche contributeur et à celui de la page de gestion des équipements. Partager la décision de restitution et ses effets entre les deux contrôleurs dans le service des prêts.
- Après confirmation du retour, actualiser le badge de prêt du contributeur présent sur le kiosque et, sur les pages Équipements déjà ouvertes, la liste des prêts actifs, les compteurs de prêts et de retards et l’indication de prêt dans le catalogue. Respecter une saisie ou une modale ouverte.
- Corriger la section 13 de DEVELOPMENT.md. La création passe par POST /history/activity. Les deux routes de retour sont POST /history/equipment/return/:id et POST /admin/equipment/return/:id. L’identifiant désigne une activité de type EQUIPMENT. La date de retour et l’éventuelle note sont portées par Activity.returnedAt et Activity.returnNotes.

## Hors périmètre

Création et prolongation des prêts, refonte générale du rafraîchissement des pages admin, modification du schéma de données.

## Dépendances

S’appuyer sur la restitution atomique existante (R-018 et R-024) et sur les notifications entre postes (R-032).

## Critères d'acceptation

- Tester les deux routes de retour sur une base dédiée. Un premier retour date le prêt, conserve la note fournie et laisse la visite ouverte si le contributeur est toujours présent. Un prêt ancien identifié par resourceId seul est également restituable.
- Si deux postes confirment le même retour, un seul obtient le succès. L’autre reçoit « déjà restitué ». La première date et la première note sont conservées. Une seule restitution est journalisée et un seul avis de changement est émis sur chacun des canaux kiosque et admin.
- Quel que soit l’écran d’origine, sur les autres postes connectés et hors saisie, le prêt disparaît sans rechargement manuel. Si le contributeur détient encore un outil, son badge indique le nombre restant. Après son dernier retour, le badge disparaît.
- En supervision, restituer le dernier prêt actif, également en retard, fait passer les deux compteurs de un à zéro, affiche l’état vide et retire l’indication de prêt de l’outil. Une saisie en cours sur un autre poste est préservée.
- Une activité absente ou d’un autre type donne le message « Emprunt introuvable ». Un compte borne ne peut pas enregistrer un retour. Dans ces cas, aucun prêt n’est modifié et aucun changement n’est diffusé.

## Vérifications de l'utilisateur

- Laisser le kiosque ouvert sur un poste avec un contributeur présent, restituer son dernier outil depuis la gestion des équipements sur un autre poste et constater la disparition du badge tout en gardant le contributeur dans la liste.
- Laisser la gestion des équipements ouverte, restituer le dernier prêt en retard depuis la fiche contributeur sur un autre poste et vérifier les deux compteurs à zéro ainsi que le message de liste vide.
