const fs = require("fs");
const path = require("path");
const express = require("express");
const request = require("supertest");
const bcrypt = require("bcryptjs");

const mockPrisma = {
  staff: {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  projecttype: {
    findFirst: jest.fn().mockResolvedValue({ id: 1, name: "Default" }),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 1, name: "Default" }),
  },
  systemSetting: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  log: {
    create: jest.fn().mockResolvedValue({ id: 1 }),
  },
};

const ENUM_STUBS = {
  ResourceType: {
    MACHINE: "MACHINE",
    EQUIPMENT: "EQUIPMENT",
    CONSUMABLE: "CONSUMABLE",
  },
  ConsumableStatus: {
    AVAILABLE: "AVAILABLE",
    LOW_STOCK: "LOW_STOCK",
    OUT_OF_STOCK: "OUT_OF_STOCK",
  },
};

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn(() => mockPrisma),
  ...ENUM_STUBS,
}));

jest.mock("../../utilities/db", () => ({
  prisma: mockPrisma,
  ...ENUM_STUBS,
}));

const mockMailService = {
  sendStaffRegisteredAlert: jest.fn().mockResolvedValue({ success: true }),
  sendStaffApprovedNotification: jest.fn().mockResolvedValue({ success: true }),
  sendBugReportAlert: jest.fn().mockResolvedValue({ success: true }),
};
jest.mock("../../services/mailService.js", () => mockMailService);
jest.mock("../../services/mailService", () => mockMailService);

const mockLogger = {
  logThat: jest.fn(),
};
jest.mock("../../utilities/simpleLogger.js", () => mockLogger);
jest.mock("../../utilities/simpleLogger", () => mockLogger);

const {
  ensureCsrfToken,
  extractCsrfToken,
  isTokenValid,
  isCsrfExemptRequest,
  csrfTokenMiddleware,
  csrfProtection,
} = require("../../middleware/csrf");
const requireRoles = require("../../middleware/requireRoles");
const checkSession = require("../../middleware/checkSession");
const staffSessionService = require("../../services/staffSessionService");
const staffAdminService = require("../../services/staffAdminService");
const settingsService = require("../../services/settingsService");
const indexRouter = require("../../routes/index");
const appModule = require("../../app");

function listRouteFiles(dirPath) {
  const results = [];
  for (const entry of fs.readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...listRouteFiles(fullPath));
    } else if (entry.endsWith(".js")) {
      results.push(fullPath);
    }
  }
  return results;
}

