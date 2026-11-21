---
id: A-002
type: tester
titre: "Tester la réinitialisation de mot de passe en local"
element: R-004
statut: a-faire
cree: 2026-11-21
par: agent
fait:
---

Si votre base locale existe déjà, exécuter d'abord : ALTER TABLE Staff MODIFY COLUMN pwdToken VARCHAR(64) NULL; puis lancer npm run dev (http://localhost:8080/forgot). Vérifier : 1) demande avec un e-mail inexistant = même message sans erreur 500 ; 2) demande avec un e-mail staff existant = e-mail reçu ; 3) sur /reset/<token>, mot de passe < 8 car. ou non identique refusé ; 4) réinitialisation réussie puis réutilisation du même lien refusée ; 5) connexion OK avec le nouveau mot de passe (et un compte existant à mot de passe court continue de se connecter).
