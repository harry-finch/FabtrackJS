---
id: A-033
type: tester
titre: "Vérifier l'édition d'un usager (isExpert, termsAccepted), d'un consommable et d'une machine"
element: R-019
statut: a-faire
cree: 2026-11-22
par: agent
fait:
---

Où : /users/edit/:id, /admin/consumables/manage et /admin/machines/manage. Quoi faire : modifier un usager en cochant/décochant isExpert et termsAccepted, puis créer/modifier un consommable et une machine. Quoi observer : toutes les cases légitimes sont bien enregistrées malgré le stripping strict de req.body. Quoi répondre : confirmer OK ou signaler un champ perdu.
