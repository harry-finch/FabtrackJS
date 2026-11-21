const fs = require("fs");
const path = require("path");
const express = require("express");
const request = require("supertest");

const mockR018Prisma = {
  staff: { findUnique: jest.fn() },
  user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  history: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
  project: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  projecttype: { findUnique: jest.fn(), create: jest.fn() },
  userProject: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
  equipment: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
  consumable: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  activity: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() },
  inventoryMovement: { create: jest.fn() },
  log: { create: jest.fn(async () => ({})) },
  $transaction: jest.fn(async (arg) => (typeof arg === "function" ? arg(mockR018Prisma) : Promise.all(arg))),
};

jest.mock("../../utilities/db", () => ({
  prisma: mockR018Prisma,
  closePool: jest.fn(async () => {}),
  ResourceType: { MACHINE: "MACHINE", EQUIPMENT: "EQUIPMENT", CONSUMABLE: "CONSUMABLE" },
  ConsumableStatus: { AVAILABLE: "AVAILABLE", LOW_STOCK: "LOW_STOCK", OUT_OF_STOCK: "OUT_OF_STOCK" },
}));

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn(() => mockR018Prisma),
  ResourceType: { MACHINE: "MACHINE", EQUIPMENT: "EQUIPMENT", CONSUMABLE: "CONSUMABLE" },
  ConsumableStatus: { AVAILABLE: "AVAILABLE", LOW_STOCK: "LOW_STOCK", OUT_OF_STOCK: "OUT_OF_STOCK" },
}));

const staffSessionService = require("../../services/staffSessionService");
const sorbonneService = require("../../services/sorbonneService");
const historyImportService = require("../../services/historyImportService");
const historyRouter = require("../../routes/history");

