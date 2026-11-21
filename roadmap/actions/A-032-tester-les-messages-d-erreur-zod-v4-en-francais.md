---
id: A-032
type: tester
titre: "Tester les messages d'erreur Zod v4 en français et le rejet d'un :id invalide"
element: R-019
statut: a-faire
cree: 2026-11-22
par: agent
fait:
---

Où : sur l'instance de test (ex. /admin/consumables/manage, /users/edit/abc, /admin/statistics?startDate=2026-02-31). Quoi faire : soumettre un formulaire admin avec un champ obligatoire vide et visiter une URL avec un :id non numérique ou une date invalide. Quoi observer : un message flash en français (pas de 'Invalid input'), aucune erreur 500 ni boucle de redirection. Quoi répondre : confirmer OK ou noter le formulaire/URL défaillant.
