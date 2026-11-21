const express = require("express");
const request = require("supertest");
const bcrypt = require("bcryptjs");

const mockPrisma = {
  staff: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  systemSetting: {
    findMany: jest.fn().mockResolvedValue([]),
  },
};

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

jest.mock("../../utilities/db", () => ({
  prisma: mockPrisma,
}));

const { validateTestDatabaseUrl, enforceTestDatabase } = require("../helpers/testDbGuard");
const indexRouter = require("../../routes/index");

function createAuthTestApp(sessionStore) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = sessionStore;
    next();
  });
  app.use("/", indexRouter);
  return app;
}

function applySubpathRedirectMiddleware(app) {
  app.use((req, res, next) => {
    const rawBasePath = (process.env.APP_BASE_PATH || "").trim().replace(/^\/|\/$/g, "");
    res.locals.baseUrl = rawBasePath ? `/${rawBasePath}/` : "/";
    res.locals.basePath = rawBasePath ? `/${rawBasePath}` : "";

    if (rawBasePath && !res.__baseRedirectPatched) {
      res.__baseRedirectPatched = true;
      const originalRedirect = res.redirect.bind(res);
      res.redirect = function (url) {
        let address = url;
        let status = 302;
        if (arguments.length === 2) {
          if (typeof arguments[0] === "number") {
            status = arguments[0];
            address = arguments[1];
          } else {
            address = arguments[0];
            status = arguments[1];
          }
        }
        if (typeof address === "string" && address.startsWith("/") && !address.startsWith("//")) {
          const prefix = `/${rawBasePath}`;
          if (address !== prefix && !address.startsWith(`${prefix}/`)) {
            address = `${prefix}${address}`;
          }
        }
        return originalRedirect(status, address);
      };
    }

    next();
  });
}

