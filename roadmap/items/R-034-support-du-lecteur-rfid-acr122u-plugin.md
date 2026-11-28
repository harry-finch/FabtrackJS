---
id: R-034
titre: "Support du lecteur RFID ACR122U (plugin FabtrackJS + agent local PC/SC)"
resume: "Permettre le pointage et l'enrôlement de badges RFID avec un lecteur USB PC/SC ACR122U via un pont local sur le poste borne et l'adaptation du plugin RFID côté FabtrackJS."
statut: a-tester
jalon: v1.6
cree: 2026-11-22
maj: 2026-11-28
livree:
---
## But

Les lecteurs PC/SC comme l'ACR122U n'émettent pas de frappes clavier (émulation HID), contrairement à ce qu'attend actuellement `public/javascripts/rfid-listener.js`. Ce changement permet d'utiliser un ACR122U branché sur le poste borne pour le pointage entrée/sortie et l'association de badges, tout en conservant la compatibilité avec les lecteurs émulation clavier.

## Inclus

- **Agent local (poste borne)** :
  - Script Node.js autonome (`nfc-pcsc`) dans `scripts/rfid-bridge/` à exécuter sur l'ordinateur où est branché l'ACR122U (écoute PC/SC à la détection/retrait de carte, compatible Linux, macOS et Windows).
  - Extraction de l'UID du badge en hexadécimal majuscule sans séparateur par défaut (ex. `04A1B2C3`), avec option configurable de conversion de format si nécessaire pour d'anciens badges.
  - Serveur WebSocket local (`ws://127.0.0.1:<port>`) diffusant les événements de lecture au navigateur ouvert sur le même poste, avec reconnexion automatique si le lecteur est débranché/rebranché.
  - Documentation d'installation et de lancement (dépendances système PC/SC, service / lancement automatique, configuration du port et du format UID).
- **Côté FabtrackJS** :
  - Mise à jour de `public/javascripts/rfid-listener.js` pour se connecter au pont WebSocket local (en parallèle de l'écoute clavier existante) et déclencher `triggerKioskRfidScan(uid)` ou remplir le champ `#newrfid` / `#rfid` s'il est actif.
  - Indicateur discret d'état de connexion au lecteur local sur la borne (connecté / déconnecté) lorsque le plugin RFID est activé.
  - Chargement du listener sur la page d'édition utilisateur (`views/fabtrack/edit-user.ejs`) en plus de la borne (`views/fabtrack/index.ejs`) pour associer un badge depuis l'administration.
  - Configuration du port WebSocket local (et activation/désactivation du pont ACR122U) dans les paramètres du plugin ou la configuration client.
  - Mise à jour des tests et de la documentation du plugin RFID.

## Hors périmètre

- Lecture/écriture de secteurs sécurisés MIFARE ou chiffrement applicatif (seul l'UID matériel du badge est lu).
- Remplacement des endpoints machines NFC (`R-006`) qui communiquent directement avec des boîtiers ESP/IoT.
- Connexion directe navigateur → USB via WebUSB/WebNFC sans agent local.
- Packaging en installeur natif (`.exe` / `.dmg` / `.deb`) : livraison sous forme de script versionné dans le dépôt avec guide d'installation.

## Dépendances

Aucune.

## Critères d'acceptation

- Présenter un badge sur l'ACR122U alors que la borne est ouverte déclenche le check-in / check-out avec le même overlay visuel que l'émulation clavier.
- Présenter un badge alors que le champ `#newrfid` (création borne) ou `#rfid` (édition utilisateur) a le focus remplit automatiquement le champ avec l'UID.
- Débrancher puis rebrancher l'ACR122U (ou redémarrer l'agent local) rétablit la lecture sans recharger la page FabtrackJS.
- Les lecteurs USB en émulation clavier continuent de fonctionner sans régression.
- `npx jest tests/unit/ --forceExit` et `fabboard roadmap lint` passent sans erreur.

## Vérifications de l'utilisateur

- Installer et lancer l'agent local sur le poste borne équipé d'un ACR122U.
- Vérifier le pointage entrée/sortie d'un usager connu et le message d'erreur pour un badge inconnu sur la borne.
- Vérifier l'association d'un nouveau badge depuis le formulaire borne et la fiche utilisateur.
- Vérifier le comportement après débranchement/rebranchement du lecteur USB.
