const path = require("path");
const fs = require("fs");
const ejs = require("ejs");
const express = require("express");
const request = require("supertest");

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
  },
  userProject: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  project: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  history: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  workshop: {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  consumable: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  machine: {
    findMany: jest.fn().mockResolvedValue([]),
  },
};

const mockRealtime = { publish: jest.fn() };
const mockLogger = { logThat: jest.fn() };

jest.mock("../../utilities/db.js", () => ({
  prisma: mockPrisma,
  ResourceType: { MACHINE: "MACHINE", EQUIPMENT: "EQUIPMENT", CONSUMABLE: "CONSUMABLE" },
}));
jest.mock("../../utilities/db", () => ({
  prisma: mockPrisma,
  ResourceType: { MACHINE: "MACHINE", EQUIPMENT: "EQUIPMENT", CONSUMABLE: "CONSUMABLE" },
}));
jest.mock("../../services/realtimeService.js", () => mockRealtime);
jest.mock("../../utilities/simpleLogger.js", () => mockLogger);
jest.mock("../../middleware/checkSession.js", () => (req, _res, next) => next());
jest.mock("../../services/staffSessionService.js", () => ({
  verifyActiveStaffSession: jest.fn().mockResolvedValue({ valid: true }),
}));

const hookManager = require("../../core/HookManager.js");
const rfidPlugin = require("../../plugins/rfidPlugin.js");
const apiRouter = require("../../routes/api.js");
const fabtrackRouter = require("../../routes/fabtrack.js");

function buildApp(role = "staff") {
  const app = express();
  app.set("views", path.join(__dirname, "../../views"));
  app.set("view engine", "ejs");
  app.engine("html", ejs.renderFile);
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = {
      loggedin: true,
      role,
      staffId: 3,
      username: role === "staff" ? "borne1" : "mediator1",
      selectedWorkspace: { id: 2, name: "Atelier Fab" },
    };
    res.locals.role = role;
    res.locals.username = req.session.username;
    res.locals.baseUrl = "/";
    res.locals.csrfToken = "tok";
    res.locals.isPluginRfidEnabled = true;
    res.locals.isPluginUeEnabled = false;
    res.locals.isPluginSorbonneEnabled = false;
    res.locals.isPluginRepairCafeEnabled = false;
    res.locals.isPluginWorkshopEnabled = false;
    res.locals.isPluginBookstackEnabled = false;
    res.locals.projecttypes = [{ id: 1, name: "Personnel" }];
    res.locals.usertypes = [];
    res.locals.selectedWorkspace = req.session.selectedWorkspace;
    res.locals.availableWorkspaces = [req.session.selectedWorkspace];
    res.locals.platformName = "FabtrackJS";
    res.locals.appVersion = "1.5.0";
    res.locals.currentLocale = "fr";
    res.locals.locales = ["fr"];
    res.locals.localesMeta = [{ code: "fr", name: "Français", flag: "🇫🇷" }];
    res.locals.safeJson = (v) => JSON.stringify(v);
    res.locals.safeHttpUrl = (v) => v;
    res.locals.escapeHtml = (v) => String(v || "");
    res.locals.__ = (k) => k;
    next();
  });
  app.use("/api", apiRouter);
  app.use("/fabtrack", fabtrackRouter);
  return app;
}

