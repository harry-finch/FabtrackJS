# Agent local RFID PC/SC (ACR122U) — FabtrackJS (`R-034`)

Ce pont Node.js autonome lit l'UID matériel des badges NFC/RFID sur un lecteur USB PC/SC (comme l'**ACS ACR122U**) branché sur le poste borne ou le poste d'accueil, puis le diffuse au navigateur local via WebSocket sur `ws://127.0.0.1:<port>`.

- Aucune modification n'est nécessaire sur les serveurs FabtrackJS distants : l'agent tourne uniquement sur l'ordinateur physique où est connecté le lecteur USB.
- Les lecteurs USB en émulation clavier (HID) continuent de fonctionner en parallèle sans régression.

---

## 1. Prérequis système (PC/SC)

### Linux (Debian / Ubuntu / Raspberry Pi OS)
```bash
sudo apt update
sudo apt install -y pcscd libpcsclite-dev build-essential
sudo systemctl enable --now pcscd
```
*(Si `pcsc_scan` affiche l'ACR122U, le lecteur est reconnu par le système.)*

### macOS
Le démon PC/SC (`com.apple.ctkd`) est intégré nativement à macOS. Il suffit de disposer de Node.js ≥ 18 et des Xcode Command Line Tools (`xcode-select --install`).

### Windows
Le service **Carte à puce (SCardSvr)** est intégré à Windows. Installer le pilote officiel **ACS ACR122U PC/SC Driver** puis vérifier que le service « Carte à puce » est en démarrage automatique.

---

## 2. Installation

Sur le poste borne / accueil :

```bash
cd scripts/rfid-bridge
npm install
```

---

## 3. Lancement et options

```bash
# Lancement par défaut (ws://127.0.0.1:8765, format UID hexadécimal majuscule sans séparateur ex. 04A1B2C3)
npm start

# Avec options personnalisées
node index.js --port 8765 --format hex_upper --reader ACR122
```

### Variables d'environnement / arguments CLI

| Option CLI | Variable `.env` | Défaut | Description |
| --- | --- | --- | --- |
| `--port`, `-p` | `RFID_BRIDGE_PORT` | `8765` | Port WebSocket local (`127.0.0.1` uniquement, plage `1024–65535`). |
| `--format`, `-f` | `RFID_UID_FORMAT` | `hex_upper` | Format UID : `hex_upper` (`04A1B2C3`), `hex_lower`, `hex_colon` (`04:A1:B2:C3`), `dec_be`, `dec_le`. |
| `--reader`, `-r` | `RFID_READER_FILTER` | *(tous)* | Filtre optionnel sur le nom du lecteur PC/SC (ex. `ACR122`). |

---

## 4. Configuration côté FabtrackJS

1. Se connecter en administrateur et ouvrir **Administration > Configuration générale** (`/admin/settings`).
2. Dans la carte **Plugin Borne RFID** :
   - Vérifier que le plugin RFID est **Activé**.
   - Activer **Pont local ACR122U (PC/SC WebSocket)**.
   - Vérifier que le **Port WebSocket local** correspond à celui de l'agent (défaut `8765`).
3. Enregistrer les paramètres.
4. Sur la borne (`/fabtrack`) ou une fiche contributeur (`/users/edit/:id`) :
   - L'indicateur affiche **Lecteur ACR122U connecté** dès que le lecteur est branché.
   - Débrancher / rebrancher l'ACR122U ou redémarrer l'agent rétablit la lecture automatiquement sans recharger la page.

---

## 5. Démarrage automatique (service)

### Linux (`systemd`)
Créer `/etc/systemd/system/fabtrack-rfid-bridge.service` :
```ini
[Unit]
Description=FabtrackJS Local RFID PC/SC Bridge (ACR122U)
After=network.target pcscd.service
Requires=pcscd.service

[Service]
Type=simple
WorkingDirectory=/opt/fabtrack-rfid-bridge
ExecStart=/usr/bin/node /opt/fabtrack-rfid-bridge/index.js --port 8765 --format hex_upper
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```
Puis :
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fabtrack-rfid-bridge
```

### macOS (`launchd`)
Créer `~/Library/LaunchAgents/fr.fablab.fabtrack-rfid-bridge.plist` pointant vers `node .../scripts/rfid-bridge/index.js` avec `RunAtLoad` et `KeepAlive` à `true`, puis `launchctl load -w ...`.

### Windows (Planificateur de tâches)
Créer une tâche planifiée « À l'ouverture de session » lançant `node.exe` avec l'argument `C:\fabtrack\scripts\rfid-bridge\index.js`.
