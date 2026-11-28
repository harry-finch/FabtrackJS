#!/usr/bin/env node
/**
 * FabtrackJS Local RFID PC/SC Bridge (R-034)
 * Connects a local USB PC/SC reader (e.g. ACS ACR122U) to the FabtrackJS web interface
 * via a localhost-only WebSocket server (ws://127.0.0.1:<port>).
 */

const { formatUid, VALID_FORMATS } = require("./uidFormat.js");

function parseCliArgs(argv = process.argv.slice(2), env = process.env) {
  let port = parseInt(env.RFID_BRIDGE_PORT || "8765", 10);
  let format = (env.RFID_UID_FORMAT || "hex_upper").trim();
  let readerFilter = (env.RFID_READER_FILTER || "").trim();

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === "--port" || arg === "-p") && argv[i + 1]) {
      port = parseInt(argv[i + 1], 10);
      i += 1;
    } else if ((arg === "--format" || arg === "-f") && argv[i + 1]) {
      format = argv[i + 1].trim();
      i += 1;
    } else if ((arg === "--reader" || arg === "-r") && argv[i + 1]) {
      readerFilter = argv[i + 1].trim();
      i += 1;
    }
  }

  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    port = 8765;
  }
  if (!VALID_FORMATS.includes(format)) {
    format = "hex_upper";
  }

  return { port, format, readerFilter };
}

/**
 * Starts the local WebSocket + PC/SC bridge.
 * Accepts optional dependency injection for unit testing without physical hardware.
 */
function createBridge({
  port = 8765,
  format = "hex_upper",
  readerFilter = "",
  WebSocketServerImpl = null,
  NFCImpl = null,
  log = console.log,
  errorLog = console.error,
} = {}) {
  const WebSocketServer = WebSocketServerImpl || require("ws").WebSocketServer;
  const wss = new WebSocketServer({ host: "127.0.0.1", port });
  const connectedReaders = new Map();
  let nfcInstance = null;
  let retryTimer = null;
  let isClosed = false;

  function buildStatusPayload() {
    const readers = Array.from(connectedReaders.keys());
    return {
      type: "status",
      connected: readers.length > 0,
      readers,
      format,
      timestamp: new Date().toISOString(),
    };
  }

  function broadcast(payload) {
    const serialized = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === 1) {
        try {
          client.send(serialized);
        } catch (err) {
          errorLog("[rfid-bridge] Failed to send WS payload:", err.message);
        }
      }
    }
  }

  wss.on("connection", (ws) => {
    try {
      ws.send(JSON.stringify(buildStatusPayload()));
    } catch (_err) {
      // ignore initial send error
    }
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg && msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", ...buildStatusPayload() }));
        }
      } catch (_err) {
        // ignore malformed client messages
      }
    });
  });

  function attachNfc() {
    if (isClosed) return;
    let NFCClass = NFCImpl;
    if (!NFCClass) {
      try {
        NFCClass = require("nfc-pcsc").NFC;
      } catch (err) {
        errorLog(
          "[rfid-bridge] Module 'nfc-pcsc' introuvable. Exécutez `npm install` dans scripts/rfid-bridge/.",
          err.message,
        );
        return;
      }
    }

    try {
      nfcInstance = new NFCClass();
    } catch (err) {
      errorLog("[rfid-bridge] Impossible d'initialiser PC/SC, nouvelle tentative dans 5s :", err.message);
      scheduleNfcRetry();
      return;
    }

    nfcInstance.on("reader", (reader) => {
      const readerName = reader && reader.name ? String(reader.name) : "Lecteur PC/SC";
      if (readerFilter && !readerName.toLowerCase().includes(readerFilter.toLowerCase())) {
        log(`[rfid-bridge] Lecteur ignoré (filtre "${readerFilter}") : ${readerName}`);
        return;
      }

      connectedReaders.set(readerName, reader);
      log(`[rfid-bridge] Lecteur connecté : ${readerName}`);
      broadcast(buildStatusPayload());

      reader.on("card", (card) => {
        const rawUid = card && card.uid ? card.uid : "";
        if (!rawUid) return;
        const formatted = formatUid(rawUid, format);
        if (!formatted) return;
        log(`[rfid-bridge] Badge détecté sur ${readerName} (${format})`);
        broadcast({
          type: "card",
          uid: formatted,
          rawUid: String(rawUid),
          reader: readerName,
          format,
          timestamp: new Date().toISOString(),
        });
      });

      reader.on("card.off", () => {
        broadcast({
          type: "card_removed",
          reader: readerName,
          timestamp: new Date().toISOString(),
        });
      });

      reader.on("error", (err) => {
        errorLog(`[rfid-bridge] Erreur lecteur ${readerName} :`, err && err.message ? err.message : err);
      });

      reader.on("end", () => {
        connectedReaders.delete(readerName);
        log(`[rfid-bridge] Lecteur débranché : ${readerName}`);
        broadcast(buildStatusPayload());
      });
    });

    nfcInstance.on("error", (err) => {
      errorLog("[rfid-bridge] Erreur service PC/SC :", err && err.message ? err.message : err);
      connectedReaders.clear();
      broadcast(buildStatusPayload());
      scheduleNfcRetry();
    });
  }

  function scheduleNfcRetry() {
    if (isClosed || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      attachNfc();
    }, 5000);
    if (typeof retryTimer.unref === "function") {
      retryTimer.unref();
    }
  }

  attachNfc();

  log(`[rfid-bridge] Pont WebSocket local actif sur ws://127.0.0.1:${port} (format UID : ${format})`);

  return {
    wss,
    getStatus: buildStatusPayload,
    broadcast,
    close() {
      isClosed = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      connectedReaders.clear();
      return new Promise((resolve) => wss.close(() => resolve()));
    },
  };
}

if (require.main === module) {
  const opts = parseCliArgs();
  const bridge = createBridge(opts);

  const shutdown = async () => {
    await bridge.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

module.exports = {
  parseCliArgs,
  createBridge,
};
