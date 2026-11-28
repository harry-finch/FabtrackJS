const express = require("express");
const request = require("supertest");

const mockPrisma = {
  project: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
  userProject: {
    findMany: jest.fn(),
  },
};

const mockBookstackService = {
  getConfig: jest.fn(),
  fetchDocMetadata: jest.fn(),
  clearCache: jest.fn(),
  runWithConcurrency: jest.fn(async (items, _limit, fn) => {
    for (const item of items) {
      await fn(item);
    }
  }),
  CONCURRENCY_LIMIT: 5,
};

jest.mock("../../utilities/db.js", () => ({
  prisma: mockPrisma,
  ResourceType: { MACHINE: "MACHINE", EQUIPMENT: "EQUIPMENT", CONSUMABLE: "CONSUMABLE" },
}));

jest.mock("../../services/bookstackService.js", () => mockBookstackService);

jest.mock("../../services/sorbonneService.js", () => ({
  getDistinctEntities: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../core/HookManager.js", () => ({
  isPluginEnabled: jest.fn().mockReturnValue(true),
  triggerAsyncHook: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../utilities/simpleLogger.js", () => ({
  logThat: jest.fn(),
}));

jest.mock("../../middleware/checkSession.js", () => (req, _res, next) => next());

jest.mock("../../services/staffSessionService.js", () => ({
  verifyActiveStaffSession: jest.fn().mockResolvedValue({ valid: true }),
}));

const projectTitleService = require("../../services/projectTitleService.js");
const historyRouter = require("../../routes/history.js");
const apiRouter = require("../../routes/api.js");

function buildApp(role = "admin") {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = {
      loggedin: true,
      role,
      username: "alice",
      lastPage: "/admin/bookstack",
    };
    next();
  });
  app.use("/history", historyRouter);
  app.use("/api", apiRouter);
  return app;
}

