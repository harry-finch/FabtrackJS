const app = require("../../app");
const { getAdminAgent } = require("../helpers/authHelper");
const { cleanTestData, createTestUser, prisma } = require("../helpers/testDb");

describe("Integration: Validation Middleware Error Handling & Security", () => {
  let adminAgent;

  beforeAll(async () => {
    adminAgent = await getAdminAgent(app);
  });

  afterAll(async () => {
    await cleanTestData();
    await prisma.$disconnect();
  });

  test("1. POST /users/create: Rejects submission when required fields are missing", async () => {
    const res = await adminAgent
      .post("/users/create")
      .type("form")
      .send({
        newname: "", // Invalid empty name
        newsurname: "Dubois",
        newemail: "invalid-email-format",
      });

    // Should redirect back to /fabtrack instead of crashing or inserting
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/fabtrack");

    // Follow redirect to check error notification
    const followRes = await adminAgent.get("/fabtrack");
    expect(followRes.status).toBe(200);
    expect(followRes.text).toContain("Error:");
  });

  test("2. POST /history/credit: Rejects non-numeric amount and leaves balance intact", async () => {
    const user = await createTestUser({
      name: "SoldeValidation",
      surname: "Test",
      balance: 20.0,
      termsAccepted: true,
    });

    const res = await adminAgent
      .post("/history/credit")
      .type("form")
      .send({
        userid: String(user.id),
        money: "non_numeric_injection",
      });

    expect(res.status).toBe(302);

    // Verify user balance is unchanged in DB
    const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(Number(freshUser.balance)).toBe(20.0);
  });

  test("3. POST /api/rfid/scan: Returns HTTP 400 Bad Request JSON on invalid payload", async () => {
    const res = await adminAgent
      .post("/api/rfid/scan")
      .set("Accept", "application/json")
      .send({
        rfid: "", // Empty RFID string
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
    expect(res.body.errors).toBeInstanceOf(Array);
  });

  test("4. POST /auth: Rejects empty login attempt with redirection and flash error", async () => {
    const res = await adminAgent
      .post("/auth")
      .type("form")
      .send({
        username: "",
        password: "",
      });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/login");
  });

  test("5. POST /warning/create: Rejects missing warning type or user", async () => {
    const res = await adminAgent
      .post("/warning/create")
      .type("form")
      .send({
        userid: "",
        warningtype: "",
      });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/fabtrack");
  });
});
