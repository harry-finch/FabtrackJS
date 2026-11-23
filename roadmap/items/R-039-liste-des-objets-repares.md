---
id: R-039
titre: "Paginer l’historique du Repair Café et afficher les chiffres de l’année"
resume: "Afficher les 25 dernières interventions, rechercher dans tout l’historique et calculer les indicateurs sur l’année civile en cours."
statut: specifiee
jalon: v1.6
cree: 2026-11-22
maj: 2026-11-23
livree:
---
## But

Retrouver une réparation ancienne sans parcourir toute la liste. En haut de la page d’administration du Repair Café, l’équipe voit les résultats de l’année civile en cours.

## Inclus

- Ouvrir l’historique sur les 25 interventions les plus récentes, par date de visite décroissante. Parcourir les suivantes par pages de 25.
- Rechercher un objet ou un contributeur dans toutes les années et combiner la recherche avec un filtre par statut de réparation. Appliquer les critères avant la pagination.
- Afficher l’année dans l’en-tête des indicateurs. Calculer les chiffres et taux existants à partir des visites de cette année, dans le fuseau horaire configuré du fablab. La pagination, le texte recherché et le statut filtrent uniquement la liste.

## Hors périmètre

Archivage ou suppression des interventions anciennes, modification des statuts et des formules de taux de réparation.

## Dépendances

Aucune. Le plugin Repair Café et l’historique existant fournissent les données.

## Critères d'acceptation

- Avec 26 interventions, la première page contient 25 lignes et la deuxième la ligne restante. À date égale, l’ordre est stable et une intervention ne figure que sur une page.
- Une recherche retrouve une intervention d’une année antérieure initialement hors de la première page. Le statut se cumule avec la recherche. Changer un filtre ramène à la première page des résultats.
- Une recherche sans résultat affiche un état vide. Les chiffres en tête restent ceux de l’année civile courante et conservent les règles existantes de calcul, y compris pour les contributeurs distincts.
- Une visite du 31 décembre et une du 1er janvier relèvent chacune de leur année locale. En début d’année, l’historique ancien reste consultable même si les indicateurs sont encore à zéro.

## Vérifications de l'utilisateur

- Retrouver une ancienne intervention par nom d’objet ou de contributeur, puis par statut.
- Comparer les indicateurs annuels avant et après un filtre qui réduit la liste à une seule intervention.
