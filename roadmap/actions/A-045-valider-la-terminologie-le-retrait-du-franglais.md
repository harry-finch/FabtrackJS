---
id: A-045
type: tester
titre: "Valider la terminologie, le retrait du franglais et la synchro i18n FR/EN (R-029)"
element: R-029
statut: a-faire
cree: 2026-11-22
par: agent
fait:
---

1. Basculer la langue FR <-> EN sur le kiosque et sur /admin/settings, enregistrer un paramètre et vérifier que le toast s'affiche traduit dans la langue courante.
2. Vérifier /login, /register, /forgot, /admin/machines/manage et /admin/machines/view/:id : plus aucun titre 'Fabtrack signin', 'Manage Machines' ni 'Back to Machines List'.
3. Exporter le fichier CSV des traductions depuis /admin/settings et vérifier qu'il est synchronisé avec fr.json et en.json (inclut common.menu, sans auth.remember_me).
