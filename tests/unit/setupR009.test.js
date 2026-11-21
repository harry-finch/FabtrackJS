const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const express = require("express");
const request = require("supertest");

const mockPrisma = {
  staff: {
    count: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  systemSetting: {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    upsert: jest.fn(),
  },
  workspace: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  usertype: {
    count: jest.fn(),
    create: jest.fn(),
  },
  projecttype: {
    count: jest.fn(),
    create: jest.fn(),
  },
  warningtype: {
    count: jest.fn(),
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

jest.mock("../../utilities/db", () => ({
  prisma: mockPrisma,
}));

jest.mock("bcryptjs", () => ({
  hash: jest.fn().mockResolvedValue("$2a$10$mockedBcryptHash"),
  compare: jest.fn().mockResolvedValue(true),
}));

const { setupSchema, parseWorkspacesInput } = require("../../schemas/setup.schema");
const setupService = require("../../services/setupService");
const setupRouter = require("../../routes/setup");

const validBasePayload = {
  adminName: "admin",
  adminEmail: "admin@fablab.fr",
  adminPassword: "password123",
  confirmPassword: "password123",
  platformName: "Fablab Test",
  platformSubtitle: "Suivi d'activité",
  defaultLanguage: "fr",
  currencySymbol: "€",
};

function createTxMock(overrides = {}) {
  let wsSeq = 10;
  const tx = {
    staff: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }) => ({
        id: 1,
        ...data,
      })),
      update: jest.fn().mockImplementation(async ({ where, data }) => ({
        id: where.id,
        name: "admin",
        email: "admin@fablab.fr",
        role: "admin",
        ...data,
      })),
    },
    systemSetting: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }) => data),
      upsert: jest.fn().mockImplementation(async ({ create }) => create),
    },
    workspace: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }) => ({
        id: wsSeq++,
        name: data.name,
      })),
    },
    usertype: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
    },
    projecttype: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
    },
    warningtype: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
  return tx;
}

function createCustomPrisma(tx) {
  return {
    ...tx,
    $transaction: jest.fn(async (fn) => fn(tx)),
  };
}

function createSetupTestApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const sessionState = {
    current: { staleSessionFlag: "before_regenerate" },
    regenerateCalls: 0,
  };

  app.use((req, res, next) => {
    const attachSessionHelpers = (sess) => {
      sess.regenerate = (cb) => {
        sessionState.regenerateCalls += 1;
        const freshSession = {};
        attachSessionHelpers(freshSession);
        sessionState.current = freshSession;
        req.session = freshSession;
        if (typeof cb === "function") cb(null);
      };
    };
    attachSessionHelpers(sessionState.current);
    req.session = sessionState.current;
    next();
  });

  app.use("/setup", setupRouter);

  app.get("/__test/session", (req, res) => {
    res.json({
      regenerateCalls: sessionState.regenerateCalls,
      session: {
        loggedin: req.session.loggedin,
        role: req.session.role,
        username: req.session.username,
        staffId: req.session.staffId,
        lastWorkspaceId: req.session.lastWorkspaceId,
        staleSessionFlag: req.session.staleSessionFlag,
      },
    });
  });

  app.use((err, req, res, _next) => {
    res.status(err.status || 500).json({
      success: false,
      code: err.code || "INTERNAL_ERROR",
      message: err.message,
    });
  });

  return { app, sessionState };
}

