const request = require("supertest");
const app = require("../../app");
const { getAdminAgent } = require("../helpers/authHelper");
const { createTestUser, cleanTestData, prisma } = require("../helpers/testDb");
const sorbonneService = require("../../services/sorbonneService");
const { ResourceType } = require("@prisma/client");

describe("Integration: Sorbonne Projects Plugin (Entity Attachment, Billing & Settlement)", () => {
  let adminAgent;
  let testUser;
  let testConsumable;
  let testProjectType;
  const uniqueEntity = `LIP6_TEST_${Date.now()}`;

  beforeAll(async () => {
    adminAgent = await getAdminAgent(app);

    // 1. Ensure Sorbonne project type exists
    testProjectType = await sorbonneService.ensureProjectType();
    expect(testProjectType).toBeDefined();

    // 2. Create test user with accepted terms and a positive balance
    testUser = await createTestUser({
      name: "SorbonneEtudiant",
      surname: "Curie",
      termsAccepted: true,
      balance: 50.0,
    });

    // 3. Create a test consumable
    testConsumable = await prisma.consumable.create({
      data: {
        name: `TEST_Plaque_Plexi_${Date.now()}`,
        cost: 12.5,
        stock: 50,
        unit: "plaque",
      },
    });
  });

  afterAll(async () => {
    // Clean up created entities
    try {
      if (testConsumable) {
        await prisma.activity.deleteMany({
          where: { resourceId: testConsumable.id },
        });
        await prisma.consumable.delete({
          where: { id: testConsumable.id },
        });
      }

      await prisma.project.deleteMany({
        where: { sorbonneEntity: uniqueEntity },
      });

      await cleanTestData();
      await prisma.$disconnect();
    } catch (err) {
      console.error("Cleanup error in sorbonneProjects.test.js:", err);
    }
  });

  test("1. Successfully records a visit with Sorbonne Entity attachment", async () => {
    const res = await adminAgent
      .post("/history/create")
      .type("form")
      .send({
        userid: testUser.id,
        projecttype: testProjectType.id,
        documentation: `https://wiki.fablab.sorbonne-universite.fr/projets/sorbonne-${Date.now()}`,
        sorbonneEntity: uniqueEntity,
        comments: "Test Projet Sorbonne Robotique",
      });

    expect(res.status).toBe(302);

    // Verify history entry has sorbonneEntity
    const historyEntry = await prisma.history.findFirst({
      where: {
        userId: testUser.id,
        departure: null,
      },
      include: {
        userproject: {
          include: { project: true },
        },
      },
    });

    expect(historyEntry).not.toBeNull();
    expect(historyEntry.sorbonneEntity).toBe(uniqueEntity);
    expect(historyEntry.userproject.project.sorbonneEntity).toBe(uniqueEntity);

    // Verify distinct entities retrieval includes the entity
    const distinctEntities = await sorbonneService.getDistinctEntities();
    expect(distinctEntities).toContain(uniqueEntity);
  });

  test("2. Consumable activity on Sorbonne visit does NOT debit user balance", async () => {
    const historyEntry = await prisma.history.findFirst({
      where: {
        userId: testUser.id,
        departure: null,
      },
    });
    expect(historyEntry).toBeDefined();

    const initialBalance = Number(testUser.balance);

    // Record consumable activity
    const res = await adminAgent
      .post("/history/activity")
      .type("form")
      .send({
        activityhistoryid: historyEntry.id,
        activityuserid: testUser.id,
        consumable: testConsumable.id,
        quantity: 2,
      });

    expect(res.status).toBe(302);

    // Check user balance remains unchanged (50.0 €)
    const refreshedUser = await prisma.user.findUnique({
      where: { id: testUser.id },
    });
    expect(Number(refreshedUser.balance)).toBeCloseTo(initialBalance, 2);

    // Check activity was created
    const activity = await prisma.activity.findFirst({
      where: {
        historyId: historyEntry.id,
        resourceId: testConsumable.id,
        resourceType: ResourceType.CONSUMABLE,
      },
    });
    expect(activity).not.toBeNull();
    expect(activity.quantity).toBe(2);
    expect(activity.settled).toBe(false);
  });

  test("3. Admin Sorbonne view lists consumptions and stats correctly", async () => {
    const res = await adminAgent.get("/admin/sorbonne?entity=" + encodeURIComponent(uniqueEntity));
    expect(res.status).toBe(200);
    expect(res.text).toContain("Projets Sorbonne & Facturation");
    expect(res.text).toContain(uniqueEntity);
    expect(res.text).toContain("25.00"); // 2 * 12.50 = 25.00 €
  });

  test("4. Toggling settled status updates settlement flags", async () => {
    const historyEntry = await prisma.history.findFirst({
      where: { userId: testUser.id },
    });
    const activity = await prisma.activity.findFirst({
      where: { historyId: historyEntry.id, resourceId: testConsumable.id },
    });
    expect(activity).not.toBeNull();

    // Toggle to SETTLED
    const toggleRes = await adminAgent.post(`/admin/sorbonne/toggle-settled/${activity.id}`);
    expect(toggleRes.status).toBe(302);

    const settledAct = await prisma.activity.findUnique({
      where: { id: activity.id },
    });
    expect(settledAct.settled).toBe(true);
    expect(settledAct.settledAt).not.toBeNull();
    expect(settledAct.settledBy).toBeDefined();

    // Toggle back to PENDING
    const untoggleRes = await adminAgent.post(`/admin/sorbonne/toggle-settled/${activity.id}`);
    expect(untoggleRes.status).toBe(302);

    const pendingAct = await prisma.activity.findUnique({
      where: { id: activity.id },
    });
    expect(pendingAct.settled).toBe(false);
    expect(pendingAct.settledAt).toBeNull();
    expect(pendingAct.settledBy).toBeNull();
  });

  test("5. Batch settle by entity settles all pending activities", async () => {
    const settleRes = await adminAgent
      .post("/admin/sorbonne/settle-entity")
      .type("form")
      .send({ entity: uniqueEntity });

    expect(settleRes.status).toBe(302);

    const historyEntry = await prisma.history.findFirst({
      where: { userId: testUser.id },
    });
    const activity = await prisma.activity.findFirst({
      where: { historyId: historyEntry.id, resourceId: testConsumable.id },
    });
    expect(activity.settled).toBe(true);
  });

  test("6. CSV export returns valid UTF-8 BOM CSV with entity and costs", async () => {
    const res = await adminAgent.get(
      "/admin/sorbonne/export-csv?entity=" + encodeURIComponent(uniqueEntity),
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("\uFEFF"); // UTF-8 BOM
    expect(res.text).toContain("Entité / UFR;Statut Règlement;");
    expect(res.text).toContain(uniqueEntity);
    expect(res.text).toContain("25,00");
  });

  test("7. GET /api/sorbonne/entities returns JSON list of entities", async () => {
    const res = await adminAgent.get("/api/sorbonne/entities");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toContain(uniqueEntity);
  });
});
