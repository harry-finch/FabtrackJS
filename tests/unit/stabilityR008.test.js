const fs = require("fs");
const path = require("path");
const vm = require("vm");
const express = require("express");
const request = require("supertest");

const mockPrisma = {
  staff: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
  usertype: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  user: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  history: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  project: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  log: {
    create: jest.fn().mockResolvedValue({ id: 1 }),
  },
  systemSetting: {
    findMany: jest.fn().mockResolvedValue([]),
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

const staffSessionService = require("../../services/staffSessionService");
const apiRouter = require("../../routes/api");
const indexRouter = require("../../routes/index");

function createClassList(initial = []) {
  const classes = new Set(initial);
  return {
    add: (...items) => items.forEach((c) => classes.add(c)),
    remove: (...items) => items.forEach((c) => classes.delete(c)),
    contains: (c) => classes.has(c),
  };
}

function loadMainJsHarness({ pathname = "/fabtrack/", getAppBaseUrl } = {}) {
  const filePath = path.join(__dirname, "../../public/javascripts/main.js");
  const source = fs.readFileSync(filePath, "utf8");

  const docListeners = {};
  const winListeners = {};
  const progressBar = {
    id: "",
    classList: createClassList(),
    style: {},
  };
  const mainContainer = {
    classList: createClassList(),
  };

  const windowObj = {
    __fabtrackMainLoaded: false,
    location: {
      origin: "http://localhost:8080",
      pathname,
      search: "",
      assign: jest.fn(),
    },
    getAppBaseUrl: getAppBaseUrl || ((p) => "/fabtrack" + p),
    matchMedia: jest.fn(() => ({ matches: false })),
    addEventListener: jest.fn((evt, cb) => {
      winListeners[evt] = cb;
    }),
  };

  const documentObj = {
    readyState: "complete",
    startViewTransition: undefined,
    documentElement: {
      appendChild: jest.fn(),
    },
    getElementById: jest.fn((id) => (id === "page-progress-bar" ? null : null)),
    createElement: jest.fn(() => progressBar),
    querySelector: jest.fn((selector) => (selector === "main.main-container" ? mainContainer : null)),
    addEventListener: jest.fn((evt, cb) => {
      docListeners[evt] = cb;
    }),
  };

  const sandbox = {
    window: windowObj,
    document: documentObj,
    URL,
    setTimeout: jest.fn(() => 1),
    clearTimeout: jest.fn(),
  };

  vm.runInNewContext(source, sandbox, { filename: "main.js" });

  return {
    window: windowObj,
    document: documentObj,
    progressBar,
    mainContainer,
    docListeners,
    winListeners,
  };
}

function createLinkElement(href) {
  return {
    target: "",
    origin: "http://localhost:8080",
    pathname: href,
    search: "",
    hash: "",
    getAttribute: jest.fn((attr) => (attr === "href" ? href : null)),
    hasAttribute: jest.fn(() => false),
  };
}

function createClickEvent(link, overrides = {}) {
  const event = {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: {
      closest: jest.fn((selector) => (selector === "a" ? link : null)),
    },
    preventDefault: jest.fn(() => {
      event.defaultPrevented = true;
    }),
    ...overrides,
  };
  return event;
}

describe("Unit R-008: Stability & Error Handling", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    staffSessionService.clearCache();
    mockPrisma.staff.findUnique.mockResolvedValue({
      id: 1,
      name: "admin_test",
      role: "admin",
      approved: true,
    });
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("Group 1: public/javascripts/main.js event guards", () => {
    test("ignores click when defaultPrevented is true on subpath link", () => {
      const harness = loadMainJsHarness({
        getAppBaseUrl: (p) => "/fabtrack" + p,
      });
      const link = createLinkElement("/admin/users/delete/1");
      const event = createClickEvent(link, { defaultPrevented: true });

      harness.docListeners.click(event);

      expect(harness.window.location.assign).not.toHaveBeenCalled();
      expect(harness.progressBar.classList.contains("active")).toBe(false);
    });

    test.each([
      { label: "ctrlKey", overrides: { ctrlKey: true } },
      { label: "metaKey", overrides: { metaKey: true } },
      { label: "shiftKey", overrides: { shiftKey: true } },
      { label: "altKey", overrides: { altKey: true } },
      { label: "middle button", overrides: { button: 1 } },
    ])("ignores modified click ($label)", ({ overrides }) => {
      const harness = loadMainJsHarness({
        getAppBaseUrl: (p) => "/fabtrack" + p,
      });
      const link = createLinkElement("/admin/users");
      const event = createClickEvent(link, overrides);

      harness.docListeners.click(event);

      expect(harness.window.location.assign).not.toHaveBeenCalled();
      expect(harness.progressBar.classList.contains("active")).toBe(false);
    });

    test("rewrites subpath URL via window.location.assign on normal unmodified click", () => {
      const harness = loadMainJsHarness({
        getAppBaseUrl: (p) => "/fabtrack" + p,
      });
      const link = createLinkElement("/admin/users");
      const event = createClickEvent(link);

      harness.docListeners.click(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(harness.progressBar.classList.contains("active")).toBe(true);
      expect(harness.window.location.assign).toHaveBeenCalledWith("/fabtrack/admin/users");
    });

    test("ignores submit when defaultPrevented is true", () => {
      const harness = loadMainJsHarness({
        getAppBaseUrl: (p) => "/fabtrack" + p,
      });
      const form = {
        target: "",
        action: "http://localhost:8080/admin/users/delete/1",
        dataset: {},
        getAttribute: jest.fn((attr) => (attr === "action" ? "/admin/users/delete/1" : null)),
        querySelector: jest.fn(() => null),
      };
      const event = {
        defaultPrevented: true,
        target: form,
        preventDefault: jest.fn(),
      };

      harness.docListeners.submit(event);

      expect(form.dataset.submitting).toBeUndefined();
      expect(harness.progressBar.classList.contains("active")).toBe(false);
    });
  });

  describe("Group 2: utilities/simpleLogger.js resilience & truncation", () => {
    test("exports MAX_LOG_LENGTH = 255 and truncates 400-char messages with '...'", async () => {
      const { createLogger, MAX_LOG_LENGTH } = require("../../utilities/simpleLogger");
      expect(MAX_LOG_LENGTH).toBe(255);

      const prismaStub = {
        log: {
          create: jest.fn().mockResolvedValue({ id: 1 }),
        },
      };
      const consoleStub = { log: jest.fn(), error: jest.fn() };
      const logger = createLogger({ prisma: prismaStub, consoleObj: consoleStub });

      const longMessage = "A".repeat(400);
      await logger.logThat(longMessage);

      expect(prismaStub.log.create).toHaveBeenCalledTimes(1);
      const savedDesc = prismaStub.log.create.mock.calls[0][0].data.description;
      expect(savedDesc).toHaveLength(255);
      expect(savedDesc.endsWith("...")).toBe(true);
      expect(savedDesc).toBe("A".repeat(252) + "...");
    });

    test("resolves without throwing and logs to consoleObj.error when prisma.log.create rejects", async () => {
      const { createLogger } = require("../../utilities/simpleLogger");
      const dbError = new Error("Column too long");
      const prismaStub = {
        log: {
          create: jest.fn().mockRejectedValue(dbError),
        },
      };
      const consoleStub = { log: jest.fn(), error: jest.fn() };
      const logger = createLogger({ prisma: prismaStub, consoleObj: consoleStub });

      await expect(logger.logThat("Test failure resilience")).resolves.toBeUndefined();
      expect(consoleStub.error).toHaveBeenCalled();
    });

    test("handles null, undefined, and numeric values safely", async () => {
      const { createLogger } = require("../../utilities/simpleLogger");
      const prismaStub = {
        log: {
          create: jest.fn().mockResolvedValue({ id: 1 }),
        },
      };
      const consoleStub = { log: jest.fn(), error: jest.fn() };
      const logger = createLogger({ prisma: prismaStub, consoleObj: consoleStub });

      await expect(logger.logThat(null)).resolves.toBeUndefined();
      await expect(logger.logThat(undefined)).resolves.toBeUndefined();
      await expect(logger.logThat(42)).resolves.toBeUndefined();

      expect(prismaStub.log.create).toHaveBeenCalledTimes(3);
      expect(prismaStub.log.create.mock.calls[2][0].data.description).toBe("42");
    });
  });

  describe("Group 3: SMTP_PORT vs PORT isolation", () => {
    test("uses default 587 instead of process.env.PORT (8080) when SMTP_PORT is unset", async () => {
      process.env.PORT = "8080";
      delete process.env.SMTP_PORT;

      let defaults;
      let createTransportSpy;

      await jest.isolateModulesAsync(async () => {
        const nodemailer = require("nodemailer");
        createTransportSpy = jest
          .spyOn(nodemailer, "createTransport")
          .mockReturnValue({ sendMail: jest.fn() });

        const settingsService = require("../../services/settingsService");
        defaults = settingsService.getDefaults();
        jest.spyOn(settingsService, "getSettings").mockResolvedValue({
          smtp_host: "smtp.fablab.local",
          smtp_port: "",
          smtp_user: "",
          smtp_pass: "",
          smtp_secure: "false",
        });

        const mailService = require("../../services/mailService");
        await mailService.getTransporter();
      });

      expect(defaults.smtp_port).toBe("587");
      expect(createTransportSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          host: "smtp.fablab.local",
          port: 587,
        }),
      );
    });

    test("uses process.env.SMTP_PORT (2525) when settings.smtp_port is empty", async () => {
      process.env.PORT = "8080";
      process.env.SMTP_PORT = "2525";

      let createTransportSpy;

      await jest.isolateModulesAsync(async () => {
        const nodemailer = require("nodemailer");
        createTransportSpy = jest
          .spyOn(nodemailer, "createTransport")
          .mockReturnValue({ sendMail: jest.fn() });

        const settingsService = require("../../services/settingsService");
        jest.spyOn(settingsService, "getSettings").mockResolvedValue({
          smtp_host: "smtp.fablab.local",
          smtp_port: "",
          smtp_user: "",
          smtp_pass: "",
          smtp_secure: "false",
        });

        const mailService = require("../../services/mailService");
        await mailService.getTransporter();
      });

      expect(createTransportSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          host: "smtp.fablab.local",
          port: 2525,
        }),
      );
    });
  });

  describe("Group 4: asyncHandler on routes/api.js and routes/index.js", () => {
    function buildErrorTestingApp(sessionOverride) {
      const app = express();
      app.use(express.json());
      app.use((req, res, next) => {
        req.session =
          typeof sessionOverride === "function"
            ? sessionOverride(req)
            : {
                loggedin: true,
                role: "admin",
                staffId: 1,
                username: "admin_test",
                selectedWorkspace: { id: 1, name: "Fablab" },
                destroy: jest.fn((cb) => cb && cb()),
              };
        next();
      });
      app.use("/api", apiRouter);
      app.use("/", indexRouter);
      app.use((err, req, res, next) => {
        res.status(500).json({ error: err.message });
      });
      return app;
    }

    test("forwards prisma rejection on GET /api/list/all-staff to Express error middleware (500)", async () => {
      const unhandled = [];
      const onUnhandled = (err) => unhandled.push(err);
      process.on("unhandledRejection", onUnhandled);

      try {
        mockPrisma.staff.findMany.mockRejectedValueOnce(new Error("Staff DB failure"));
        const app = buildErrorTestingApp();

        const res = await request(app).get("/api/list/all-staff");

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: "Staff DB failure" });
        expect(unhandled).toHaveLength(0);
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }
    });

    test.each([
      { path: "/api/list/all-usertypes", model: "usertype" },
      { path: "/api/list/all-users", model: "user" },
      { path: "/api/list/all-history", model: "history" },
      { path: "/api/list/users-inlab", model: "history" },
      { path: "/api/list/all-projects", model: "project" },
    ])("forwards prisma rejection on GET $path to Express error middleware (500)", async ({ path: routePath, model }) => {
      mockPrisma[model].findMany.mockRejectedValueOnce(new Error(`Failure on ${routePath}`));
      const app = buildErrorTestingApp();

      const res = await request(app).get(routePath);

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: `Failure on ${routePath}` });
    });

    test("forwards error on POST /logout when req.session.destroy throws after await", async () => {
      const unhandled = [];
      const onUnhandled = (err) => unhandled.push(err);
      process.on("unhandledRejection", onUnhandled);

      try {
        mockPrisma.staff.update.mockResolvedValueOnce({});
        const app = buildErrorTestingApp(() => ({
          loggedin: true,
          role: "admin",
          username: "admin_test",
          selectedWorkspace: { id: 1, name: "Fablab" },
          destroy: () => {
            throw new Error("Session destroy failure");
          },
        }));

        const res = await request(app).post("/logout");

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: "Session destroy failure" });
        expect(unhandled).toHaveLength(0);
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }
    });
  });
});
