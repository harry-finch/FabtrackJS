const app = require("../../app");
const { getAdminAgent } = require("../helpers/authHelper");
const { createTestUser, cleanTestData, prisma } = require("../helpers/testDb");

describe("Integration: User Financial Balance (POST /history/credit & Transactions)", () => {
  let adminAgent;

  beforeAll(async () => {
    adminAgent = await getAdminAgent(app);
  });

  afterAll(async () => {
    await cleanTestData();
    await prisma.$disconnect();
  });

  test("1. Successfully credits user balance via POST /history/credit", async () => {
    const testUser = await createTestUser({
      name: "TestFinance",
      surname: "Mercier",
      balance: 0.0,
    });

    const creditAmount = 25.5;

    const res = await adminAgent
      .post("/history/credit")
      .type("form")
      .send({
        userid: testUser.id,
        money: creditAmount,
      });

    expect(res.status).toBe(302);

    // Verify balance in database
    const refreshed = await prisma.user.findUnique({
      where: { id: testUser.id },
    });
    expect(Number(refreshed.balance)).toBeCloseTo(25.5, 2);
  });

  test("2. Accurately accumulates multiple successive credit operations", async () => {
    const testUser = await createTestUser({
      name: "TestCumul",
      surname: "Fournier",
      balance: 10.0,
    });

    // Credit 15.25 €
    await adminAgent
      .post("/history/credit")
      .type("form")
      .send({
        userid: testUser.id,
        money: 15.25,
      });

    // Credit another 4.75 €
    await adminAgent
      .post("/history/credit")
      .type("form")
      .send({
        userid: testUser.id,
        money: 4.75,
      });

    const refreshed = await prisma.user.findUnique({
      where: { id: testUser.id },
    });

    // 10.00 + 15.25 + 4.75 = 30.00
    expect(Number(refreshed.balance)).toBeCloseTo(30.0, 2);
  });

  test("3. Handles debit and negative balance state correctly", async () => {
    const testUser = await createTestUser({
      name: "TestDebiteur",
      surname: "Girard",
      balance: 15.0,
    });

    // Simulate debit (e.g. material/cut consumption)
    await prisma.user.update({
      where: { id: testUser.id },
      data: {
        balance: { decrement: 20.0 },
      },
    });

    const refreshed = await prisma.user.findUnique({
      where: { id: testUser.id },
    });

    // 15 - 20 = -5.00
    expect(Number(refreshed.balance)).toBeCloseTo(-5.0, 2);

    // Credit back 10.00 -> balance becomes +5.00
    await adminAgent
      .post("/history/credit")
      .type("form")
      .send({
        userid: testUser.id,
        money: 10.0,
      });

    const finalUser = await prisma.user.findUnique({
      where: { id: testUser.id },
    });
    expect(Number(finalUser.balance)).toBeCloseTo(5.0, 2);
  });
});
