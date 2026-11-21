const request = require("supertest");
const app = require("../../app");
const { getAdminAgent } = require("../helpers/authHelper");
const { cleanTestData, ensureTestUsertype, prisma, TEST_EMAIL_DOMAIN } = require("../helpers/testDb");
const historyImportService = require("../../services/historyImportService");

describe("Integration: Admin History & Teaching Sessions CSV Import", () => {
  let adminAgent;
  const testRunId = Date.now();
  const createdEmails = [
    `import-student-1-${testRunId}${TEST_EMAIL_DOMAIN}`,
    `import-student-2-${testRunId}${TEST_EMAIL_DOMAIN}`,
  ];
  const analyzeTestEmail = `existing-${testRunId}${TEST_EMAIL_DOMAIN}`;
  const analyzeHomonymEmail = `other-${testRunId}${TEST_EMAIL_DOMAIN}`;
  const analyzeNewEmail = `brandnew-${testRunId}${TEST_EMAIL_DOMAIN}`;

  beforeAll(async () => {
    adminAgent = await getAdminAgent(app);
  });

  afterAll(async () => {
    // Cleanup imported users, visits, userProjects, and orphaned projects
    const allTestEmails = [
      ...createdEmails,
      analyzeTestEmail,
      analyzeHomonymEmail,
      analyzeNewEmail,
    ];
    const users = await prisma.user.findMany({
      where: { email: { in: allTestEmails } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);

    if (userIds.length > 0) {
      const userProjects = await prisma.userProject.findMany({
        where: { userId: { in: userIds } },
        select: { projectId: true },
      });
      const projectIds = [...new Set(userProjects.map((up) => up.projectId))];

      await prisma.history.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.userProject.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });

      if (projectIds.length > 0) {
        await prisma.project.deleteMany({
          where: {
            id: { in: projectIds },
            users: { none: {} },
          },
        });
      }
    }

    await cleanTestData();
  });

  test("1. Unauthenticated request to /admin/history/import is redirected to /login", async () => {
    const res = await request(app).get("/admin/history/import");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/login");
  });

  test("2. Admin GET /admin/history/import renders import page", async () => {
    const res = await adminAgent.get("/admin/history/import");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Import de Séances & Enseignements");
    expect(res.text).toContain("csvUploadForm");
    expect(res.text).toContain("dropzoneBox");
  });

  test("3. Admin GET /admin/history/template downloads CSV template", async () => {
    const res = await adminAgent.get("/admin/history/template");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("modele_import_seance_fablab.csv");
    expect(res.text).toContain("nom,prenom,email,date,arrivee,depart");
  });

  test("4. POST /admin/history/preview returns analysis of uploaded CSV", async () => {
    const csvContent = [
      "nom,prenom,email,date,arrivee,depart,type_projet,projet",
      `Turing,Alan,${createdEmails[0]},2026-09-21,14:00,17:00,Academic,Informatique Fondamentale`,
      `Lovelace,Ada,${createdEmails[1]},2026-09-21,14:00,17:00,Academic,Informatique Fondamentale`,
    ].join("\n");

    const res = await adminAgent
      .post("/admin/history/preview")
      .attach("csv_file", Buffer.from(csvContent, "utf-8"), "seance_test.csv")
      .field("default_date", "2026-09-21")
      .field("default_arrival", "14:00")
      .field("default_departure", "17:00")
      .field("default_project_type", "Academic");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalRows).toBe(2);
    expect(res.body.data.readyCount).toBe(2);
    expect(res.body.data.newUsersCount).toBe(2);
    expect(res.body.data.items[0].surname).toBe("Turing");
    expect(res.body.data.items[1].surname).toBe("Lovelace");
  });

  test("5. POST /admin/history/execute imports valid items into MariaDB", async () => {
    const items = [
      {
        rowNum: 2,
        name: "Alan",
        surname: "Turing",
        email: createdEmails[0],
        date: "2026-09-21",
        arrival: "2026-09-21 14:00:00",
        departure: "2026-09-21 17:00:00",
        projectTypeName: "Academic",
        projectName: "Informatique Fondamentale",
        isValid: true,
      },
      {
        rowNum: 3,
        name: "Ada",
        surname: "Lovelace",
        email: createdEmails[1],
        date: "2026-09-21",
        arrival: "2026-09-21 14:00:00",
        departure: "2026-09-21 17:00:00",
        projectTypeName: "Academic",
        projectName: "Informatique Fondamentale",
        isValid: true,
      },
    ];

    const res = await adminAgent
      .post("/admin/history/execute")
      .send({ items, options: { acceptTerms: true } });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.createdHistoriesCount).toBe(2);
    expect(res.body.createdUsersCount).toBe(2);

    // Verify in database
    const user1 = await prisma.user.findUnique({ where: { email: createdEmails[0] } });
    expect(user1).toBeDefined();
    expect(user1.name).toBe("Alan");
    expect(user1.surname).toBe("Turing");
    expect(user1.termsAccepted).toBe(true);

    const user2 = await prisma.user.findUnique({ where: { email: createdEmails[1] } });
    expect(user2).toBeDefined();
    expect(user2.name).toBe("Ada");

    const histories = await prisma.history.findMany({
      where: { userId: { in: [user1.id, user2.id] } },
    });
    expect(histories.length).toBe(2);
  });

  describe("analyzeImport() and Reconciliation logic", () => {
    const testEmail = analyzeTestEmail;
    const homonymEmail = analyzeHomonymEmail;
    const homonymSurname = `Valjean_${testRunId}`;
    let existingUser;

    beforeAll(async () => {
      const usertypeId = await ensureTestUsertype();

      existingUser = await prisma.user.create({
        data: {
          name: "Jean",
          surname: homonymSurname,
          email: testEmail,
          usertypeId,
          token: `token-${testRunId}`,
          termsAccepted: true,
        },
      });
    });

    test("identifies existing user by exact email match", async () => {
      const csv = `nom,prenom,email,date,arrivee,depart\n${homonymSurname},Jean,${testEmail},2026-09-21,14:00,17:00`;
      const result = await historyImportService.analyzeImport(csv);

      expect(result.totalRows).toBe(1);
      expect(result.existingUsersCount).toBe(1);
      expect(result.newUsersCount).toBe(0);
      expect(result.items[0].userStatus).toBe("EXISTING_USER");
      expect(result.items[0].matchedUserId).toBe(existingUser.id);
      expect(result.items[0].isValid).toBe(true);
    });

    test("triggers WARNING_HOMONYM when name/surname match but email is different", async () => {
      const csv = `nom,prenom,email,date,arrivee,depart\n${homonymSurname},Jean,${homonymEmail},2026-09-21,14:00,17:00`;
      const result = await historyImportService.analyzeImport(csv);

      expect(result.totalRows).toBe(1);
      expect(result.homonymWarningCount).toBe(1);
      expect(result.newUsersCount).toBe(1);
      expect(result.items[0].userStatus).toBe("HOMONYM_WARNING");
      expect(result.items[0].homonymEmail).toBe(testEmail);
      expect(result.items[0].warnings.length).toBeGreaterThan(0);
      expect(result.items[0].isValid).toBe(true);
    });

    test("identifies brand new user when neither email nor name matches", async () => {
      const csv = `nom,prenom,email,date,arrivee,depart\nCosette_${testRunId},Fauchelevent,${analyzeNewEmail},2026-09-21,14:00,17:00`;
      const result = await historyImportService.analyzeImport(csv);

      expect(result.newUsersCount).toBe(1);
      expect(result.items[0].userStatus).toBe("NEW_USER");
      expect(result.items[0].matchedUserId).toBeNull();
      expect(result.items[0].isValid).toBe(true);
    });

    test("flags invalid rows with invalid email or missing name", async () => {
      const csv = `nom,prenom,email\n,Jean,bad-email\nDupont,,dupont${TEST_EMAIL_DOMAIN}`;
      const result = await historyImportService.analyzeImport(csv);

      expect(result.errorCount).toBe(2);
      expect(result.items[0].isValid).toBe(false);
      expect(result.items[0].errors).toContain("Nom manquant");
      expect(result.items[0].errors).toContain("Format d'e-mail invalide");
      expect(result.items[1].isValid).toBe(false);
      expect(result.items[1].errors).toContain("Prénom manquant");
    });
  });
});
