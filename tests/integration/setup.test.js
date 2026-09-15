const request = require("supertest");
const app = require("../../app");
const { cleanTestData, prisma } = require("../helpers/testDb");
const setupService = require("../../services/setupService");
const { setupSchema } = require("../../schemas/setup.schema");

describe("Integration & Service: Platform Setup (/setup & setupService)", () => {
  const testEmail = "test.setup.admin@example.com";

  afterAll(async () => {
    // Clean up created setup test entities
    await prisma.staff.deleteMany({
      where: { email: testEmail },
    });
    await prisma.workspace.deleteMany({
      where: { name: { in: ["Test Atelier Alpha", "Test Salle Beta"] } },
    });
    await cleanTestData();
    await prisma.$disconnect();
  });

  describe("1. Schema Validation (setupSchema)", () => {
    test("validates a complete and correct setup payload", () => {
      const payload = {
        adminName: "superadmin",
        adminEmail: "superadmin@fablab.org",
        adminPassword: "secretPassword123",
        confirmPassword: "secretPassword123",
        platformName: "Fablab Innovation",
        platformSubtitle: "Atelier numérique",
        defaultLanguage: "fr",
        currencySymbol: "€",
        workspaces: ["Atelier principal", "Salle 3D"],
      };

      const result = setupSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.workspaces).toEqual(["Atelier principal", "Salle 3D"]);
    });

    test("converts comma-separated string of workspaces to trimmed array", () => {
      const payload = {
        adminName: "superadmin",
        adminEmail: "superadmin@fablab.org",
        adminPassword: "secretPassword123",
        confirmPassword: "secretPassword123",
        platformName: "Fablab Innovation",
        workspaces: "Atelier principal, Salle 3D, Lab Élec",
      };

      const result = setupSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.workspaces).toEqual(["Atelier principal", "Salle 3D", "Lab Élec"]);
    });

    test("rejects when password confirmation does not match", () => {
      const payload = {
        adminName: "superadmin",
        adminEmail: "superadmin@fablab.org",
        adminPassword: "password123",
        confirmPassword: "differentPassword",
        platformName: "Fablab Innovation",
        workspaces: ["Atelier principal"],
      };

      const result = setupSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain("ne correspondent pas");
    });

    test("rejects when password is less than 6 characters", () => {
      const payload = {
        adminName: "superadmin",
        adminEmail: "superadmin@fablab.org",
        adminPassword: "123",
        confirmPassword: "123",
        platformName: "Fablab Innovation",
        workspaces: ["Atelier principal"],
      };

      const result = setupSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe("2. Setup Service Execution (setupService.runSetup)", () => {
    test("successfully creates admin, settings, and workspaces", async () => {
      const result = await setupService.runSetup(
        {
          adminName: "TestSetupAdmin",
          adminEmail: testEmail,
          adminPassword: "password123",
          platformName: "Test Fablab Platform",
          platformSubtitle: "Sous-titre test",
          defaultLanguage: "fr",
          currencySymbol: "CHF",
          workspaces: ["Test Atelier Alpha", "Test Salle Beta"],
        },
        prisma
      );

      expect(result.admin).toBeDefined();
      expect(result.admin.name).toBe("TestSetupAdmin");
      expect(result.admin.email).toBe(testEmail);
      expect(result.admin.role).toBe("admin");

      expect(result.workspaces.length).toBeGreaterThanOrEqual(2);
      const wsNames = result.workspaces.map((w) => w.name);
      expect(wsNames).toContain("Test Atelier Alpha");
      expect(wsNames).toContain("Test Salle Beta");

      // Verify installed flag is set
      const installedSetting = await prisma.systemSetting.findUnique({
        where: { key: "platform_installed" },
      });
      expect(installedSetting?.value).toBe("true");

      const isInstalled = await setupService.checkIsInstalled(prisma);
      expect(isInstalled).toBe(true);
    });
  });

  describe("3. HTTP Route Protection & Execution (/setup)", () => {
    test("rejects POST /setup when validation fails", async () => {
      // Temporarily mock checkIsInstalled to simulate uninstalled state
      const checkSpy = jest.spyOn(setupService, "checkIsInstalled").mockResolvedValue(false);

      const agent = request.agent(app);
      const res = await agent
        .post("/setup")
        .set("Accept", "application/json")
        .send({
          adminName: "x", // too short
          adminEmail: "invalid-email",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);

      checkSpy.mockRestore();
    });

    test("blocks installation attempts once platform is already installed", async () => {
      // Platform is installed from step 2
      const agent = request.agent(app);
      const res = await agent
        .post("/setup")
        .set("Accept", "application/json")
        .send({
          adminName: "AnotherAdmin",
          adminEmail: "another@example.com",
          adminPassword: "password123",
          confirmPassword: "password123",
          platformName: "Another Lab",
          workspaces: ["New Workshop"],
        });

      // Returns 403 Forbidden because platform is already initialized
      expect(res.status).toBe(403);
      expect(res.body.message).toContain("déjà installée");
    });

    test("redirects GET /setup to /login when already installed", async () => {
      const agent = request.agent(app);
      const res = await agent.get("/setup");
      expect(res.status).toBe(302);
      expect(res.header.location).toBe("/login");
    });
  });
});
