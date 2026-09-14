const hookManager = require("../../core/HookManager");
const rfidPlugin = require("../../plugins/rfidPlugin");
const { createTestUser, cleanTestData, prisma } = require("../helpers/testDb");

const scanRfid = async (eventOrPayload, maybePayload) => {
  const payload = maybePayload !== undefined ? maybePayload : eventOrPayload;
  const results = await hookManager.triggerAsyncHook("rfid:scan", payload);
  return results[0];
};

describe("RFID Plugin Unit & Hook Tests (rfid:scan)", () => {
  beforeAll(() => {
    // Register the RFID hook
    rfidPlugin.register(hookManager);
  });

  afterAll(async () => {
    await cleanTestData();
    await prisma.$disconnect();
  });

  test("1. Should return INVALID_RFID if rfid code is missing or empty", async () => {
    const res1 = await scanRfid({ rfid: "" });
    expect(res1).toEqual(
      expect.objectContaining({
        success: false,
        code: "INVALID_RFID",
      })
    );

    const res2 = await scanRfid("rfid:scan", { rfid: "   " });
    expect(res2).toEqual(
      expect.objectContaining({
        success: false,
        code: "INVALID_RFID",
      })
    );
  });

  test("2. Should return USER_NOT_FOUND if badge is unknown", async () => {
    const unknownRfid = "UNKNOWN_RFID_999999";
    const res = await scanRfid("rfid:scan", { rfid: unknownRfid });

    expect(res).toEqual(
      expect.objectContaining({
        success: false,
        code: "USER_NOT_FOUND",
        rfid: unknownRfid,
      })
    );
  });

  test("3. Should refuse check-in with TERMS_NOT_ACCEPTED if charter is not signed", async () => {
    const rfidCode = "RFID_UNACCEPTED_101";
    const user = await createTestUser({
      rfid: rfidCode,
      termsAccepted: false,
      name: "TestNonSignataire",
      surname: "Dupont",
    });

    const res = await scanRfid("rfid:scan", { rfid: rfidCode });

    expect(res.success).toBe(false);
    expect(res.code).toBe("TERMS_NOT_ACCEPTED");
    expect(res.user.id).toBe(user.id);
    expect(res.message).toContain("charte d'utilisation");

    // Verify no history visit was created
    const visit = await prisma.history.findFirst({ where: { userId: user.id } });
    expect(visit).toBeNull();
  });

  test("4. Should successfully CHECK-IN user when charter is accepted", async () => {
    const rfidCode = "RFID_ACCEPTED_202";
    const user = await createTestUser({
      rfid: rfidCode,
      termsAccepted: true,
      name: "TestSignataire",
      surname: "Martin",
    });

    const res = await scanRfid("rfid:scan", { rfid: rfidCode });

    expect(res.success).toBe(true);
    expect(res.action).toBe("checkin");
    expect(res.visitId).toBeDefined();

    // Verify active visit exists in DB
    const activeVisit = await prisma.history.findUnique({ where: { id: res.visitId } });
    expect(activeVisit).not.toBeNull();
    expect(activeVisit.userId).toBe(user.id);
    expect(activeVisit.departure).toBeNull();
  });

  test("5. Should successfully CHECK-OUT on subsequent scan when already in lab", async () => {
    const rfidCode = "RFID_CHECKOUT_303";
    const user = await createTestUser({
      rfid: rfidCode,
      termsAccepted: true,
      name: "TestDepart",
      surname: "Lefebvre",
    });

    // Create an existing visit 45 minutes ago
    const arrivalTime = new Date(Date.now() - 45 * 60 * 1000);
    const existingVisit = await prisma.history.create({
      data: {
        userId: user.id,
        arrival: arrivalTime,
        departure: null,
      },
    });

    const res = await scanRfid("rfid:scan", { rfid: rfidCode });

    expect(res.success).toBe(true);
    expect(res.action).toBe("checkout");
    expect(res.durationMinutes).toBeGreaterThanOrEqual(44);
    expect(res.durationMinutes).toBeLessThanOrEqual(46);

    // Verify visit is closed in DB
    const closedVisit = await prisma.history.findUnique({ where: { id: existingVisit.id } });
    expect(closedVisit.departure).not.toBeNull();
  });
});
