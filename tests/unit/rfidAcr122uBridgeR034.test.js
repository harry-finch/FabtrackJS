const fs = require("fs");
const path = require("path");
const EventEmitter = require("events");
const { formatUid, VALID_FORMATS } = require("../../scripts/rfid-bridge/uidFormat.js");
const { parseCliArgs, createBridge } = require("../../scripts/rfid-bridge/index.js");
const { adminSettingsSchema } = require("../../schemas/admin.schema.js");

const ROOT = path.join(__dirname, "../..");

describe("R-034 — ACR122U PC/SC RFID Bridge & FabtrackJS Integration", () => {
  describe("1. UID formatting (scripts/rfid-bridge/uidFormat.js)", () => {
    test("formats raw UID to uppercase hex without separator by default", () => {
      expect(formatUid("04:a1:b2:c3")).toBe("04A1B2C3");
      expect(formatUid(Buffer.from([0x04, 0xa1, 0xb2, 0xc3]))).toBe("04A1B2C3");
    });

    test("supports configurable formats (hex_lower, hex_colon, dec_be, dec_le)", () => {
      const buf = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      expect(formatUid(buf, "hex_lower")).toBe("01020304");
      expect(formatUid(buf, "hex_colon")).toBe("01:02:03:04");
      expect(formatUid(buf, "dec_be")).toBe("16909060");
      expect(formatUid(buf, "dec_le")).toBe("67305985");
      expect(VALID_FORMATS).toContain("hex_upper");
    });
  });

  describe("2. Local WebSocket + PC/SC bridge lifecycle (scripts/rfid-bridge/index.js)", () => {
    test("parseCliArgs parses --port, --format, --reader with safe defaults", () => {
      expect(parseCliArgs([], {})).toEqual({ port: 8765, format: "hex_upper", readerFilter: "" });
      expect(parseCliArgs(["--port", "9090", "--format", "hex_colon", "--reader", "ACR122"], {})).toEqual({
        port: 9090,
        format: "hex_colon",
        readerFilter: "ACR122",
      });
      // Out-of-range port or unknown format fall back safely
      expect(parseCliArgs(["--port", "80", "--format", "invalid"], {})).toEqual({
        port: 8765,
        format: "hex_upper",
        readerFilter: "",
      });
    });

    test("broadcasts reader attach, card UID scan, detach, and re-attach over localhost WebSocket", async () => {
      let fakeWss;
      let fakeNfc;

      class FakeWss extends EventEmitter {
        constructor(opts) {
          super();
          this.opts = opts;
          this.clients = new Set();
          fakeWss = this;
        }
        close(cb) {
          if (cb) cb();
        }
      }

      class FakeNfc extends EventEmitter {
        constructor() {
          super();
          fakeNfc = this;
        }
      }

      const bridge = createBridge({
        port: 8765,
        format: "hex_upper",
        WebSocketServerImpl: FakeWss,
        NFCImpl: FakeNfc,
        log: () => {},
        errorLog: () => {},
      });

      expect(fakeWss.opts).toEqual({ host: "127.0.0.1", port: 8765 });

      const sent = [];
      const fakeClient = new EventEmitter();
      fakeClient.readyState = 1;
      fakeClient.send = (msg) => sent.push(JSON.parse(msg));
      fakeWss.clients.add(fakeClient);
      fakeWss.emit("connection", fakeClient);

      // Initial status: no reader connected yet
      expect(sent[0]).toMatchObject({ type: "status", connected: false, readers: [] });

      // USB ACR122U reader attached
      const reader = new EventEmitter();
      reader.name = "ACS ACR122U PICC Interface";
      fakeNfc.emit("reader", reader);
      expect(sent[sent.length - 1]).toMatchObject({
        type: "status",
        connected: true,
        readers: ["ACS ACR122U PICC Interface"],
      });

      // Badge scanned
      reader.emit("card", { uid: "04a1b2c3" });
      expect(sent[sent.length - 1]).toMatchObject({
        type: "card",
        uid: "04A1B2C3",
        reader: "ACS ACR122U PICC Interface",
      });

      // USB reader unplugged -> disconnected status broadcast
      reader.emit("end");
      expect(sent[sent.length - 1]).toMatchObject({
        type: "status",
        connected: false,
        readers: [],
      });

      // USB reader re-plugged -> reconnected status + card scan works again
      const reader2 = new EventEmitter();
      reader2.name = "ACS ACR122U PICC Interface";
      fakeNfc.emit("reader", reader2);
      expect(sent[sent.length - 1]).toMatchObject({
        type: "status",
        connected: true,
      });

      await bridge.close();
    });
  });

  describe("3. FabtrackJS settings, CSP, listener & edit-user enrolment integration", () => {
    test("adminSettingsSchema validates rfid_acr122u_enabled and rfid_bridge_port (1024..65535)", () => {
      const ok = adminSettingsSchema.safeParse({
        plugin_settings_submitted: "true",
        plugin_rfid_enabled: "true",
        rfid_acr122u_enabled: "true",
        rfid_bridge_port: "8765",
      });
      expect(ok.success).toBe(true);
      expect(ok.data.rfid_bridge_port).toBe(8765);

      const badPort = adminSettingsSchema.safeParse({
        rfid_bridge_port: "80",
      });
      expect(badPort.success).toBe(false);
    });

    test("rfid-listener.js connects to ws://127.0.0.1 with auto-reconnect, keeps HID listener, and edit-user.ejs loads it", () => {
      const listenerSrc = fs.readFileSync(path.join(ROOT, "public/javascripts/rfid-listener.js"), "utf8");
      const editUserSrc = fs.readFileSync(path.join(ROOT, "views/fabtrack/edit-user.ejs"), "utf8");
      const indexSrc = fs.readFileSync(path.join(ROOT, "views/fabtrack/index.ejs"), "utf8");
      const appSrc = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
      const bridgeReadme = fs.readFileSync(path.join(ROOT, "scripts/rfid-bridge/README.md"), "utf8");

      expect(listenerSrc).toContain("ws://127.0.0.1:");
      expect(listenerSrc).toContain("scheduleBridgeReconnect");
      expect(listenerSrc).toContain("handleIncomingRfidUid");
      expect(listenerSrc).toContain("rfidReaderStatusBadge");
      expect(listenerSrc).toContain('"keydown"'); // HID wedge preserved

      expect(editUserSrc).toContain("javascripts/rfid-listener.js");
      expect(editUserSrc).toContain("window.rfidConfig");
      expect(indexSrc).toContain("window.rfidConfig");
      expect(appSrc).toContain("ws://127.0.0.1:*");
      expect(bridgeReadme).toContain("ACR122U");
      expect(bridgeReadme).toContain("pcscd");
    });
  });
});
