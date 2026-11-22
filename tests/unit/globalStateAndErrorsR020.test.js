const fs = require("fs");
const path = require("path");
const moment = require("moment");

const mockPrismaClient = {
  systemSetting: {
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
};

jest.mock("../../utilities/db", () => ({
  prisma: mockPrismaClient,
  ResourceType: { MACHINE: "MACHINE", EQUIPMENT: "EQUIPMENT", CONSUMABLE: "CONSUMABLE" },
  ConsumableStatus: { AVAILABLE: "AVAILABLE", LOW_STOCK: "LOW_STOCK", OUT_OF_STOCK: "OUT_OF_STOCK" },
}));

jest.mock("@prisma/client", () => {
  const actual = jest.requireActual("@prisma/client");
  return {
    ...actual,
    PrismaClient: jest.fn(() => mockPrismaClient),
  };
});

const dateService = require("../../services/dateService.js");
const settingsService = require("../../services/settingsService.js");
const hookManager = require("../../core/HookManager.js");
const app = require("../../app.js");

describe("R-020: No per-request global state mutation & production error masking", () => {
  describe("1. Per-request Moment locale isolation in dateService", () => {
    test("concurrent FR, EN, ES and DE formatters stay isolated without mutating global moment.locale()", async () => {
      const initialGlobalLocale = moment.locale();
      const fr = dateService.createRequestDateHelpers("fr");
      const en = dateService.createRequestDateHelpers("en");
      const es = dateService.createRequestDateHelpers("es");
      const de = dateService.createRequestDateHelpers("de");

      // Loading extra CSV-added locales must NOT have mutated global moment.locale()
      expect(moment.locale()).toBe(initialGlobalLocale);

      const sampleDate = "2026-09-13T10:15:00Z";
      const [outFr, outEn, outEs, outDe] = await Promise.all([
        Promise.resolve().then(() => fr.formatDate(sampleDate, "D MMMM YYYY")),
        Promise.resolve().then(() => en.formatDate(sampleDate, "D MMMM YYYY")),
        Promise.resolve().then(() => es.formatDate(sampleDate, "D MMMM YYYY")),
        Promise.resolve().then(() => de.formatDate(sampleDate, "D MMMM YYYY")),
      ]);

      expect(outFr.toLowerCase()).toContain("septembre");
      expect(outEn.toLowerCase()).toContain("september");
      expect(outEs.toLowerCase()).toContain("septiembre");
      expect(outDe.toLowerCase()).toContain("september");
      expect(moment.locale()).toBe(initialGlobalLocale);
    });

    test("malformed or unknown locale codes safely fall back to 'fr' without crashing", () => {
      const before = moment.locale();
      expect(dateService.resolveMomentLocale("../../etc/passwd")).toBe("fr");
      expect(dateService.resolveMomentLocale("zz")).toBe("fr");
      expect(dateService.resolveMomentLocale("")).toBe("fr");
      expect(dateService.resolveMomentLocale(null)).toBe("fr");
      expect(moment.locale()).toBe(before);
    });
  });

  describe("2. Plugin synchronization happens on load/update only (not per request)", () => {
    test("app.js no longer calls hookManager.setPluginEnabled or dateService.setLocale per request", () => {
      const appSource = fs.readFileSync(path.join(__dirname, "../../app.js"), "utf8");
      expect(appSource).not.toMatch(/hookManager\.setPluginEnabled\s*\(/);
      expect(appSource).not.toMatch(/dateService\.setLocale\s*\(/);
    });

    test("settingsService.updateSettings and setSetting immediately synchronize HookManager plugin flags", async () => {
      mockPrismaClient.systemSetting.upsert.mockResolvedValue({});
      mockPrismaClient.systemSetting.findMany.mockResolvedValue([
        { key: "plugin_bookstack_enabled", value: "false" },
        { key: "plugin_sorbonne_enabled", value: "false" },
      ]);

      await settingsService.updateSettings({
        plugin_bookstack_enabled: "false",
        plugin_sorbonne_enabled: "false",
      });

      expect(hookManager.isPluginEnabled("bookstack")).toBe(false);
      expect(hookManager.isPluginEnabled("sorbonne")).toBe(false);
      expect(hookManager.isPluginEnabled("ue")).toBe(true);

      await settingsService.setSetting("plugin_bookstack_enabled", "true");
      expect(hookManager.isPluginEnabled("bookstack")).toBe(true);

      // Restore clean defaults for subsequent tests
      settingsService.syncPluginStates(settingsService.getDefaults());
    });
  });

  describe("3. Global error handler masks stack traces and internal 5xx details outside explicit development", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    let errorSpy;

    beforeEach(() => {
      errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      errorSpy.mockRestore();
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    function createMockReqRes({ isJson = false, originalUrl = "/admin/test" } = {}) {
      const req = {
        originalUrl,
        path: originalUrl,
        xhr: false,
        headers: isJson ? { accept: "application/json" } : {},
        is: () => false,
        session: {},
        app: { get: () => "development" }, // Simulate Express default when NODE_ENV is unset
      };
      const res = {
        statusCode: 200,
        locals: {},
        jsonPayload: null,
        renderedView: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.jsonPayload = payload;
          return this;
        },
        render(view) {
          this.renderedView = view;
          return this;
        },
      };
      return { req, res };
    }

    test.each(["production", undefined, "", "staging"])(
      "masks 500 Prisma error message and stack trace when NODE_ENV=%p (JSON & HTML)",
      (envVal) => {
        if (envVal === undefined) {
          delete process.env.NODE_ENV;
        } else {
          process.env.NODE_ENV = envVal;
        }

        const prismaErr = new Error(
          "Invalid `prisma.user.findUnique()` invocation: Unknown column `secret_col` in SELECT * FROM User",
        );
        prismaErr.statusCode = 500;

        // JSON response
        const jsonCtx = createMockReqRes({ isJson: true, originalUrl: "/api/users" });
        app.globalErrorHandler(prismaErr, jsonCtx.req, jsonCtx.res, () => {});
        expect(jsonCtx.res.statusCode).toBe(500);
        expect(jsonCtx.res.jsonPayload.success).toBe(false);
        expect(jsonCtx.res.jsonPayload.message).toBe(app.GENERIC_SERVER_ERROR_MESSAGE);
        expect(jsonCtx.res.jsonPayload.error.stack).toBeUndefined();
        expect(JSON.stringify(jsonCtx.res.jsonPayload)).not.toContain("prisma");
        expect(JSON.stringify(jsonCtx.res.jsonPayload)).not.toContain("secret_col");

        // HTML response
        const htmlCtx = createMockReqRes({ isJson: false, originalUrl: "/users/manage" });
        app.globalErrorHandler(prismaErr, htmlCtx.req, htmlCtx.res, () => {});
        expect(htmlCtx.res.statusCode).toBe(500);
        expect(htmlCtx.res.renderedView).toBe("error");
        expect(htmlCtx.res.locals.message).toBe(app.GENERIC_SERVER_ERROR_MESSAGE);
        expect(htmlCtx.res.locals.error.stack).toBeUndefined();
        expect(htmlCtx.res.locals.message).not.toContain("prisma");
      },
    );

    test("exposes stack trace and real error message only when NODE_ENV === 'development'", () => {
      process.env.NODE_ENV = "development";
      const devErr = new Error("Detailed dev Prisma error");
      devErr.statusCode = 500;

      const jsonCtx = createMockReqRes({ isJson: true, originalUrl: "/api/debug" });
      app.globalErrorHandler(devErr, jsonCtx.req, jsonCtx.res, () => {});
      expect(jsonCtx.res.statusCode).toBe(500);
      expect(jsonCtx.res.jsonPayload.message).toBe("Detailed dev Prisma error");
      expect(typeof jsonCtx.res.jsonPayload.error.stack).toBe("string");
    });

    test("preserves 404 client error rendering without exposing stack trace outside development", () => {
      process.env.NODE_ENV = "production";
      const notFoundErr = new Error("Not Found: /unknown");
      notFoundErr.statusCode = 404;

      const htmlCtx = createMockReqRes({ isJson: false, originalUrl: "/unknown" });
      app.globalErrorHandler(notFoundErr, htmlCtx.req, htmlCtx.res, () => {});
      expect(htmlCtx.res.statusCode).toBe(404);
      expect(htmlCtx.res.renderedView).toBe("404");
      expect(htmlCtx.res.locals.error.stack).toBeUndefined();
    });
  });
});
