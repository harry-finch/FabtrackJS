const { prisma } = require("../../utilities/db");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const mailService = require("../../services/mailService");

// Disable actual email sending during tests
mailService.sendAgreementEmail = jest.fn().mockResolvedValue({ success: true, mocked: true });
mailService.sendWarningAlert = jest.fn().mockResolvedValue({ success: true, mocked: true });
mailService.sendLowStockAlert = jest.fn().mockResolvedValue({ success: true, mocked: true });
mailService.sendBugReportAlert = jest.fn().mockResolvedValue({ success: true, mocked: true });

const TEST_EMAIL_DOMAIN = "@test-fabtrack.local";
const TEST_EQUIPMENT_PREFIX = "FTKTEST-";
const TEST_ADMIN_USERNAME = "TEST_ADMIN_USER";
const TEST_ADMIN_PASSWORD = "testpassword123";

/**
 * Ensures an active admin staff account exists for test authentication.
 */
async function ensureTestStaff() {
  const hashedPassword = await bcrypt.hash(TEST_ADMIN_PASSWORD, 10);
  return await prisma.staff.upsert({
    where: { name: TEST_ADMIN_USERNAME },
    update: {
      password: hashedPassword,
      approved: true,
      role: "admin",
    },
    create: {
      name: TEST_ADMIN_USERNAME,
      email: `admin${TEST_EMAIL_DOMAIN}`,
      password: hashedPassword,
      approved: true,
      role: "admin",
    },
  });
}

/**
 * Returns a valid usertype ID for user creation tests.
 */
async function ensureTestUsertype() {
  const existing = await prisma.usertype.findFirst();
  if (existing) return existing.id;

  const created = await prisma.usertype.create({
    data: { name: "TEST_ETUDIANT" },
  });
  return created.id;
}

/**
 * Creates an isolated test user with unique email and token.
 */
async function createTestUser(overrides = {}) {
  const usertypeId = overrides.usertypeId || (await ensureTestUsertype());
  const randomSuffix = crypto.randomBytes(4).toString("hex");

  const userData = {
    name: overrides.name || "TestPrenom",
    surname: overrides.surname || "TestNom",
    email: overrides.email || `user_${randomSuffix}${TEST_EMAIL_DOMAIN}`,
    usertypeId,
    token: overrides.token || `test_token_${randomSuffix}`,
    termsAccepted: overrides.termsAccepted !== undefined ? overrides.termsAccepted : false,
    balance: overrides.balance !== undefined ? overrides.balance : 0.0,
    rfid: overrides.rfid || null,
  };

  return await prisma.user.create({
    data: userData,
    include: { usertype: true },
  });
}

/**
 * Cleans up all test entities from the database.
 */
async function cleanTestData() {
  try {
    // 1. Find all test users
    const testUsers = await prisma.user.findMany({
      where: { email: { endsWith: TEST_EMAIL_DOMAIN } },
      select: { id: true },
    });

    const testUserIds = testUsers.map((u) => u.id);

    if (testUserIds.length > 0) {
      // Delete child relations first
      await prisma.activity.deleteMany({
        where: { userId: { in: testUserIds } },
      });

      await prisma.history.deleteMany({
        where: { userId: { in: testUserIds } },
      });

      await prisma.warning.deleteMany({
        where: { userId: { in: testUserIds } },
      });

      await prisma.user.deleteMany({
        where: { id: { in: testUserIds } },
      });
    }

    // Delete test equipment
    await prisma.equipment.deleteMany({
      where: { name: { startsWith: TEST_EQUIPMENT_PREFIX } },
    });

    // Delete test staff
    await prisma.staff.deleteMany({
      where: {
        OR: [
          { name: TEST_ADMIN_USERNAME },
          { email: { endsWith: TEST_EMAIL_DOMAIN } },
        ],
      },
    });
  } catch (error) {
    console.error("Error cleaning test data:", error);
  }
}

/**
 * Creates an isolated test equipment item.
 */
async function createTestEquipment(name = "Perceuse Sans Fil") {
  const safeName = name.startsWith(TEST_EQUIPMENT_PREFIX) ? name : `${TEST_EQUIPMENT_PREFIX}${name}`;
  return await prisma.equipment.create({
    data: {
      name: `${safeName}_${crypto.randomBytes(3).toString("hex")}`,
    },
  });
}

module.exports = {
  prisma,
  TEST_ADMIN_USERNAME,
  TEST_ADMIN_PASSWORD,
  TEST_EMAIL_DOMAIN,
  TEST_EQUIPMENT_PREFIX,
  ensureTestStaff,
  ensureTestUsertype,
  createTestUser,
  createTestEquipment,
  cleanTestData,
};