describe("R-012 — CSRF Protection, Zero Mutating GETs, Dynamic Revocation & Auth/Session Hardening", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    staffSessionService.clearCache();
    settingsService.invalidateCache();
    mockPrisma.systemSetting.findMany.mockResolvedValue([]);
    if (indexRouter.rateLimiters) {
      Object.values(indexRouter.rateLimiters).forEach((limiter) => limiter.reset());
    }
  });

  // =========================================================================
  // 1. Static scan of all routes/**/*.js (0 mutating GET routes)
  // =========================================================================
  describe("1. Static scan of routes/**/*.js — zero mutating GET routes", () => {
    const MUTATING_GET_PATTERN =
      /(delete|delete-type|enable|disable|promote|demote|deactivate|activate|remove-interest|cleardebt|exit|archive|unarchive|revoke|resend|logout)\b/i;

    test("contains 0 router.get(...) declarations matching mutating action keywords", () => {
      const routesDir = path.join(__dirname, "../../routes");
      const routeFiles = listRouteFiles(routesDir);
      expect(routeFiles.length).toBeGreaterThanOrEqual(10);

      const violations = [];
      const routerGetRegex = /router\.get\s*\(\s*(['"`])([^'"`]+)\1/g;

      for (const filePath of routeFiles) {
        const content = fs.readFileSync(filePath, "utf8");
        let match;
        while ((match = routerGetRegex.exec(content)) !== null) {
          const routePattern = match[2];
          if (MUTATING_GET_PATTERN.test(routePattern)) {
            const relPath = path.relative(path.join(__dirname, "../.."), filePath);
            violations.push(`${relPath}: router.get("${routePattern}")`);
          }
        }
      }

      expect(violations).toEqual([]);
    });
  });

  // =========================================================================
  // 2. CSRF Middleware (middleware/csrf.js)
  // =========================================================================
  describe("2. CSRF Middleware (middleware/csrf.js)", () => {
    function createCsrfTestApp(sessionStore) {
      const app = express();
      app.use(express.urlencoded({ extended: false }));
      app.use(express.json());
      app.use((req, _res, next) => {
        req.session = sessionStore;
        next();
      });
      app.use(csrfTokenMiddleware);
      app.use(csrfProtection);

      app.get("/health", (_req, res) => {
        res.json({ ok: true });
      });
      app.get("/form", (_req, res) => {
        const token = res.locals.csrfToken;
        res.json({ csrfToken: token });
      });
      app.post("/mutate", (_req, res) => res.json({ ok: true, method: "POST" }));
      app.put("/mutate", (_req, res) => res.json({ ok: true, method: "PUT" }));
      app.delete("/mutate", (_req, res) => res.json({ ok: true, method: "DELETE" }));
      app.post("/api/machines/status", (_req, res) => res.json({ ok: true, endpoint: "machine" }));

      return app;
    }

    test("lazy res.locals.csrfToken does NOT mutate req.session when unread, and issues 64-hex token on read", async () => {
      const sessionStore = {};
      const app = createCsrfTestApp(sessionStore);

      const healthRes = await request(app).get("/health");
      expect(healthRes.status).toBe(200);
      expect(sessionStore.csrfToken).toBeUndefined();

      const formRes = await request(app).get("/form");
      expect(formRes.status).toBe(200);
      expect(formRes.body.csrfToken).toMatch(/^[a-f0-9]{64}$/);
      expect(sessionStore.csrfToken).toBe(formRes.body.csrfToken);

      // Second read returns identical token without rotating mid-session
      const formRes2 = await request(app).get("/form");
      expect(formRes2.body.csrfToken).toBe(sessionStore.csrfToken);
    });

    test("rejects POST, PUT, DELETE without token (403 EBADCSRFTOKEN) and with tampered token (403)", async () => {
      const sessionStore = {};
      const app = createCsrfTestApp(sessionStore);
      const { body } = await request(app).get("/form");
      const validToken = body.csrfToken;

      for (const method of ["post", "put", "delete"]) {
        const missingRes = await request(app)[method]("/mutate").set("Accept", "application/json").send({});
        expect(missingRes.status).toBe(403);
        expect(missingRes.body.code).toBe("EBADCSRFTOKEN");
      }

      // Same-length tampered token
      const tampered = (validToken[0] === "a" ? "b" : "a") + validToken.slice(1);
      const tamperedRes = await request(app)
        .post("/mutate")
        .set("Accept", "application/json")
        .set("X-CSRF-Token", tampered)
        .send({});
      expect(tamperedRes.status).toBe(403);
      expect(tamperedRes.body.code).toBe("EBADCSRFTOKEN");

      // Short / invalid token
      const shortRes = await request(app)
        .post("/mutate")
        .set("Accept", "application/json")
        .set("X-CSRF-Token", "too-short")
        .send({});
      expect(shortRes.status).toBe(403);
      expect(shortRes.body.code).toBe("EBADCSRFTOKEN");

      expect(isTokenValid(validToken, validToken)).toBe(true);
      expect(isTokenValid(validToken, tampered)).toBe(false);
      expect(isTokenValid("short", "short")).toBe(false);
    });

    test("accepts POST with valid X-CSRF-Token header, CSRF-Token/X-XSRF-Token aliases, req.body._csrf, and req.query._csrf", async () => {
      const sessionStore = {};
      const app = createCsrfTestApp(sessionStore);
      const { body } = await request(app).get("/form");
      const token = body.csrfToken;

      const byHeader = await request(app)
        .post("/mutate")
        .set("X-CSRF-Token", token)
        .send({ data: 1 });
      expect(byHeader.status).toBe(200);

      const byAliasHeader = await request(app)
        .post("/mutate")
        .set("X-XSRF-Token", token)
        .send({ data: 1 });
      expect(byAliasHeader.status).toBe(200);

      const byBody = await request(app)
        .post("/mutate")
        .type("form")
        .send({ _csrf: token });
      expect(byBody.status).toBe(200);

      const byQuery = await request(app)
        .post(`/mutate?_csrf=${encodeURIComponent(token)}`)
        .send({});
      expect(byQuery.status).toBe(200);

      expect(extractCsrfToken({ headers: { "csrf-token": " abc " } })).toBe("abc");
      expect(extractCsrfToken({ body: { _csrf: " def " } })).toBe("def");
      expect(extractCsrfToken({ query: { _csrf: " ghi " } })).toBe("ghi");
    });

    test("exempts /api/machines/* for API-key or unauthenticated callers, while enforcing CSRF for logged-in browser sessions without API key", async () => {
      // Unauthenticated machine caller -> exempt
      const anonSession = {};
      const anonApp = createCsrfTestApp(anonSession);
      const unauthRes = await request(anonApp)
        .post("/api/machines/status")
        .set("Accept", "application/json")
        .send({ machineId: 1 });
      expect(unauthRes.status).toBe(200);

      // Authenticated browser session posting WITHOUT API key and WITHOUT CSRF token -> 403
      const browserSession = { loggedin: true, role: "admin", staffId: 1 };
      ensureCsrfToken({ session: browserSession });
      const browserApp = createCsrfTestApp(browserSession);

      const blockedBrowserRes = await request(browserApp)
        .post("/api/machines/status")
        .set("Accept", "application/json")
        .send({ machineId: 1 });
      expect(blockedBrowserRes.status).toBe(403);
      expect(blockedBrowserRes.body.code).toBe("EBADCSRFTOKEN");

      // Authenticated browser session WITH valid X-CSRF-Token -> 200
      const allowedBrowserRes = await request(browserApp)
        .post("/api/machines/status")
        .set("Accept", "application/json")
        .set("X-CSRF-Token", browserSession.csrfToken)
        .send({ machineId: 1 });
      expect(allowedBrowserRes.status).toBe(200);

      // Authenticated session WITH X-API-Key or Bearer header -> exempt even without CSRF token
      const apiKeyRes = await request(browserApp)
        .post("/api/machines/status")
        .set("Accept", "application/json")
        .set("X-API-Key", "machine-secret-key")
        .send({ machineId: 1 });
      expect(apiKeyRes.status).toBe(200);

      const bearerRes = await request(browserApp)
        .post("/api/machines/status")
        .set("Accept", "application/json")
        .set("Authorization", "Bearer machine-token")
        .send({ machineId: 1 });
      expect(bearerRes.status).toBe(200);

      expect(isCsrfExemptRequest({ path: "/users/delete/1", headers: { "x-api-key": "k" }, session: {} })).toBe(false);
    });
  });

  // =========================================================================
  // 3. Dynamic Staff Session Revocation (staffSessionService + middlewares)
  // =========================================================================
  describe("3. Dynamic Staff Session Revocation (staffSessionService + requireRoles + checkSession)", () => {
    function createProtectedApp(sessionStore) {
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.session = sessionStore;
        next();
      });
      app.get("/api/admin-only", requireRoles("admin"), (req, res) => {
        res.json({ ok: true, role: req.session.role });
      });
      app.get("/admin-page", requireRoles("admin"), (req, res) => {
        res.json({ ok: true, role: req.session.role });
      });
      app.get("/api/session-check", checkSession, (req, res) => {
        res.json({ ok: true, role: req.session.role });
      });
      app.get("/session-page", checkSession, (req, res) => {
        res.json({ ok: true, role: req.session.role });
      });
      return app;
    }

    test("active approved staff passes and hits 30s micro-cache on subsequent requests", async () => {
      mockPrisma.staff.findUnique.mockResolvedValue({
        id: 10,
        name: "alice_admin",
        role: "admin",
        approved: true,
      });

      const sessionStore = {
        loggedin: true,
        staffId: 10,
        username: "alice_admin",
        role: "admin",
      };
      const app = createProtectedApp(sessionStore);

      const res1 = await request(app).get("/api/admin-only");
      const res2 = await request(app).get("/api/session-check");

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(mockPrisma.staff.findUnique).toHaveBeenCalledTimes(1);
    });

    test("disabled staff (approved: false) or deleted staff (null) gets 401 SESSION_REVOKED / 302 /login and session auth fields cleared", async () => {
      // Disabled staff via requireRoles (JSON)
      mockPrisma.staff.findUnique.mockResolvedValueOnce({
        id: 11,
        name: "disabled_staff",
        role: "admin",
        approved: false,
      });
      const disabledSession = {
        loggedin: true,
        staffId: 11,
        username: "disabled_staff",
        role: "admin",
        email: "disabled@lab.fr",
      };
      const appDisabled = createProtectedApp(disabledSession);

      const jsonRes = await request(appDisabled).get("/api/admin-only");
      expect(jsonRes.status).toBe(401);
      expect(jsonRes.body.code).toBe("SESSION_REVOKED");
      expect(disabledSession.loggedin).toBeUndefined();
      expect(disabledSession.role).toBeUndefined();
      expect(disabledSession.staffId).toBeUndefined();
      expect(disabledSession.username).toBeUndefined();
      expect(disabledSession.email).toBeUndefined();

      // Deleted staff via checkSession (HTML redirect + JSON)
      staffSessionService.clearCache();
      mockPrisma.staff.findUnique.mockResolvedValueOnce(null);
      const deletedHtmlSession = {
        loggedin: true,
        staffId: 12,
        username: "deleted_staff",
        role: "user",
      };
      const appDeletedHtml = createProtectedApp(deletedHtmlSession);

      const htmlRes = await request(appDeletedHtml).get("/session-page");
      expect(htmlRes.status).toBe(302);
      expect(htmlRes.headers.location).toBe("/login");
      expect(deletedHtmlSession.loggedin).toBeUndefined();
      expect(deletedHtmlSession.notification).toMatch(/^Error:/);

      staffSessionService.clearCache();
      mockPrisma.staff.findUnique.mockResolvedValueOnce(null);
      const deletedApiSession = {
        loggedin: true,
        staffId: 12,
        username: "deleted_staff",
        role: "user",
      };
      const appDeletedApi = createProtectedApp(deletedApiSession);

      const apiRes = await request(appDeletedApi).get("/api/session-check");
      expect(apiRes.status).toBe(401);
      expect(apiRes.body.code).toBe("SESSION_REVOKED");
      expect(deletedApiSession.loggedin).toBeUndefined();
    });

    test("downgraded admin loses admin access immediately after staffAdminService.demoteStaff and disabled staff after disableStaff", async () => {
      // Prime cache with active admin id=20
      mockPrisma.staff.findUnique.mockResolvedValue({
        id: 20,
        name: "target_admin",
        email: "target@lab.fr",
        role: "admin",
        approved: true,
      });
      mockPrisma.staff.count.mockResolvedValue(2);

      const targetSession = {
        loggedin: true,
        staffId: 20,
        username: "target_admin",
        role: "admin",
      };
      const app = createProtectedApp(targetSession);

      const beforeDemote = await request(app).get("/api/admin-only");
      expect(beforeDemote.status).toBe(200);

      // Admin id=1 demotes staff id=20 via staffAdminService (which invalidates cache)
      mockPrisma.staff.update.mockResolvedValueOnce({
        id: 20,
        name: "target_admin",
        email: "target@lab.fr",
        role: "user",
        approved: true,
      });
      const demoteResult = await staffAdminService.demoteStaff({
        targetId: 20,
        actor: { staffId: 1, username: "super_admin" },
      });
      expect(demoteResult.success).toBe(true);

      // Subsequent DB read reflects downgraded role
      mockPrisma.staff.findUnique.mockResolvedValue({
        id: 20,
        name: "target_admin",
        email: "target@lab.fr",
        role: "user",
        approved: true,
      });

      const afterDemote = await request(app).get("/api/admin-only");
      expect(afterDemote.status).toBe(403);
      expect(afterDemote.body.code).toBe("FORBIDDEN");
      expect(targetSession.role).toBe("user");

      // Now disable staff id=20 via staffAdminService -> immediate 401 SESSION_REVOKED
      mockPrisma.staff.update.mockResolvedValueOnce({
        id: 20,
        name: "target_admin",
        email: "target@lab.fr",
        role: "user",
        approved: false,
      });
      const disableResult = await staffAdminService.disableStaff({
        targetId: 20,
        actor: { staffId: 1, username: "super_admin" },
      });
      expect(disableResult.success).toBe(true);

      mockPrisma.staff.findUnique.mockResolvedValue({
        id: 20,
        name: "target_admin",
        email: "target@lab.fr",
        role: "user",
        approved: false,
      });

      const afterDisable = await request(app).get("/api/session-check");
      expect(afterDisable.status).toBe(401);
      expect(afterDisable.body.code).toBe("SESSION_REVOKED");
      expect(targetSession.loggedin).toBeUndefined();
    });
  });

  // =========================================================================
  // 4. Auth & Session Hardening (app.js + routes/index.js)
  // =========================================================================
  describe("4. Auth & Session Hardening (app.js + routes/index.js)", () => {
    function createIndexTestApp(sessionFactory) {
      const app = express();
      app.use(express.urlencoded({ extended: false }));
      app.use(express.json());
      app.use((req, res, next) => {
        req.session = typeof sessionFactory === "function" ? sessionFactory(req) : sessionFactory;
        const originalClearCookie = res.clearCookie.bind(res);
        res.clearCookie = jest.fn((...args) => originalClearCookie(...args));
        res.render = jest.fn((view, locals) => res.json({ rendered: view, locals: locals || {} }));
        next();
      });
      app.use("/", indexRouter);
      return app;
    }

    describe("app.resolveSessionSecret & app.resolveTrustProxy", () => {
      test("resolveSessionSecret throws in production when SECRET is missing or default, accepts strong secret", () => {
        expect(() => appModule.resolveSessionSecret({ NODE_ENV: "production" })).toThrow(/SECRET/i);
        expect(() =>
          appModule.resolveSessionSecret({ NODE_ENV: "production", SECRET: "   " }),
        ).toThrow(/SECRET/i);
        expect(() =>
          appModule.resolveSessionSecret({
            NODE_ENV: "production",
            SECRET: "fabtrack-secret-key-2024",
          }),
        ).toThrow(/SECRET/i);

        const strong = "prod-secret-9f8e7d6c5b4a3210fedcba9876543210";
        expect(appModule.resolveSessionSecret({ NODE_ENV: "production", SECRET: strong })).toBe(strong);

        // Non-production falls back to dev secret when unset
        expect(appModule.resolveSessionSecret({ NODE_ENV: "development" })).toBe("fabtrack-secret-key-2024");
      });

      test("resolveTrustProxy parses false, 0, true, numeric hops, subnet string, and undefined", () => {
        expect(appModule.resolveTrustProxy({ TRUST_PROXY: "false" })).toBe(false);
        expect(appModule.resolveTrustProxy({ TRUST_PROXY: "0" })).toBe(false);
        expect(appModule.resolveTrustProxy({ TRUST_PROXY: "true" })).toBe(true);
        expect(appModule.resolveTrustProxy({ TRUST_PROXY: "1" })).toBe(1);
        expect(appModule.resolveTrustProxy({ TRUST_PROXY: "2" })).toBe(2);
        expect(appModule.resolveTrustProxy({ TRUST_PROXY: "loopback" })).toBe("loopback");
        expect(appModule.resolveTrustProxy({})).toBe(1);
      });
    });

    describe("POST /auth — timing-oracle guard, session regeneration & rate limiting", () => {
      let validHash;

      beforeAll(async () => {
        validHash = await bcrypt.hash("StrongPass2026!", 4);
      });

      test("calls bcrypt.compare even when staff username is unknown (timing-oracle fix)", async () => {
        mockPrisma.staff.findUnique.mockResolvedValue(null);
        const compareSpy = jest.spyOn(bcrypt, "compare").mockResolvedValueOnce(false);

        const sessionStore = {};
        const app = createIndexTestApp(sessionStore);

        const res = await request(app)
          .post("/auth")
          .type("form")
          .send({ username: "nonexistent_user", password: "AnyPassword123!" });

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe("/login");
        expect(compareSpy).toHaveBeenCalledTimes(1);
        expect(compareSpy).toHaveBeenCalledWith("AnyPassword123!", expect.stringMatching(/^\$2[aby]\$/));

        compareSpy.mockRestore();
      });

      test("calls req.session.regenerate(), preserves lang, sets staffId and fresh csrfToken on valid login", async () => {
        mockPrisma.staff.findUnique.mockResolvedValue({
          id: 77,
          name: "bob_admin",
          email: "bob@lab.fr",
          password: validHash,
          role: "admin",
          approved: true,
          lastWorkspaceId: 3,
        });

        let activeSession;
        const regenerateMock = jest.fn(function (cb) {
          const fresh = { regenerate: regenerateMock };
          activeSession = fresh;
          this.__req.session = fresh;
          cb(null);
        });

        const app = express();
        app.use(express.urlencoded({ extended: false }));
        app.use((req, _res, next) => {
          activeSession = { lang: "en", csrfToken: "old-pre-login-token", regenerate: regenerateMock, __req: req };
          req.session = activeSession;
          next();
        });
        app.use("/", indexRouter);

        const res = await request(app)
          .post("/auth")
          .type("form")
          .send({ username: "bob_admin", password: "StrongPass2026!" });

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe("/");
        expect(regenerateMock).toHaveBeenCalledTimes(1);
        expect(activeSession.loggedin).toBe(true);
        expect(activeSession.staffId).toBe(77);
        expect(activeSession.role).toBe("admin");
        expect(activeSession.username).toBe("bob_admin");
        expect(activeSession.lang).toBe("en");
        expect(activeSession.csrfToken).toMatch(/^[a-f0-9]{64}$/);
        expect(activeSession.csrfToken).not.toBe("old-pre-login-token");
      });

      test("returns HTTP 429 with Retry-After header after exceeding authLimiter threshold", async () => {
        mockPrisma.staff.findUnique.mockResolvedValue(null);
        const compareSpy = jest.spyOn(bcrypt, "compare").mockResolvedValue(false);

        const app = createIndexTestApp(() => ({}));

        for (let i = 0; i < 10; i += 1) {
          const res = await request(app)
            .post("/auth")
            .set("Accept", "application/json")
            .send({ username: "brute", password: "wrong" });
          expect(res.status).toBe(302);
        }

        const limitedRes = await request(app)
          .post("/auth")
          .set("Accept", "application/json")
          .send({ username: "brute", password: "wrong" });

        expect(limitedRes.status).toBe(429);
        expect(limitedRes.headers["retry-after"]).toBeDefined();
        expect(Number(limitedRes.headers["retry-after"])).toBeGreaterThanOrEqual(1);
        expect(limitedRes.body.code).toBe("RATE_LIMITED");

        compareSpy.mockRestore();
      });
    });

    describe("GET /register & POST /create-account — allow_self_registration & password policy", () => {
      test("blocks GET /register (302 /login) and POST /create-account (403) when allow_self_registration is false", async () => {
        mockPrisma.systemSetting.findMany.mockResolvedValue([
          { key: "allow_self_registration", value: "false" },
        ]);

        const sessionStore = {};
        const app = createIndexTestApp(sessionStore);

        const getRes = await request(app).get("/register");
        expect(getRes.status).toBe(302);
        expect(getRes.headers.location).toBe("/login");
        expect(sessionStore.notification).toMatch(/^Error:/);

        const postHtmlRes = await request(app)
          .post("/create-account")
          .type("form")
          .send({ username: "intruder", mail: "intruder@lab.fr", password: "ValidPassword123" });
        expect(postHtmlRes.status).toBe(403);
        expect(postHtmlRes.body.rendered).toBe("index/login");

        const postJsonRes = await request(app)
          .post("/create-account")
          .set("Accept", "application/json")
          .send({ username: "intruder2", mail: "intruder2@lab.fr", password: "ValidPassword123" });
        expect(postJsonRes.status).toBe(403);
        expect(postJsonRes.body.code).toBe("REGISTRATION_DISABLED");
        expect(mockPrisma.staff.create).not.toHaveBeenCalled();
      });

      test("rejects password shorter than 8 characters on POST /create-account", async () => {
        mockPrisma.systemSetting.findMany.mockResolvedValue([
          { key: "allow_self_registration", value: "true" },
        ]);

        const sessionStore = {};
        const app = createIndexTestApp(sessionStore);

        const shortPwdRes = await request(app)
          .post("/create-account")
          .type("form")
          .send({ username: "newstaff", mail: "newstaff@lab.fr", password: "short7!" });

        expect(shortPwdRes.status).toBe(302);
        expect(shortPwdRes.headers.location).toBe("/register");
        expect(sessionStore.notification).toContain("8 caractères");
        expect(mockPrisma.staff.create).not.toHaveBeenCalled();
      });
    });

    describe("POST /logout & removal of GET /logout", () => {
      test("POST /logout destroys session, clears fabtrack.sid cookie and redirects to /login; GET /logout returns 404", async () => {
        const destroyMock = jest.fn((cb) => cb(null));
        const clearCookieCalls = [];
        mockPrisma.staff.update.mockResolvedValue({});

        const app = express();
        app.use((req, res, next) => {
          req.session = {
            loggedin: true,
            username: "admin_logout",
            selectedWorkspace: { id: 2, name: "Atelier" },
            destroy: destroyMock,
          };
          const origClearCookie = res.clearCookie.bind(res);
          res.clearCookie = (name, opts) => {
            clearCookieCalls.push({ name, opts });
            return origClearCookie(name, opts);
          };
          next();
        });
        app.use("/", indexRouter);

        const getLogoutRes = await request(app).get("/logout");
        expect(getLogoutRes.status).toBe(404);

        const postLogoutRes = await request(app).post("/logout");
        expect(postLogoutRes.status).toBe(302);
        expect(postLogoutRes.headers.location).toBe("/login");
        expect(destroyMock).toHaveBeenCalledTimes(1);
        expect(clearCookieCalls).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: "fabtrack.sid",
              opts: expect.objectContaining({
                path: "/",
                httpOnly: true,
                sameSite: "lax",
              }),
            }),
          ]),
        );
      });
    });

    describe("GET /agreement/:token & POST /agreement/:token — two-step read-only GET + 30-day expiry", () => {
      test("GET /agreement/:token is strictly read-only (never updates DB) and renders index/agreement-confirm", async () => {
        mockPrisma.user.findFirst.mockResolvedValue({
          id: 55,
          name: "Clara",
          surname: "Oswald",
          token: "valid-agreement-token",
          termsAccepted: false,
          dateAdded: new Date(),
        });

        const app = createIndexTestApp(() => ({}));
        const res = await request(app).get("/agreement/valid-agreement-token");

        expect(res.status).toBe(200);
        expect(res.body.rendered).toBe("index/agreement-confirm");
        expect(res.body.locals.token).toBe("valid-agreement-token");
        expect(mockPrisma.user.update).not.toHaveBeenCalled();
      });

      test("POST /agreement/:token commits termsAccepted: true and renders index/agreement-success", async () => {
        mockPrisma.user.findFirst.mockResolvedValue({
          id: 56,
          name: "Clara",
          surname: "Oswald",
          token: "valid-agreement-token-2",
          termsAccepted: false,
          dateAdded: new Date(),
        });
        mockPrisma.user.update.mockResolvedValue({ id: 56, termsAccepted: true });

        const app = createIndexTestApp(() => ({}));
        const res = await request(app).post("/agreement/valid-agreement-token-2");

        expect(res.status).toBe(200);
        expect(res.body.rendered).toBe("index/agreement-success");
        expect(res.body.locals.success).toBe(true);
        expect(mockPrisma.user.update).toHaveBeenCalledWith({
          where: { id: 56 },
          data: { termsAccepted: true },
        });
      });

      test("rejects expired (> 30 days) agreement tokens with HTTP 410 on both GET and POST without mutating DB", async () => {
        const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
        mockPrisma.user.findFirst.mockResolvedValue({
          id: 57,
          name: "Expired",
          surname: "User",
          token: "expired-agreement-token",
          termsAccepted: false,
          dateAdded: thirtyOneDaysAgo,
        });

        const app = createIndexTestApp(() => ({}));

        const getRes = await request(app).get("/agreement/expired-agreement-token");
        expect(getRes.status).toBe(410);
        expect(getRes.body.locals.status).toBe("expired");

        const postRes = await request(app).post("/agreement/expired-agreement-token");
        expect(postRes.status).toBe(410);
        expect(postRes.body.locals.status).toBe("expired");
        expect(mockPrisma.user.update).not.toHaveBeenCalled();
      });
    });
  });
});