describe("Unit (R-018): Transactionality, Double-Loan Prevention, Large CSV Import & Activity.unitCost", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    staffSessionService.clearCache();
    mockR018Prisma.staff.findUnique.mockResolvedValue({
      id: 1,
      name: "admin1",
      role: "admin",
      approved: true,
    });
  });

  function buildHistoryApp() {
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(express.json());
    app.use((req, res, next) => {
      req.session = {
        loggedin: true,
        staffId: 1,
        role: "admin",
        username: "admin1",
        lastPage: "/fabtrack",
      };
      next();
    });
    app.use("/history", historyRouter);
    return app;
  }

  test("1. Schema prisma & schema.sql include Activity.unitCost Decimal(10, 2)", () => {
    const schemaPrisma = fs.readFileSync(path.join(__dirname, "../../prisma/schema.prisma"), "utf8");
    const schemaSql = fs.readFileSync(path.join(__dirname, "../../prisma/schema.sql"), "utf8");
    expect(schemaPrisma).toContain("unitCost     Decimal?     @db.Decimal(10, 2)");
    expect(schemaSql).toContain("`unitCost` DECIMAL(10, 2) NULL");
  });

  test("2. Equipment borrow blocks already-loaned or unavailable equipment inside transaction, and return blocks double return", async () => {
    const app = buildHistoryApp();

    mockR018Prisma.history.findFirst.mockResolvedValue({ id: 10 });
    mockR018Prisma.equipment.findUnique.mockResolvedValue({
      id: 5,
      name: "Perceuse Bosch",
      status: "AVAILABLE",
    });
    mockR018Prisma.activity.findFirst.mockResolvedValue({ id: 777 }); // already loaned!

    const resDoubleLoan = await request(app)
      .post("/history/activity")
      .set("Accept", "application/json")
      .send({
        activityhistoryid: "10",
        activityuserid: "20",
        equipmentId: "5",
        borrowDurationDays: "7",
      });

    expect(resDoubleLoan.status).toBe(409);
    expect(resDoubleLoan.body.code).toBe("EQUIPMENT_UNAVAILABLE");
    expect(mockR018Prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockR018Prisma.activity.create).not.toHaveBeenCalled();

    // Unavailable status (OUT_OF_SERVICE) is also blocked
    mockR018Prisma.equipment.findUnique.mockResolvedValue({
      id: 5,
      name: "Perceuse Bosch",
      status: "OUT_OF_SERVICE",
    });
    const resUnavailable = await request(app)
      .post("/history/activity")
      .set("Accept", "application/json")
      .send({
        activityhistoryid: "10",
        activityuserid: "20",
        equipmentId: "5",
      });
    expect(resUnavailable.status).toBe(409);
    expect(mockR018Prisma.activity.create).not.toHaveBeenCalled();

    // Double return is blocked cleanly (updateMany returnedAt: null -> count 0)
    mockR018Prisma.activity.findUnique.mockResolvedValue({
      id: 777,
      resourceId: 5,
      resourceType: "EQUIPMENT",
      returnedAt: new Date("2026-11-20T12:00:00Z"),
      user: { name: "Ada", surname: "Lovelace" },
    });
    const resDoubleReturn = await request(app)
      .post("/history/equipment/return/777")
      .type("form")
      .send({ returnNotes: "test" });
    expect(resDoubleReturn.status).toBe(302);
    expect(mockR018Prisma.activity.updateMany).not.toHaveBeenCalled();
  });

  test("3. Consumable consumption executes atomically in transaction and snapshots Activity.unitCost (price hike has no retroactive effect)", async () => {
    const app = buildHistoryApp();

    mockR018Prisma.history.findFirst.mockResolvedValue({ id: 10 });
    mockR018Prisma.consumable.findUnique.mockResolvedValue({
      id: 3,
      name: "PLA Gris",
      cost: 2.5,
      stock: 100,
      reorderThreshold: 10,
      unit: "m",
    });
    mockR018Prisma.consumable.update.mockResolvedValue({});
    mockR018Prisma.history.findUnique.mockResolvedValue({
      id: 10,
      teachingUnit: null,
      unregisteredUeName: null,
      sorbonneEntity: null,
      userproject: null,
    });
    mockR018Prisma.user.update.mockResolvedValue({});
    mockR018Prisma.activity.create.mockResolvedValue({ id: 500 });

    const res = await request(app)
      .post("/history/activity")
      .type("form")
      .send({
        activityhistoryid: "10",
        activityuserid: "20",
        consumable: "3",
        quantity: "4",
      });

    expect(res.status).toBe(302);
    expect(mockR018Prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockR018Prisma.user.update).toHaveBeenCalledWith({
      where: { id: 20 },
      data: { balance: { decrement: 10 } },
    });
    expect(mockR018Prisma.activity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        resourceId: 3,
        resourceType: "CONSUMABLE",
        quantity: 4,
        unitCost: 2.5,
      }),
    });

    // Later, consumable.cost rises from 2.5 to 9.0 -> Sorbonne billing still uses snapshot unitCost = 2.5!
    mockR018Prisma.activity.findMany.mockResolvedValue([
      {
        id: 500,
        createdAt: new Date("2026-11-20T10:00:00Z"),
        resourceId: 3,
        resourceType: "CONSUMABLE",
        quantity: 4,
        unitCost: 2.5,
        settled: false,
        userId: 20,
        user: { name: "Ada", surname: "Lovelace", email: "ada@su.fr" },
        history: { sorbonneEntity: "UFR Maths", workspace: { name: "Lab" }, userproject: null },
      },
    ]);
    mockR018Prisma.consumable.findMany.mockResolvedValue([
      { id: 3, name: "PLA Gris", cost: 9.0, unit: "m" },
    ]);

    const billing = await sorbonneService.getSorbonneConsumptions();
    expect(billing.activities[0].unitCost).toBe(2.5);
    expect(billing.activities[0].totalCost).toBe(10);
    expect(billing.pendingTotalCost).toBe(10);
  });

  test("4. historyImportService.executeImport runs in transaction, uses unique Project.url lookup (no P2002), re-validates items & counts deduplicated users", async () => {
    mockR018Prisma.user.findUnique.mockResolvedValue(null);
    mockR018Prisma.user.create.mockResolvedValue({ id: 42 });
    mockR018Prisma.projecttype.findUnique.mockResolvedValue({ id: 2, name: "Academic" });
    // Existing project found strictly by unique url even if originally under another projecttypeId
    mockR018Prisma.project.findUnique.mockResolvedValue({ id: 88, url: "https://wiki.su.fr/projet-robot" });
    mockR018Prisma.userProject.findUnique.mockResolvedValue({ id: 99 });
    mockR018Prisma.history.create.mockResolvedValue({ id: 1 });

    const res = await historyImportService.executeImport(
      [
        {
          isValid: true,
          name: "Marie",
          surname: "Curie",
          email: "marie@su.fr",
          date: "2026-11-20",
          arrival: "2026-11-20T10:00:00Z",
          departure: "2026-11-20T12:00:00Z",
          projectTypeName: "Academic",
          projectName: "https://wiki.su.fr/projet-robot",
        },
        {
          // Same user twice in same batch -> must NOT inflate existingUsersCount!
          isValid: true,
          name: "Marie",
          surname: "Curie",
          email: "marie@su.fr",
          date: "2026-11-21",
          arrival: "2026-11-21T10:00:00Z",
          departure: "2026-11-21T12:00:00Z",
          projectTypeName: "Academic",
          projectName: "https://wiki.su.fr/projet-robot",
        },
        {
          // Tampered client item claiming isValid: true with invalid email -> rejected server-side!
          isValid: true,
          name: "Bad",
          surname: "Row",
          email: "not-an-email",
          arrival: "2026-11-21T10:00:00Z",
        },
      ],
      {},
      "admin1",
    );

    expect(mockR018Prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockR018Prisma.project.findUnique).toHaveBeenCalledWith({
      where: { url: "https://wiki.su.fr/projet-robot" },
    });
    expect(mockR018Prisma.project.create).not.toHaveBeenCalled();
    expect(res.createdHistoriesCount).toBe(2);
    expect(res.createdUsersCount).toBe(1);
    expect(res.existingUsersCount).toBe(0);
  });

  test("5. app.js bypasses default global express.json limit on /admin/history/execute so payloads > 200 KB do not 413", () => {
    const appSrc = fs.readFileSync(path.join(__dirname, "../../app.js"), "utf8");
    expect(appSrc).toContain('if (req.path === "/admin/history/execute")');
    expect(appSrc).toContain('express.json({ limit: "1mb" })');
  });
});
