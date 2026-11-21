const request = require("supertest");
const app = require("../../app");
const { getAdminAgent, extractCsrfTokenFromHtml } = require("../helpers/authHelper");
const { createTestUser, cleanTestData, prisma } = require("../helpers/testDb");

describe("Integration: Charter Signature & Kiosk Access Blocking", () => {
  let adminAgent;

  beforeAll(async () => {
    adminAgent = await getAdminAgent(app);
  });

  afterAll(async () => {
    await cleanTestData();
    await prisma.$disconnect();
  });

  test("1. Kiosk blocks visit registration if user has NOT signed charter", async () => {
    const userWithoutCharter = await createTestUser({
      name: "TestNonSigne",
      surname: "Bernard",
      termsAccepted: false,
    });

    const kioskRes = await adminAgent
      .post("/history/create")
      .set("X-CSRF-Token", adminAgent.csrfToken)
      .type("form")
      .send({
        userid: userWithoutCharter.id,
        comment: "Tentative d'enregistrement sans charte",
      });

    // Should redirect without crashing
    expect(kioskRes.status).toBe(302);

    // Verify in DB that no history entry was recorded for this user
    const visits = await prisma.history.findMany({
      where: { userId: userWithoutCharter.id },
    });
    expect(visits.length).toBe(0);
  });

  test("2. GET /agreement/:token is read-only and POST /agreement/:token validates charter signature", async () => {
    const userToSign = await createTestUser({
      name: "TestFuturSigne",
      surname: "Moreau",
      termsAccepted: false,
    });

    expect(userToSign.termsAccepted).toBe(false);

    // Public session agent simulating user clicking link from email
    const publicAgent = request.agent(app);

    // Step 1: GET renders confirmation page without mutating termsAccepted
    const confirmRes = await publicAgent.get(`/agreement/${userToSign.token}`);

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.text).toContain("charte");

    const afterGet = await prisma.user.findUnique({
      where: { id: userToSign.id },
    });
    expect(afterGet.termsAccepted).toBe(false);

    const csrfToken = extractCsrfTokenFromHtml(confirmRes.text);
    expect(csrfToken.length).toBeGreaterThanOrEqual(32);

    // Step 2: POST with CSRF token commits termsAccepted = true
    const signRes = await publicAgent
      .post(`/agreement/${userToSign.token}`)
      .type("form")
      .send({ _csrf: csrfToken });

    expect(signRes.status).toBe(200);
    expect(signRes.text).toContain("charte");

    // Verify DB update
    const updated = await prisma.user.findUnique({
      where: { id: userToSign.id },
    });
    expect(updated.termsAccepted).toBe(true);
  });

  test("3. Successfully registers Kiosk visit once charter has been signed", async () => {
    const userWithCharter = await createTestUser({
      name: "TestSigneValide",
      surname: "Roux",
      termsAccepted: true,
    });

    const kioskRes = await adminAgent
      .post("/history/create")
      .set("X-CSRF-Token", adminAgent.csrfToken)
      .type("form")
      .send({
        userid: userWithCharter.id,
        comments: "Arrivée valide au lab",
      });

    expect(kioskRes.status).toBe(302);

    // Verify history entry is created
    const visits = await prisma.history.findMany({
      where: { userId: userWithCharter.id },
    });
    expect(visits.length).toBe(1);
    expect(visits[0].departure).toBeNull();
    expect(visits[0].comments).toBe("Arrivée valide au lab");
  });

  test("4. Returns valid JSON autocomplete data from GET /api/list/autocomplete-lists", async () => {
    const res = await adminAgent.get("/api/list/autocomplete-lists");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body).toHaveProperty("userlist");
    expect(res.body).toHaveProperty("projectlist");
    expect(res.body).toHaveProperty("userprojectlist");
    expect(Array.isArray(res.body.userlist)).toBe(true);
    expect(Array.isArray(res.body.projectlist)).toBe(true);
    expect(Array.isArray(res.body.userprojectlist)).toBe(true);
  });
});
