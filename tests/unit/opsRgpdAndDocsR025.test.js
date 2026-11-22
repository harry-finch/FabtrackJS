const fs = require("fs");
const path = require("path");
const EventEmitter = require("events");
const express = require("express");
const request = require("supertest");

const mockDb = {
  $queryRaw: jest.fn(),
  $transaction: jest.fn(async (arg) => (typeof arg === "function" ? arg(mockDb) : Promise.all(arg))),
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  userWorkshopInterest: {
    deleteMany: jest.fn(),
  },
  history: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock("../../utilities/db", () => ({
  prisma: mockDb,
  ResourceType: { MACHINE: "MACHINE", EQUIPMENT: "EQUIPMENT", CONSUMABLE: "CONSUMABLE" },
  ConsumableStatus: { AVAILABLE: "AVAILABLE", LOW_STOCK: "LOW_STOCK", OUT_OF_STOCK: "OUT_OF_STOCK" },
}));

jest.mock("../../utilities/simpleLogger.js", () => ({
  logThat: jest.fn(),
}));

jest.mock("../../services/staffSessionService.js", () => ({
  verifyActiveStaffSession: jest.fn(async () => ({ valid: true })),
  invalidateStaffSessionCache: jest.fn(),
}));

const app = require("../../app.js");
const structuredLogger = require("../../utilities/structuredLogger.js");
const rgpdService = require("../../services/rgpdService.js");
const rfidPlugin = require("../../plugins/rfidPlugin.js");
const simpleLogger = require("../../utilities/simpleLogger.js");
const usersRouter = require("../../routes/users.js");
const { parseArgs } = require("../../scripts/rgpd-anonymize.js");

const ROOT = path.join(__dirname, "../..");

describe("R-025: Production ops (/healthz, structured JSON logs), GDPR & documentation alignment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("1. GET /healthz probe", () => {
    test("returns HTTP 200 with status=ok and db=ok when SELECT 1 succeeds", async () => {
      mockDb.$queryRaw.mockResolvedValueOnce([{ 1: 1 }]);
      const res = await request(app).get("/healthz");
      expect(res.status).toBe(200);
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
      expect(res.body.status).toBe("ok");
      expect(res.body.db).toBe("ok");
      expect(res.body.version).toBe(pkg.version);
      expect(typeof res.body.uptimeSeconds).toBe("number");
    });

    test("returns HTTP 503 with status=degraded without leaking DB credentials when DB fails", async () => {
      const stderrSpy = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
      mockDb.$queryRaw.mockRejectedValueOnce(new Error("Access denied for user 'root'@'10.0.0.1'"));

      try {
        const res = await request(app).get("/healthz");
        expect(res.status).toBe(503);
        expect(res.body.status).toBe("degraded");
        expect(res.body.db).toBe("error");
        expect(JSON.stringify(res.body)).not.toContain("root");
        expect(JSON.stringify(res.body)).not.toContain("10.0.0.1");
      } finally {
        stderrSpy.mockRestore();
      }
    });
  });

  describe("2. Structured NDJSON logger & HTTP middleware", () => {
    test("httpLoggerMiddleware sets X-Request-Id and emits valid NDJSON without query string secrets", () => {
      const originalLevel = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = "info";
      const written = [];
      const fakeStream = { write: (line) => written.push(line) };

      try {
        const mw = structuredLogger.httpLoggerMiddleware({ stream: fakeStream });
        const req = { method: "GET", originalUrl: "/admin/settings?token=secret123", headers: {}, ip: "127.0.0.1" };
        const res = new EventEmitter();
        res.statusCode = 200;
        res.headers = {};
        res.setHeader = (k, v) => {
          res.headers[k] = v;
        };
        const next = jest.fn();

        mw(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.headers["X-Request-Id"]).toBeTruthy();

        res.emit("finish");
        expect(written).toHaveLength(1);
        const parsed = JSON.parse(written[0]);
        expect(parsed.level).toBe("info");
        expect(parsed.msg).toBe("http_request");
        expect(parsed.path).toBe("/admin/settings");
        expect(parsed.path).not.toContain("secret123");
        expect(parsed.statusCode).toBe(200);
        expect(parsed.requestId).toBe(res.headers["X-Request-Id"]);
      } finally {
        if (originalLevel === undefined) delete process.env.LOG_LEVEL;
        else process.env.LOG_LEVEL = originalLevel;
      }
    });
  });

  describe("3. GDPR compliance (masked RFID logs, individual export & retention anonymization)", () => {
    test("maskRfidUid hides raw badge UIDs and rfidPlugin never persists plaintext RFID in Log", async () => {
      expect(structuredLogger.maskRfidUid("DEADBEEF1234")).toBe("****1234");
      expect(structuredLogger.maskRfidUid("AB12")).toBe("****");

      let scanHandler = null;
      rfidPlugin.register({
        addHook: (name, fn) => {
          if (name === "rfid:scan") scanHandler = fn;
        },
      });

      mockDb.user.findFirst.mockResolvedValueOnce({
        id: 5,
        name: "Ada",
        surname: "Lovelace",
        termsAccepted: true,
        usertype: { name: "Étudiant" },
      });
      mockDb.history.findFirst.mockResolvedValueOnce(null);
      mockDb.history.create.mockResolvedValueOnce({ id: 99 });

      const result = await scanHandler({ rfid: "04A1B2C3D4E5", workspaceId: 1, staffUsername: "kiosk" });
      expect(result.success).toBe(true);
      expect(simpleLogger.logThat).toHaveBeenCalledTimes(1);
      const loggedMessage = simpleLogger.logThat.mock.calls[0][0];
      expect(loggedMessage).not.toContain("04A1B2C3D4E5");
      expect(loggedMessage).toContain("****D4E5");
    });

    test("rgpdService.exportUserData exports contributor data without exposing internal token", async () => {
      mockDb.user.findUnique.mockResolvedValueOnce({
        id: 12,
        name: "Marie",
        surname: "Curie",
        email: "marie@example.org",
        token: "secret-internal-charter-token",
        rfid: "04AA11BB22CC",
        balance: 15.5,
        termsAccepted: true,
        newsletter: false,
        isExpert: true,
        birthYear: 1867,
        comment: "Physicienne",
        createdAt: new Date("2025-01-01T10:00:00Z"),
        updatedAt: null,
        deletedAt: null,
        usertype: { name: "Chercheur" },
        projects: [],
        history: [],
        activities: [],
        warnings: [],
        workshopInterests: [],
        workshopCompletions: [],
        Log: [],
      });

      const appTest = express();
      appTest.use((req, _res, next) => {
        req.session = { loggedin: true, role: "admin", username: "admin" };
        next();
      });
      appTest.use("/users", usersRouter);

      const res = await request(appTest).get("/users/12/export-rgpd");
      expect(res.status).toBe(200);
      expect(res.headers["content-disposition"]).toContain("rgpd_export_user_12_");
      expect(res.body.subject.email).toBe("marie@example.org");
      expect(res.body.subject.rfidMasked).toBe("****22CC");
      expect(res.body.subject).not.toHaveProperty("token");
      expect(JSON.stringify(res.body)).not.toContain("secret-internal-charter-token");
      expect(JSON.stringify(res.body)).not.toContain("04AA11BB22CC");
    });

    test("rgpdService.anonymizeInactiveUsers respects retention cutoff and --dry-run", async () => {
      const now = new Date("2026-11-22T00:00:00Z");
      mockDb.user.findMany.mockResolvedValue([
        {
          id: 101,
          email: "old@example.org",
          createdAt: new Date("2022-01-01T00:00:00Z"),
          deletedAt: null,
          history: [{ arrival: new Date("2022-06-01T00:00:00Z") }],
          activities: [],
        },
        {
          id: 102,
          email: "recent@example.org",
          createdAt: new Date("2022-01-01T00:00:00Z"),
          deletedAt: null,
          history: [{ arrival: new Date("2026-05-01T00:00:00Z") }],
          activities: [],
        },
      ]);
      mockDb.user.update.mockResolvedValue({});
      mockDb.userWorkshopInterest.deleteMany.mockResolvedValue({ count: 0 });

      const dryRes = await rgpdService.anonymizeInactiveUsers({ retentionMonths: 36, dryRun: true, now, prisma: mockDb });
      expect(dryRes.eligibleUserIds).toEqual([101]);
      expect(dryRes.anonymizedCount).toBe(0);
      expect(mockDb.user.update).not.toHaveBeenCalled();

      const execRes = await rgpdService.anonymizeInactiveUsers({ retentionMonths: 36, dryRun: false, now, prisma: mockDb });
      expect(execRes.anonymizedCount).toBe(1);
      expect(mockDb.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 101 },
          data: expect.objectContaining({
            name: "Anonyme",
            surname: "#101",
            email: "anonyme-101@anonymized.local",
            rfid: null,
            birthYear: null,
          }),
        }),
      );
      expect(parseArgs(["--months=24", "--dry-run"])).toEqual({ retentionMonths: 24, dryRun: true });
    });
  });

  describe("4. .env.example, scripts/setup.js & documentation alignment", () => {
    test(".env.example defines PORT=8080, SMTP_PORT=587, APP_TIMEZONE and SECRET", () => {
      const envExample = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
      expect(envExample).toContain("PORT=8080");
      expect(envExample).toContain("SMTP_PORT=587");
      expect(envExample).toContain("APP_TIMEZONE=");
      expect(envExample).toContain("SECRET=");
      expect(envExample).toContain("DATABASE_URL_TEST=");
    });

    test("scripts/setup.js masks password input on TTY and advertises port 8080", () => {
      const setupSrc = fs.readFileSync(path.join(ROOT, "scripts/setup.js"), "utf8");
      expect(setupSrc).toContain("setRawMode");
      expect(setupSrc).toContain('process.env.PORT || "8080"');
      expect(setupSrc).not.toContain("http://localhost:3000");
    });

    test("package.json, README.md and DEVELOPMENT.md are aligned with current repository state", () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
      expect(pkg.version).toMatch(/^1\.(4|5)\.\d+$/);
      expect(pkg.scripts["db:migrate"]).toBe("node scripts/migrate.js");
      expect(pkg.scripts["rgpd:anonymize"]).toBe("node scripts/rgpd-anonymize.js");

      const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
      expect(readme).toContain("http://localhost:8080");
      expect(readme).toContain("/healthz");
      expect(readme).not.toContain("http://localhost:3000");
      expect(readme).not.toContain("plugins/uePlugin.js");

      const devDoc = fs.readFileSync(path.join(ROOT, "DEVELOPMENT.md"), "utf8");
      expect(devDoc).not.toContain("hookLoader.js");
      expect(devDoc).not.toContain("AutoPrismaClient");
      expect(devDoc).not.toContain("plugins/uePlugin.js");
      expect(devDoc).toContain("scripts/migrate.js");
    });
  });
});
