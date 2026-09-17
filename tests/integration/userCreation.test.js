const app = require("../../app");
const mailService = require("../../services/mailService");
const { getAdminAgent } = require("../helpers/authHelper");
const { cleanTestData, ensureTestUsertype, prisma, TEST_EMAIL_DOMAIN } = require("../helpers/testDb");

describe("Integration: User Creation Flow (POST /users/create)", () => {
  let agent;
  let usertypeId;

  beforeAll(async () => {
    agent = await getAdminAgent(app);
    usertypeId = await ensureTestUsertype();
  });

  afterAll(async () => {
    await cleanTestData();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("1. Successfully creates new user with default unaccepted charter & generated token", async () => {
    const uniqueEmail = `integration_user_${Date.now()}${TEST_EMAIL_DOMAIN}`;

    const res = await agent
      .post("/users/create")
      .type("form")
      .send({
        newname: "TestAlice",
        newsurname: "Vandermeersch",
        newemail: uniqueEmail,
        newusertype: usertypeId,
        newbirthyear: "1998",
        newcomments: "Usager test automatique",
      });

    // Should redirect to Kiosk (/fabtrack)
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/fabtrack");

    // Verify database record
    const created = await prisma.user.findUnique({
      where: { email: uniqueEmail },
      include: { usertype: true },
    });

    expect(created).not.toBeNull();
    expect(created.name).toBe("TestAlice");
    expect(created.surname).toBe("Vandermeersch");
    expect(created.termsAccepted).toBe(false); // Must be false upon creation
    expect(created.token).toBeDefined();
    expect(created.token.length).toBeGreaterThan(10);
    expect(Number(created.balance)).toBe(0);

    // Verify mailService was called to dispatch charter email
    expect(mailService.sendAgreementEmail).toHaveBeenCalledTimes(1);
    expect(mailService.sendAgreementEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({
          email: uniqueEmail,
          name: "TestAlice",
        }),
      })
    );
  });

  test("2. Rejects creation when user email already exists (Duplicate Protection)", async () => {
    const existingEmail = `duplicate_test_${Date.now()}${TEST_EMAIL_DOMAIN}`;

    // First creation
    await agent
      .post("/users/create")
      .type("form")
      .send({
        newname: "TestOriginal",
        newsurname: "Dubois",
        newemail: existingEmail,
        newusertype: usertypeId,
      });

    // Attempt second creation with exact same email
    const duplicateRes = await agent
      .post("/users/create")
      .type("form")
      .send({
        newname: "TestImpostor",
        newsurname: "Dubois",
        newemail: existingEmail,
        newusertype: usertypeId,
      });

    expect(duplicateRes.status).toBe(302);

    // Count in DB must strictly remain 1
    const count = await prisma.user.count({ where: { email: existingEmail } });
    expect(count).toBe(1);
  });

  test("3. Resends charter agreement email via GET /users/resend/:id", async () => {
    const resendEmail = `resend_test_${Date.now()}${TEST_EMAIL_DOMAIN}`;

    // Create user
    await agent
      .post("/users/create")
      .type("form")
      .send({
        newname: "TestResend",
        newsurname: "Martin",
        newemail: resendEmail,
        newusertype: usertypeId,
      });

    const user = await prisma.user.findUnique({ where: { email: resendEmail } });
    expect(user).not.toBeNull();

    mailService.sendAgreementEmail.mockClear();

    // Call resend route
    const resendRes = await agent.get(`/users/resend/${user.id}`);
    expect(resendRes.status).toBe(302);

    // Verify mailService was called with force: true
    expect(mailService.sendAgreementEmail).toHaveBeenCalledTimes(1);
    expect(mailService.sendAgreementEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ email: resendEmail }),
        force: true,
      })
    );
  });
});

