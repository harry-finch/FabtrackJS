---
id: A-048
type: tester
titre: "Valider le rafraîchissement partiel kiosque/tableaux et la synchro SSE multi-postes (R-032)"
element: R-032
statut: a-faire
cree: 2026-11-22
par: agent
fait:
---

1. Ouvrir le kiosque (/fabtrack) dans deux onglets/postes différents sur le même espace, vérifier l'indicateur 'En direct' dans la barre d'état 24 px.
2. Enregistrer une arrivée, un commentaire, une sortie et un scan RFID dans le premier poste : vérifier que le tableau se met à jour sans rechargement complet de page dans les deux postes (< 2 s).
3. Ouvrir /admin/view-history avec un filtre actif, effectuer une sortie au kiosque dans un autre onglet : vérifier que le tableau admin se rafraîchit sans perdre le filtre ni interrompre une modale ouverte.
