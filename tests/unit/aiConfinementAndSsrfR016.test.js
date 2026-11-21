const aiQueryService = require("../../services/aiQueryService");
const {
  isPrivateOrReservedIp,
  validateOutboundUrl,
  assertOutboundUrlSafe,
} = require("../../utilities/ssrfGuard");
const {
  ENCRYPTED_PREFIX,
  isEncryptedValue,
  encryptSecret,
  decryptSecret,
} = require("../../utilities/secretCrypto");
const {
  wrapWithStatementTimeout,
  executeReadOnlyQuery,
} = require("../../utilities/aiReadOnlyDb");

describe("Unit (R-016): NL2SQL Confinement (RO Pool), SSRF Guard & AES-256-GCM Secret Encryption", () => {
  describe("1. Hardened SQL Firewall (aiQueryService.validateAndSanitizeSql)", () => {
    test("rejects SELECT * and SELECT alias.* while keeping COUNT(*) allowed", () => {
      expect(() => aiQueryService.validateAndSanitizeSql("SELECT * FROM User")).toThrow(/SELECT \*/i);
      expect(() => aiQueryService.validateAndSanitizeSql("SELECT u.* FROM User u")).toThrow(/SELECT \*/i);
      expect(() => aiQueryService.validateAndSanitizeSql("SELECT DISTINCT * FROM History")).toThrow(/SELECT \*/i);
      expect(aiQueryService.validateAndSanitizeSql("SELECT COUNT(*) AS total FROM History")).toBe(
        "SELECT COUNT(*) AS total FROM History",
      );
    });

    test("rejects SQL comments (/* */, --, #)", () => {
      expect(() => aiQueryService.validateAndSanitizeSql("SELECT id FROM User /* bypass */")).toThrow(/commentaires SQL/i);
      expect(() => aiQueryService.validateAndSanitizeSql("SELECT id FROM User -- comment")).toThrow(/commentaires SQL/i);
      expect(() => aiQueryService.validateAndSanitizeSql("SELECT id FROM User # comment")).toThrow(/commentaires SQL/i);
    });

    test("rejects information_schema, mysql, performance_schema, Session, and Log tables", () => {
      expect(() => aiQueryService.validateAndSanitizeSql("SELECT table_name FROM information_schema.tables")).toThrow(
        /tables d'administration/i,
      );
      expect(() => aiQueryService.validateAndSanitizeSql("SELECT user FROM mysql.user")).toThrow(
        /tables d'administration/i,
      );
      expect(() => aiQueryService.validateAndSanitizeSql("SELECT id FROM performance_schema.events_statements_current")).toThrow(
        /tables d'administration/i,
      );
      expect(() => aiQueryService.validateAndSanitizeSql("SELECT sid FROM Session")).toThrow(
        /tables d'administration/i,
      );
      expect(() => aiQueryService.validateAndSanitizeSql("SELECT description FROM Log")).toThrow(
        /tables d'administration/i,
      );
    });

    test("rejects PII & security columns (email, rfid, token, pwdToken, password)", () => {
      expect(() => aiQueryService.validateAndSanitizeSql("SELECT id, email FROM User")).toThrow(/champs de sécurité/i);
      expect(() => aiQueryService.validateAndSanitizeSql("SELECT id, rfid FROM User")).toThrow(/champs de sécurité/i);
      expect(() => aiQueryService.validateAndSanitizeSql("SELECT id, responsibleEmail FROM TeachingUnit")).toThrow(
        /champs de sécurité/i,
      );
    });

    test("wraps legitimate SELECT queries in outer LIMIT 200 subquery even if inner LIMIT is larger", () => {
      const out = aiQueryService.validateAndSanitizeSql("SELECT id, name FROM Machine LIMIT 99999");
      expect(out).toBe("SELECT * FROM (SELECT id, name FROM Machine LIMIT 99999) AS _q LIMIT 200");
    });
  });

  describe("2. Dedicated Read-Only MariaDB Pool & Fail-Closed Production Guard (1A)", () => {
    test("wrapWithStatementTimeout prefixes query with SET STATEMENT max_statement_time=5 FOR", () => {
      expect(wrapWithStatementTimeout("SELECT COUNT(*) FROM History")).toBe(
        "SET STATEMENT max_statement_time=5 FOR SELECT COUNT(*) FROM History",
      );
    });

    test("fails closed in production when DATABASE_URL_AI_RO is missing", async () => {
      await expect(
        executeReadOnlyQuery("SELECT COUNT(*) FROM History", {
          env: { NODE_ENV: "production" },
          fallbackPrisma: { $queryRawUnsafe: jest.fn() },
        }),
      ).rejects.toThrow(/DATABASE_URL_AI_RO/i);
    });

    test("executes via dedicated RO pool when provided with statement timeout", async () => {
      const mockPool = {
        query: jest.fn(async () => [{ total: 12 }]),
      };
      const rows = await executeReadOnlyQuery("SELECT COUNT(*) AS total FROM History", {
        env: { NODE_ENV: "production" },
        poolOverride: mockPool,
      });
      expect(rows).toEqual([{ total: 12 }]);
      expect(mockPool.query).toHaveBeenCalledWith(
        "SET STATEMENT max_statement_time=5 FOR SELECT COUNT(*) AS total FROM History",
      );
    });

    test("never forwards raw dbErr.message to cloud LLM during self-correction retry", async () => {
      const callProviderSpy = jest
        .spyOn(aiQueryService, "callProvider")
        .mockResolvedValueOnce('{"sql":"SELECT id FROM BadTable","explanation":"t1"}')
        .mockResolvedValueOnce('{"sql":"SELECT id FROM Machine","explanation":"t2"}');
      const getConfigSpy = jest.spyOn(aiQueryService, "getConfig").mockResolvedValue({
        provider: "openai",
        openaiApiKey: "sk-test",
        openaiModel: "gpt-4o-mini",
      });
      const execSpy = jest
        .spyOn(aiQueryService, "executeSafeQuery")
        .mockRejectedValueOnce(new Error("INTERNAL_DB_SECRET_TABLE_NAME"))
        .mockResolvedValueOnce({ rows: [{ id: 1 }], durationMs: 5 });

      const res = await aiQueryService.processNaturalLanguageQuery("Liste les machines");
      expect(res.success).toBe(true);
      expect(callProviderSpy).toHaveBeenCalledTimes(2);
      const retryMessages = callProviderSpy.mock.calls[1][2];
      const serializedRetry = JSON.stringify(retryMessages);
      expect(serializedRetry).not.toContain("INTERNAL_DB_SECRET_TABLE_NAME");

      callProviderSpy.mockRestore();
      getConfigSpy.mockRestore();
      execSpy.mockRestore();
    });

    test("Gemini native fallback sends API key in x-goog-api-key header (never query string) and encodes model", async () => {
      const originalFetch = global.fetch;
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 404, text: async () => "not found" })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: '{"status":"OK"}' }] } }],
          }),
        });
      global.fetch = fetchMock;

      try {
        const raw = await aiQueryService.callProvider(
          "gemini",
          { geminiApiKey: "AIzaSecretKey999", geminiModel: "gemini-1.5-flash/evil?x=1" },
          [{ role: "user", content: "hi" }],
        );
        expect(raw).toBe('{"status":"OK"}');
        const [nativeUrl, nativeOpts] = fetchMock.mock.calls[1];
        expect(nativeUrl).not.toContain("AIzaSecretKey999");
        expect(nativeUrl).not.toContain("?key=");
        expect(nativeUrl).toContain(encodeURIComponent("gemini-1.5-flash/evil?x=1"));
        expect(nativeOpts.headers["x-goog-api-key"]).toBe("AIzaSecretKey999");
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe("3. SSRF Guard (utilities/ssrfGuard.js)", () => {
    test("blocks cloud metadata, loopback, RFC1918 IPv4/IPv6, and internal hostnames", () => {
      expect(isPrivateOrReservedIp("169.254.169.254")).toBe(true);
      expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
      expect(isPrivateOrReservedIp("10.0.0.5")).toBe(true);
      expect(isPrivateOrReservedIp("172.16.0.1")).toBe(true);
      expect(isPrivateOrReservedIp("192.168.1.10")).toBe(true);
      expect(isPrivateOrReservedIp("::1")).toBe(true);
      expect(isPrivateOrReservedIp("::ffff:169.254.169.254")).toBe(true);
      expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);

      expect(() => validateOutboundUrl("http://169.254.169.254/latest/meta-data", { env: {} })).toThrow(/SSRF/i);
      expect(() => validateOutboundUrl("http://127.0.0.1:11434/v1", { env: {} })).toThrow(/SSRF/i);
      expect(() => validateOutboundUrl("http://localhost:11434/v1", { env: {} })).toThrow(/non autorisé/i);
      expect(() => validateOutboundUrl("http://metadata.google.internal/computeMetadata/v1", { env: {} })).toThrow(
        /non autorisé/i,
      );
      expect(() => validateOutboundUrl("file:///etc/passwd", { env: {} })).toThrow(/HTTP ou HTTPS/i);
    });

    test("allows explicitly allowlisted hosts via env and rejects DNS rebinding to private IPs", async () => {
      const ok = validateOutboundUrl("http://localhost:11434/v1", {
        allowlistEnvKeys: ["AI_LOCAL_ALLOWED_HOSTS"],
        env: { AI_LOCAL_ALLOWED_HOSTS: "localhost:11434,ollama.internal" },
      });
      expect(ok.allowlisted).toBe(true);

      await expect(
        assertOutboundUrlSafe("https://rebind.attacker.example/api", {
          env: {},
          dnsLookup: async () => [{ address: "169.254.169.254", family: 4 }],
        }),
      ).rejects.toThrow(/adresse IP interne ou réservée/i);

      const publicRes = await assertOutboundUrlSafe("https://wiki.fablab.example.org/BookStack/", {
        env: {},
        dnsLookup: async () => [{ address: "134.157.10.20", family: 4 }],
      });
      expect(publicRes.hostname).toBe("wiki.fablab.example.org");
    });
  });

  describe("4. Optional AES-256-GCM Secret Encryption at Rest (2A)", () => {
    test("encrypts/decrypts round-trip when SETTINGS_ENCRYPTION_KEY is set and reads legacy plaintext", () => {
      const envWithKey = { SETTINGS_ENCRYPTION_KEY: "super-strong-master-key-2026" };
      const plain = "sk-proj-test-secret-key-12345";

      const encrypted = encryptSecret(plain, envWithKey);
      expect(encrypted.startsWith(ENCRYPTED_PREFIX)).toBe(true);
      expect(isEncryptedValue(encrypted)).toBe(true);
      expect(encrypted).not.toContain(plain);

      // Idempotent if already encrypted
      expect(encryptSecret(encrypted, envWithKey)).toBe(encrypted);

      // Round-trip decryption
      expect(decryptSecret(encrypted, envWithKey)).toBe(plain);

      // Wrong key returns empty string without throwing
      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      expect(decryptSecret(encrypted, { SETTINGS_ENCRYPTION_KEY: "wrong-key" })).toBe("");
      errSpy.mockRestore();

      // Backward-compatible plaintext read & pass-through when key is not set
      expect(encryptSecret(plain, {})).toBe(plain);
      expect(decryptSecret(plain, envWithKey)).toBe(plain);
      expect(decryptSecret(plain, {})).toBe(plain);
    });
  });
});