describe("R-036 — Badge-only self-service borne (role === 'staff')", () => {
  beforeAll(() => {
    hookManager.hooks = {};
    hookManager.registerPlugin(rfidPlugin);
    hookManager.setPluginEnabled("rfid", true);
    rfidPlugin.register(hookManager);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("borne scan for known user with accepted charter returns prompt_checkin with ONLY own projects and creates 0 visits until confirmed", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 10,
      name: "Claire",
      surname: "Dubois",
      termsAccepted: true,
      usertype: { name: "Étudiant" },
    });
    mockPrisma.history.findFirst.mockResolvedValue(null);
    mockPrisma.userProject.findMany.mockResolvedValue([
      {
        id: 55,
        project: {
          id: 77,
          url: "https://wiki.example.org/books/drone",
          customTitle: "Drone Autonome",
          wikiTitle: "Wiki Drone",
          projecttypeId: 1,
        },
      },
    ]);

    const res = await request(buildApp("staff"))
      .post("/api/rfid/scan")
      .send({ rfid: "BADGE001" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.action).toBe("prompt_checkin");
    expect(res.body.user).toEqual({ name: "Claire", surname: "Dubois", type: "Étudiant" });
    expect(res.body.projects).toEqual([
      expect.objectContaining({ id: 77, displayTitle: "Drone Autonome" }),
    ]);
    // Cancelling or abandoning never leaves a visit created
    expect(mockPrisma.history.create).not.toHaveBeenCalled();
  });

  test("POST /api/rfid/checkin confirms visit with motif, own project & optional comment, and blocks double confirmation", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 10,
      name: "Claire",
      surname: "Dubois",
      termsAccepted: true,
      usertype: { name: "Étudiant" },
    });
    mockPrisma.history.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 901 });
    mockPrisma.userProject.findFirst.mockResolvedValue({ id: 55, projectId: 77 });
    mockPrisma.project.findUnique.mockResolvedValue({ sorbonneEntity: null });
    mockPrisma.history.create.mockResolvedValue({ id: 901 });

    const app = buildApp("staff");
    const first = await request(app).post("/api/rfid/checkin").send({
      rfid: "BADGE002",
      projecttype: 1,
      projectid: "77",
      comments: "Découpe laser",
    });

    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);
    expect(first.body.action).toBe("checkin");
    expect(mockPrisma.history.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.history.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 10,
        userprojectId: 55,
        workspaceId: 2,
        comments: "Découpe laser",
      }),
    });

    // Double confirmation returns 409 ALREADY_CHECKED_IN without creating a second visit
    const second = await request(app).post("/api/rfid/checkin").send({
      rfid: "BADGE002",
      projecttype: 1,
      projectid: "77",
    });

    expect(second.status).toBe(409);
    expect(second.body.code).toBe("ALREADY_CHECKED_IN");
    expect(mockPrisma.history.create).toHaveBeenCalledTimes(1);
  });

  test("unknown badge or unsigned charter directs to welcome desk without creating visit", async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce(null);
    const unknownRes = await request(buildApp("staff"))
      .post("/api/rfid/scan")
      .send({ rfid: "UNKNOWN99" });

    expect(unknownRes.status).toBe(404);
    expect(unknownRes.body.code).toBe("USER_NOT_FOUND");
    expect(unknownRes.body.message).toMatch(/accueil/i);

    mockPrisma.user.findFirst.mockResolvedValueOnce({
      id: 11,
      name: "Leo",
      surname: "Petit",
      termsAccepted: false,
      usertype: { name: "Externe" },
    });
    mockPrisma.history.findFirst.mockResolvedValueOnce(null);

    const noCharterRes = await request(buildApp("staff"))
      .post("/api/rfid/scan")
      .send({ rfid: "NOCHARTER1" });

    expect(noCharterRes.status).toBe(403);
    expect(noCharterRes.body.code).toBe("TERMS_NOT_ACCEPTED");
    expect(noCharterRes.body.message).toMatch(/accueil/i);
    expect(mockPrisma.history.create).not.toHaveBeenCalled();
  });

  test("scanning badge during an open visit checks out immediately", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 10,
      name: "Claire",
      surname: "Dubois",
      termsAccepted: true,
      usertype: { name: "Étudiant" },
    });
    mockPrisma.history.findFirst.mockResolvedValue({
      id: 901,
      userId: 10,
      workspaceId: 2,
      arrival: new Date(Date.now() - 45 * 60 * 1000),
      departure: null,
    });
    mockPrisma.history.update.mockResolvedValue({ id: 901 });

    const outRes = await request(buildApp("staff"))
      .post("/api/rfid/scan")
      .send({ rfid: "BADGE_OUT_1" });

    expect(outRes.status).toBe(200);
    expect(outRes.body.success).toBe(true);
    expect(outRes.body.action).toBe("checkout");
    expect(mockPrisma.history.update).toHaveBeenCalledTimes(1);
  });

  test("GET /fabtrack for role === 'staff' renders badge-only borne UI without user search, present list, or creation form", async () => {
    const res = await request(buildApp("staff")).get("/fabtrack");
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="borneKioskShell"');
    expect(res.text).toContain('id="borneStandbyView"');
    expect(res.text).toContain('id="borneWelcomeDeskNotice"');
    expect(res.text).toContain('id="borneCheckinForm"');
    expect(res.text).not.toContain('id="kioskPresentContainer"');
    expect(res.text).not.toContain('id="newuser"');
    expect(res.text).not.toContain('id="activityManager"');
    expect(res.text).not.toContain("javascripts/fabtrack.js");

    const borneJs = fs.readFileSync(
      path.join(__dirname, "../../public/javascripts/borne-checkin.js"),
      "utf8",
    );
    expect(borneJs).toContain("wipeFormState");
    expect(borneJs).toContain("resetBorneToStandby");
  });
});
