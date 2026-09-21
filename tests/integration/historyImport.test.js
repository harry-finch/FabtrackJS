const request = require("supertest");
const app = require("../../app");
const { getAdminAgent } = require("../helpers/authHelper");
const { prisma } = require("../../utilities/db");

describe("Integration: Admin History & Teaching Sessions CSV Import", () => {
  let adminAgent;
  const testRunId = Date.now();
  const createdEmails = [
    `import-student-1-${testRunId}@example.org`,
    `import-student-2-${testRunId}@example.org`,
  ];

  beforeAll(async () => {
    adminAgent = await getAdminAgent(app);
  });

  afterAll(async () => {
    // Cleanup imported users and visits
    const users = await prisma.user.findMany({
      where: { email: { in: createdEmails } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);

    if (userIds.length > 0) {
      await prisma.history.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.userProject.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }
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
});
