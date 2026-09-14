const request = require("supertest");
const app = require("../../app");
const { getAdminAgent } = require("../helpers/authHelper");
const { createTestUser, createTestEquipment, cleanTestData, prisma } = require("../helpers/testDb");

describe("Integration: Equipment Borrow & Return Lifecycle", () => {
  let adminAgent;
  let defaultWorkspace;

  beforeAll(async () => {
    adminAgent = await getAdminAgent(app);
    defaultWorkspace = await prisma.workspace.findFirst();
  });

  afterAll(async () => {
    await cleanTestData();
    await prisma.$disconnect();
  });

  test("1. Creates an equipment borrow with custom duration and calculates expected return date", async () => {
    const user = await createTestUser({
      name: "TestEmprunteur",
      surname: "Durand",
      termsAccepted: true,
    });
    const equipment = await createTestEquipment("TEST_Scie Sauteuse");

    // Visit in the lab
    const visit = await prisma.history.create({
      data: {
        userId: user.id,
        arrival: new Date(),
        departure: null,
        workspaceId: defaultWorkspace ? defaultWorkspace.id : null,
      },
    });

    // Borrow equipment for 14 days
    const borrowRes = await adminAgent
      .post("/history/activity")
      .type("form")
      .send({
        activityhistoryid: visit.id,
        activityuserid: user.id,
        equipmentId: equipment.id,
        borrowDurationDays: "14",
      });

    expect(borrowRes.status).toBe(302);

    // Verify activity in DB
    const activity = await prisma.activity.findFirst({
      where: {
        userId: user.id,
        resourceId: equipment.id,
        resourceType: "EQUIPMENT",
      },
    });

    expect(activity).not.toBeNull();
    expect(activity.borrowDurationDays).toBe(14);
    expect(activity.returnedAt).toBeNull();
    expect(activity.expectedReturnAt).not.toBeNull();

    // Verify expectedReturnAt is approximately now + 14 days
    const expectedTime = Date.now() + 14 * 24 * 60 * 60 * 1000;
    const diffHours = Math.abs(new Date(activity.expectedReturnAt).getTime() - expectedTime) / (1000 * 60 * 60);
    expect(diffHours).toBeLessThan(1); // within 1 hour accuracy
  });

  test("2. Displays active loan icon/badge on the Kiosk for visitors currently in the lab", async () => {
    const user = await createTestUser({
      name: "TestKioskBadge",
      surname: "Lemoine",
      termsAccepted: true,
    });
    const equipment = await createTestEquipment("TEST_Multimètre Pro");

    // Create active visit
    await prisma.history.create({
      data: {
        userId: user.id,
        arrival: new Date(),
        departure: null,
        workspaceId: defaultWorkspace ? defaultWorkspace.id : null,
      },
    });

    // Create active loan
    await prisma.activity.create({
      data: {
        userId: user.id,
        resourceId: equipment.id,
        resourceType: "EQUIPMENT",
        borrowDurationDays: 7,
        expectedReturnAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        returnedAt: null,
      },
    });

    // Fetch kiosk page
    const kioskRes = await adminAgent.get("/fabtrack");
    expect(kioskRes.status).toBe(200);
    expect(kioskRes.text).toContain("TestKioskBadge");
    expect(kioskRes.text).toContain("emprunt(s)");
    expect(kioskRes.text).toContain(equipment.name);
  });

  test("3. Displays overdue warning badge when expected return date has passed", async () => {
    const user = await createTestUser({
      name: "TestRetardataire",
      surname: "Garnier",
      termsAccepted: true,
    });
    const equipment = await createTestEquipment("TEST_Poste Soudure");

    // Active visit
    await prisma.history.create({
      data: {
        userId: user.id,
        arrival: new Date(),
        departure: null,
        workspaceId: defaultWorkspace ? defaultWorkspace.id : null,
      },
    });

    // Loan expired 3 days ago
    const pastDueDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await prisma.activity.create({
      data: {
        userId: user.id,
        resourceId: equipment.id,
        resourceType: "EQUIPMENT",
        borrowDurationDays: 7,
        expectedReturnAt: pastDueDate,
        returnedAt: null,
      },
    });

    const kioskRes = await adminAgent.get("/fabtrack");
    expect(kioskRes.status).toBe(200);
    expect(kioskRes.text).toContain("Emprunt EN RETARD");
  });

  test("4. Lists active loan on user profile and allows returning it via POST /history/equipment/return/:id", async () => {
    const user = await createTestUser({
      name: "TestRestitution",
      surname: "Vidal",
      termsAccepted: true,
    });
    const equipment = await createTestEquipment("TEST_Casque VR");

    const loanActivity = await prisma.activity.create({
      data: {
        userId: user.id,
        resourceId: equipment.id,
        resourceType: "EQUIPMENT",
        borrowDurationDays: 7,
        expectedReturnAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        returnedAt: null,
      },
    });

    // Check user profile has the active loan
    const profileRes = await adminAgent.get(`/users/edit/${user.id}`);
    expect(profileRes.status).toBe(200);
    expect(profileRes.text).toContain(equipment.name);
    expect(profileRes.text).toContain("Restituer");

    // Perform return action
    const returnRes = await adminAgent
      .post(`/history/equipment/return/${loanActivity.id}`)
      .type("form")
      .send({ returnNotes: "Rendu en parfait état" });

    expect(returnRes.status).toBe(302);

    // Verify DB update
    const updatedActivity = await prisma.activity.findUnique({
      where: { id: loanActivity.id },
    });
    expect(updatedActivity.returnedAt).not.toBeNull();
    expect(updatedActivity.returnNotes).toBe("Rendu en parfait état");

    // Check user profile now shows it in return history
    const profileAfterRes = await adminAgent.get(`/users/edit/${user.id}`);
    expect(profileAfterRes.text).toContain("Historique des emprunts restitués");
  });

  test("5. Displays active loans in the admin equipment supervision table", async () => {
    const user = await createTestUser({
      name: "TestAdminSupervision",
      surname: "Faure",
      termsAccepted: true,
    });
    const equipment = await createTestEquipment("TEST_Oscilloscope");

    await prisma.activity.create({
      data: {
        userId: user.id,
        resourceId: equipment.id,
        resourceType: "EQUIPMENT",
        borrowDurationDays: 5,
        expectedReturnAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        returnedAt: null,
      },
    });

    const adminRes = await adminAgent.get("/admin/equipment/manage");
    expect(adminRes.status).toBe(200);
    expect(adminRes.text).toContain("Objets actuellement en cours d'emprunt");
    expect(adminRes.text).toContain(equipment.name);
    expect(adminRes.text).toContain("TestAdminSupervision Faure");
    expect(adminRes.text).toContain("En prêt");
  });
});