describe("R-009 Setup & First-Install Security", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Groupe 1 — setupSchema & parseWorkspacesInput", () => {
    test("parse un tableau JSON sérialisé sans crochets ni guillemets", () => {
      const raw = '["Atelier principal","Salle Laser"]';
      expect(parseWorkspacesInput(raw)).toEqual(["Atelier principal", "Salle Laser"]);

      const parsed = setupSchema.safeParse({
        ...validBasePayload,
        workspaces: raw,
      });
      expect(parsed.success).toBe(true);
      expect(parsed.data.workspaces).toEqual(["Atelier principal", "Salle Laser"]);
    });

    test("parse une chaîne multi-séparateurs et déduplique les espaces", () => {
      const raw = "Atelier 1, Atelier 2; Atelier 3\nAtelier 1";
      expect(parseWorkspacesInput(raw)).toEqual(["Atelier 1", "Atelier 2", "Atelier 3"]);

      const parsed = setupSchema.safeParse({
        ...validBasePayload,
        workspaces: raw,
      });
      expect(parsed.success).toBe(true);
      expect(parsed.data.workspaces).toEqual(["Atelier 1", "Atelier 2", "Atelier 3"]);
    });

    test("parse et nettoie un tableau JS en supprimant les entrées vides", () => {
      const raw = ["  A ", "B", ""];
      expect(parseWorkspacesInput(raw)).toEqual(["A", "B"]);

      const parsed = setupSchema.safeParse({
        ...validBasePayload,
        workspaces: raw,
      });
      expect(parsed.success).toBe(true);
      expect(parsed.data.workspaces).toEqual(["A", "B"]);
    });

    test('rejette "[]" et "" (au moins un espace requis)', () => {
      expect(parseWorkspacesInput("[]")).toEqual([]);
      expect(parseWorkspacesInput("")).toEqual([]);

      const emptyJsonRes = setupSchema.safeParse({
        ...validBasePayload,
        workspaces: "[]",
      });
      expect(emptyJsonRes.success).toBe(false);

      const emptyStrRes = setupSchema.safeParse({
        ...validBasePayload,
        workspaces: "",
      });
      expect(emptyStrRes.success).toBe(false);
    });
  });

  describe("Groupe 2 — setupService.checkIsInstalled & runSetup", () => {
    test("checkIsInstalled retourne true (Fail-Closed) lorsque staff.count rejette", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const dbErrorPrisma = {
        staff: {
          count: jest.fn().mockRejectedValue(new Error("ECONNREFUSED MariaDB")),
        },
        systemSetting: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };

      const installed = await setupService.checkIsInstalled(dbErrorPrisma);
      expect(installed).toBe(true);
      consoleSpy.mockRestore();
    });

    test("checkIsInstalled retourne false sur une base vierge (staff.count === 0)", async () => {
      const virginPrisma = {
        staff: {
          count: jest.fn().mockResolvedValue(0),
        },
        systemSetting: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };

      const installed = await setupService.checkIsInstalled(virginPrisma);
      expect(installed).toBe(false);
    });

    test("runSetup sur base vierge parse le JSON workspaces, crée l'admin et active platform_installed", async () => {
      const tx = createTxMock();
      const customPrisma = createCustomPrisma(tx);

      const result = await setupService.runSetup(
        {
          ...validBasePayload,
          workspaces: '["Atelier principal","Salle Laser"]',
        },
        customPrisma
      );

      expect(tx.workspace.create).toHaveBeenCalledTimes(2);
      expect(tx.workspace.create).toHaveBeenNthCalledWith(1, {
        data: { name: "Atelier principal" },
      });
      expect(tx.workspace.create).toHaveBeenNthCalledWith(2, {
        data: { name: "Salle Laser" },
      });
      expect(result.workspaces.map((w) => w.name)).toEqual([
        "Atelier principal",
        "Salle Laser",
      ]);

      expect(tx.staff.create).toHaveBeenCalledTimes(1);
      expect(tx.staff.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: "admin",
          email: "admin@fablab.fr",
          role: "admin",
          approved: true,
        }),
      });

      // Aucune mise à jour d'un compte admin existant avant création :
      // l'unique tx.staff.update attendu sert à renseigner lastWorkspaceId.
      expect(tx.staff.update).toHaveBeenCalledTimes(1);
      expect(tx.staff.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { lastWorkspaceId: 10 },
      });

      expect(tx.systemSetting.upsert).toHaveBeenCalledWith({
        where: { key: "platform_installed" },
        update: { value: "true" },
        create: { key: "platform_installed", value: "true" },
      });
    });

    test("runSetup rejette avec ALREADY_INSTALLED (403) si platform_installed === 'true' dans la transaction", async () => {
      const tx = createTxMock();
      tx.systemSetting.findUnique.mockResolvedValue({
        key: "platform_installed",
        value: "true",
      });
      const customPrisma = createCustomPrisma(tx);

      await expect(
        setupService.runSetup(
          {
            ...validBasePayload,
            workspaces: '["Atelier principal"]',
          },
          customPrisma
        )
      ).rejects.toMatchObject({
        code: "ALREADY_INSTALLED",
        status: 403,
      });

      expect(tx.staff.create).not.toHaveBeenCalled();
      expect(tx.staff.update).not.toHaveBeenCalled();
    });

    test("runSetup rejette avec ALREADY_INSTALLED (403) si existingAdminCount > 0 dans la transaction", async () => {
      const tx = createTxMock();
      tx.staff.count.mockResolvedValue(1);
      const customPrisma = createCustomPrisma(tx);

      await expect(
        setupService.runSetup(
          {
            ...validBasePayload,
            workspaces: '["Atelier principal"]',
          },
          customPrisma
        )
      ).rejects.toMatchObject({
        code: "ALREADY_INSTALLED",
        status: 403,
      });

      expect(tx.staff.create).not.toHaveBeenCalled();
      expect(tx.staff.update).not.toHaveBeenCalled();
    });
  });

  describe("Groupe 3 — routes/setup.js (Supertest)", () => {
    test("POST /setup sur base vierge régénère la session et positionne username, staffId et lastWorkspaceId", async () => {
      jest.spyOn(setupService, "checkIsInstalled").mockResolvedValue(false);
      jest.spyOn(setupService, "runSetup").mockResolvedValue({
        admin: {
          id: 1,
          name: "admin",
          email: "admin@fablab.fr",
          role: "admin",
          lastWorkspaceId: 10,
        },
        workspaces: [{ id: 10, name: "Atelier principal" }],
        settings: {
          platformName: "Fablab Test",
        },
      });

      const { app } = createSetupTestApp();

      const res = await request(app)
        .post("/setup")
        .set("Accept", "application/json")
        .send({
          ...validBasePayload,
          workspaces: '["Atelier principal"]',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const sessionRes = await request(app).get("/__test/session");
      expect(sessionRes.status).toBe(200);
      expect(sessionRes.body.regenerateCalls).toBe(1);
      expect(sessionRes.body.session).toEqual({
        loggedin: true,
        role: "admin",
        username: "admin",
        staffId: 1,
        lastWorkspaceId: 10,
      });
    });

    test("POST /setup quand checkIsInstalled retourne true renvoie 403 en JSON et 302 /login en HTML", async () => {
      jest.spyOn(setupService, "checkIsInstalled").mockResolvedValue(true);
      const runSetupSpy = jest.spyOn(setupService, "runSetup");

      const { app } = createSetupTestApp();

      const jsonRes = await request(app)
        .post("/setup")
        .set("Accept", "application/json")
        .send({
          ...validBasePayload,
          workspaces: '["Atelier principal"]',
        });

      expect(jsonRes.status).toBe(403);
      expect(jsonRes.body.success).toBe(false);

      const htmlRes = await request(app)
        .post("/setup")
        .type("form")
        .send({
          ...validBasePayload,
          workspaces: '["Atelier principal"]',
        });

      expect(htmlRes.status).toBe(302);
      expect(htmlRes.headers.location).toMatch(/\/login$/);
      expect(runSetupSpy).not.toHaveBeenCalled();
    });

    test("POST /setup sur race ALREADY_INSTALLED levée par runSetup renvoie 403 en JSON et 302 /login en HTML", async () => {
      jest.spyOn(setupService, "checkIsInstalled").mockResolvedValue(false);
      const alreadyInstalledErr = Object.assign(
        new Error("La plateforme est déjà installée."),
        { code: "ALREADY_INSTALLED", status: 403 }
      );
      jest.spyOn(setupService, "runSetup").mockRejectedValue(alreadyInstalledErr);

      const { app } = createSetupTestApp();

      const jsonRes = await request(app)
        .post("/setup")
        .set("Accept", "application/json")
        .send({
          ...validBasePayload,
          workspaces: '["Atelier principal"]',
        });

      expect(jsonRes.status).toBe(403);
      expect(jsonRes.body.success).toBe(false);

      const htmlRes = await request(app)
        .post("/setup")
        .type("form")
        .send({
          ...validBasePayload,
          workspaces: '["Atelier principal"]',
        });

      expect(htmlRes.status).toBe(302);
      expect(htmlRes.headers.location).toMatch(/\/login$/);
    });
  });

  describe("Groupe 4 — views/setup/index.ejs (sous-chemin + anti-XSS DOM)", () => {
    const templatePath = path.join(__dirname, "../../views/setup/index.ejs");

    test("compile et rend le template avec baseUrl='/fabtrack/' sans innerHTML ni interpolation XSS", () => {
      const source = fs.readFileSync(templatePath, "utf8");
      const compiled = ejs.compile(source, { filename: templatePath });

      const html = compiled({
        baseUrl: "/fabtrack/",
        title: "Installation de FabtrackJS",
        notification: null,
        error: null,
      });

      expect(html).toContain('action="/fabtrack/setup"');
      expect(html).not.toContain('action="/setup"');
      expect(html).not.toMatch(/innerHTML\s*=/);
      expect(html).not.toContain("${name}");
      expect(html).not.toContain("${w}");
      expect(html).toContain("textContent");
      expect(html).toContain("createTextNode");
      expect(html).toContain('addEventListener("click"');
    });

    test("rend action='/setup' par défaut lorsque baseUrl n'est pas défini", () => {
      const source = fs.readFileSync(templatePath, "utf8");
      const compiled = ejs.compile(source, { filename: templatePath });

      const html = compiled({
        title: "Installation de FabtrackJS",
        notification: null,
        error: null,
      });

      expect(html).toContain('action="/setup"');
    });
  });
});