describe("R-011 — Garde-fou base de test, authentification POST /auth & patch APP_BASE_PATH", () => {
  describe("1. Garde-fou testDbGuard (validateTestDatabaseUrl & enforceTestDatabase)", () => {
    test("rejette NODE_ENV === 'production' même avec une URL se terminant par _test", () => {
      expect(() =>
        validateTestDatabaseUrl({
          nodeEnv: "production",
          databaseUrlTest: "mysql://root:pwd@localhost:3306/fabtrack_test",
        }),
      ).toThrow(/production/i);
    });

    test("rejette DATABASE_URL_TEST absente ou vide", () => {
      expect(() =>
        validateTestDatabaseUrl({
          nodeEnv: "test",
          databaseUrlTest: undefined,
        }),
      ).toThrow(/DATABASE_URL_TEST/i);

      expect(() =>
        validateTestDatabaseUrl({
          nodeEnv: "test",
          databaseUrlTest: "   ",
        }),
      ).toThrow(/DATABASE_URL_TEST/i);
    });

    test("rejette une URL invalide ou un nom de base sans suffixe _test", () => {
      expect(() =>
        validateTestDatabaseUrl({
          nodeEnv: "test",
          databaseUrlTest: "not-a-valid-url",
        }),
      ).toThrow(/valide/i);

      expect(() =>
        validateTestDatabaseUrl({
          nodeEnv: "test",
          databaseUrlTest: "mysql://root:pwd@localhost:3306/fabtrack",
        }),
      ).toThrow(/_test/);
    });

    test("accepte une base _test valide et enforceTestDatabase écrase fakeEnv.DATABASE_URL", () => {
      const validUrl = "mysql://root:pwd@localhost:3306/fabtrack_test";
      const parsed = validateTestDatabaseUrl({
        nodeEnv: "test",
        databaseUrlTest: validUrl,
      });
      expect(parsed).toEqual({
        url: validUrl,
        dbName: "fabtrack_test",
      });

      const fakeEnv = {
        NODE_ENV: "test",
        DATABASE_URL: "mysql://root:pwd@localhost:3306/fabtrack_prod",
        DATABASE_URL_TEST: validUrl,
      };
      const result = enforceTestDatabase(fakeEnv);
      expect(result).toEqual({ url: validUrl, dbName: "fabtrack_test" });
      expect(fakeEnv.DATABASE_URL).toBe(validUrl);
    });
  });

  describe("2. Authentification POST /auth (routes/index.js)", () => {
    let validPasswordHash;

    beforeAll(async () => {
      validPasswordHash = await bcrypt.hash("ValidPass123!", 4);
    });

    beforeEach(() => {
      jest.clearAllMocks();
      if (indexRouter.rateLimiters) {
        Object.values(indexRouter.rateLimiters).forEach((limiter) => limiter.reset());
      }
    });

    test("compte approuvé avec bon mot de passe -> 302 / et session peuplée", async () => {
      mockPrisma.staff.findUnique.mockResolvedValue({
        id: 42,
        name: "alice",
        password: validPasswordHash,
        role: "admin",
        approved: true,
        lastWorkspaceId: 7,
      });

      const sessionStore = {};
      const app = createAuthTestApp(sessionStore);

      const res = await request(app)
        .post("/auth")
        .type("form")
        .send({ username: "alice", password: "ValidPass123!" });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/");
      expect(mockPrisma.staff.findUnique).toHaveBeenCalledWith({
        where: { name: "alice" },
      });
      expect(sessionStore.loggedin).toBe(true);
      expect(sessionStore.staffId).toBe(42);
      expect(sessionStore.role).toBe("admin");
      expect(sessionStore.username).toBe("alice");
      expect(sessionStore.lastWorkspaceId).toBe(7);
    });

    test("compte non approuvé (approved: false) -> 302 /login, session non connectée et Warning:", async () => {
      mockPrisma.staff.findUnique.mockResolvedValue({
        id: 43,
        name: "pending_staff",
        password: validPasswordHash,
        role: "staff",
        approved: false,
      });

      const sessionStore = {};
      const app = createAuthTestApp(sessionStore);

      const res = await request(app)
        .post("/auth")
        .type("form")
        .send({ username: "pending_staff", password: "ValidPass123!" });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
      expect(sessionStore.loggedin).toBeFalsy();
      expect(sessionStore.notification).toMatch(/^Warning:/);
    });

    test("mauvais mot de passe -> 302 /login, session non connectée et Error:", async () => {
      mockPrisma.staff.findUnique.mockResolvedValue({
        id: 44,
        name: "alice",
        password: validPasswordHash,
        role: "staff",
        approved: true,
      });

      const sessionStore = {};
      const app = createAuthTestApp(sessionStore);

      const res = await request(app)
        .post("/auth")
        .type("form")
        .send({ username: "alice", password: "WrongPassword!" });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
      expect(sessionStore.loggedin).toBeFalsy();
      expect(sessionStore.notification).toMatch(/^Error:/);
    });

    test("utilisateur inconnu -> 302 /login, session non connectée et Error:", async () => {
      mockPrisma.staff.findUnique.mockResolvedValue(null);

      const sessionStore = {};
      const app = createAuthTestApp(sessionStore);

      const res = await request(app)
        .post("/auth")
        .type("form")
        .send({ username: "unknown_user", password: "ValidPass123!" });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
      expect(sessionStore.loggedin).toBeFalsy();
      expect(sessionStore.notification).toMatch(/^Error:/);
    });
  });

  describe("3. Patch reverse proxy APP_BASE_PATH sur res.redirect (logique app.js)", () => {
    const originalBasePath = process.env.APP_BASE_PATH;

    afterEach(() => {
      if (originalBasePath === undefined) {
        delete process.env.APP_BASE_PATH;
      } else {
        process.env.APP_BASE_PATH = originalBasePath;
      }
    });

    function buildSubpathApp() {
      const app = express();
      applySubpathRedirectMiddleware(app);
      app.get("/go-login", (_req, res) => res.redirect("/login"));
      app.get("/go-admin-301", (_req, res) => res.redirect(301, "/admin"));
      app.get("/go-already-prefixed", (_req, res) => res.redirect("/fabtrack/admin"));
      app.get("/go-prefix-root", (_req, res) => res.redirect("/fabtrack"));
      app.get("/go-protocol-relative", (_req, res) => res.redirect("//evil.com/phish"));
      app.get("/go-external", (_req, res) => res.redirect("https://example.org"));
      app.get("/locals", (_req, res) =>
        res.json({ baseUrl: res.locals.baseUrl, basePath: res.locals.basePath }),
      );
      return app;
    }

    test("préfixe /login et res.redirect(301, '/admin') avec APP_BASE_PATH='/fabtrack'", async () => {
      process.env.APP_BASE_PATH = "/fabtrack";
      const app = buildSubpathApp();

      const loginRes = await request(app).get("/go-login");
      expect(loginRes.status).toBe(302);
      expect(loginRes.headers.location).toBe("/fabtrack/login");

      const adminRes = await request(app).get("/go-admin-301");
      expect(adminRes.status).toBe(301);
      expect(adminRes.headers.location).toBe("/fabtrack/admin");

      const localsRes = await request(app).get("/locals");
      expect(localsRes.body).toEqual({
        baseUrl: "/fabtrack/",
        basePath: "/fabtrack",
      });
    });

    test("ne double-préfixe pas /fabtrack/admin ni /fabtrack", async () => {
      process.env.APP_BASE_PATH = "/fabtrack/";
      const app = buildSubpathApp();

      const prefixedRes = await request(app).get("/go-already-prefixed");
      expect(prefixedRes.status).toBe(302);
      expect(prefixedRes.headers.location).toBe("/fabtrack/admin");

      const rootRes = await request(app).get("/go-prefix-root");
      expect(rootRes.status).toBe(302);
      expect(rootRes.headers.location).toBe("/fabtrack");
    });

    test("ne préfixe pas //evil.com/phish ni https://example.org", async () => {
      process.env.APP_BASE_PATH = "/fabtrack";
      const app = buildSubpathApp();

      const protoRelRes = await request(app).get("/go-protocol-relative");
      expect(protoRelRes.status).toBe(302);
      expect(protoRelRes.headers.location).toBe("//evil.com/phish");

      const externalRes = await request(app).get("/go-external");
      expect(externalRes.status).toBe(302);
      expect(externalRes.headers.location).toBe("https://example.org");
    });
  });
});