describe("R-038 — Project titles (priority, custom override, wiki sync, offline fallback)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("resolves display title with priority: customTitle > wikiTitle > url", () => {
    expect(
      projectTitleService.resolveProjectDisplayTitle({
        customTitle: "Robot Fablab",
        wikiTitle: "Livre Robotique v2",
        url: "https://wiki.example.org/books/robot",
      }),
    ).toBe("Robot Fablab");

    expect(
      projectTitleService.resolveProjectDisplayTitle({
        customTitle: "   ",
        wikiTitle: "Livre Robotique v2",
        url: "https://wiki.example.org/books/robot",
      }),
    ).toBe("Livre Robotique v2");

    expect(
      projectTitleService.resolveProjectDisplayTitle({
        customTitle: null,
        wikiTitle: null,
        url: "https://wiki.example.org/books/robot",
      }),
    ).toBe("https://wiki.example.org/books/robot");
  });

  test("updateCustomTitle sets custom name and clearing it restores wikiTitle", async () => {
    mockPrisma.project.findUnique.mockResolvedValue({
      id: 42,
      url: "https://wiki.example.org/books/cnc",
      customTitle: null,
      wikiTitle: "Fraiseuse CNC",
    });
    mockPrisma.project.update.mockResolvedValueOnce({
      id: 42,
      url: "https://wiki.example.org/books/cnc",
      customTitle: "CNC Atelier Bois",
      wikiTitle: "Fraiseuse CNC",
    });

    const renamed = await projectTitleService.updateCustomTitle(42, "  CNC Atelier Bois  ");
    expect(mockPrisma.project.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { customTitle: "CNC Atelier Bois" },
      select: { id: true, url: true, customTitle: true, wikiTitle: true },
    });
    expect(renamed.displayTitle).toBe("CNC Atelier Bois");
    expect(renamed.source).toBe("custom");

    mockPrisma.project.update.mockResolvedValueOnce({
      id: 42,
      url: "https://wiki.example.org/books/cnc",
      customTitle: null,
      wikiTitle: "Fraiseuse CNC",
    });

    const cleared = await projectTitleService.updateCustomTitle(42, "   ");
    expect(mockPrisma.project.update).toHaveBeenLastCalledWith({
      where: { id: 42 },
      data: { customTitle: null },
      select: { id: true, url: true, customTitle: true, wikiTitle: true },
    });
    expect(cleared.displayTitle).toBe("Fraiseuse CNC");
    expect(cleared.source).toBe("wiki");
  });

  test("syncProjectWikiTitle updates wikiTitle on BookStack rename without touching customTitle", async () => {
    mockBookstackService.getConfig.mockResolvedValue({
      isEnabled: true,
      isConfigured: true,
      baseUrl: "https://wiki.example.org/BookStack/",
    });
    mockBookstackService.fetchDocMetadata.mockResolvedValue({
      exists: true,
      title: "Nouveau titre du livre",
    });
    mockPrisma.project.update.mockResolvedValue({});

    const title = await projectTitleService.syncProjectWikiTitle({
      id: 7,
      url: "https://wiki.example.org/BookStack/books/mon-projet",
      wikiTitle: "Ancien titre",
      customTitle: "Nom local conservé",
    });

    expect(title).toBe("Nouveau titre du livre");
    expect(mockPrisma.project.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { wikiTitle: "Nouveau titre du livre" },
    });
  });

  test("syncProjectWikiTitle fails safely when BookStack is unavailable or disabled", async () => {
    mockBookstackService.getConfig.mockResolvedValue({
      isEnabled: true,
      isConfigured: true,
      baseUrl: "https://wiki.example.org/BookStack/",
    });
    mockBookstackService.fetchDocMetadata.mockRejectedValue(new Error("ECONNREFUSED"));

    const title = await projectTitleService.syncProjectWikiTitle({
      id: 9,
      url: "https://wiki.example.org/BookStack/books/offline",
      wikiTitle: "Dernier titre connu",
    });

    expect(title).toBeNull();
    expect(mockPrisma.project.update).not.toHaveBeenCalled();
  });

  test("GET /api/list/autocomplete-lists returns resolved displayTitle for kiosk selector", async () => {
    mockPrisma.project.findMany.mockResolvedValue([
      {
        id: 11,
        url: "https://wiki.example.org/books/laser",
        customTitle: "Découpeuse Laser",
        wikiTitle: "Wiki Laser",
        projecttypeId: 1,
        teachingUnitId: null,
        unregisteredUeName: null,
        unregisteredUeContact: null,
        sorbonneEntity: null,
      },
      {
        id: 12,
        url: "https://wiki.example.org/books/imprimante",
        customTitle: null,
        wikiTitle: "Guide Prusa MK4",
        projecttypeId: 1,
        teachingUnitId: null,
        unregisteredUeName: null,
        unregisteredUeContact: null,
        sorbonneEntity: null,
      },
    ]);
    mockPrisma.userProject.findMany.mockResolvedValue([]);

    const app = buildApp("user");
    const res = await request(app).get("/api/list/autocomplete-lists?scope=projects");

    expect(res.status).toBe(200);
    expect(res.body.projectlist).toEqual([
      expect.objectContaining({
        id: 11,
        displayTitle: "Découpeuse Laser",
        customTitle: "Découpeuse Laser",
        wikiTitle: "Wiki Laser",
        url: "https://wiki.example.org/books/laser",
      }),
      expect.objectContaining({
        id: 12,
        displayTitle: "Guide Prusa MK4",
        customTitle: null,
        wikiTitle: "Guide Prusa MK4",
        url: "https://wiki.example.org/books/imprimante",
      }),
    ]);
  });

  test("POST /history/project/title/:id allows admin/user and forbids staff borne", async () => {
    mockPrisma.project.findUnique.mockResolvedValue({
      id: 5,
      url: "https://wiki.example.org/books/test",
      customTitle: null,
      wikiTitle: "Titre Wiki",
    });
    mockPrisma.project.update.mockResolvedValue({
      id: 5,
      url: "https://wiki.example.org/books/test",
      customTitle: "Nom Fablab",
      wikiTitle: "Titre Wiki",
    });

    const userRes = await request(buildApp("user"))
      .post("/history/project/title/5")
      .set("Accept", "application/json")
      .send({ customTitle: "Nom Fablab" });

    expect(userRes.status).toBe(200);
    expect(userRes.body.ok).toBe(true);
    expect(userRes.body.project.displayTitle).toBe("Nom Fablab");

    const staffRes = await request(buildApp("staff"))
      .post("/history/project/title/5")
      .set("Accept", "application/json")
      .send({ customTitle: "Interdit" });

    expect(staffRes.status).toBe(403);
  });
});
