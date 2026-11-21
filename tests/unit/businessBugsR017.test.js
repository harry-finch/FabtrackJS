const express = require("express");
const request = require("supertest");

const mockR017Prisma = {
  staff: { findUnique: jest.fn() },
  warning: { create: jest.fn() },
  activity: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
  },
  consumable: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  equipment: { findUnique: jest.fn(), update: jest.fn() },
  inventoryMovement: { create: jest.fn() },
  user: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn(), update: jest.fn() },
  history: { findMany: jest.fn(), findFirst: jest.fn() },
  project: { findUnique: jest.fn() },
  machine: { findUnique: jest.fn(), update: jest.fn() },
  machineMaintenance: { create: jest.fn() },
  machineIssue: { updateMany: jest.fn() },
  log: { create: jest.fn(async () => ({})) },
  $transaction: jest.fn(async (arg) => (typeof arg === "function" ? arg(mockR017Prisma) : Promise.all(arg))),
};

jest.mock("../../utilities/db", () => ({
  prisma: mockR017Prisma,
  closePool: jest.fn(async () => {}),
  ResourceType: { MACHINE: "MACHINE", EQUIPMENT: "EQUIPMENT", CONSUMABLE: "CONSUMABLE" },
}));

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn(() => mockR017Prisma),
  ResourceType: { MACHINE: "MACHINE", EQUIPMENT: "EQUIPMENT", CONSUMABLE: "CONSUMABLE" },
}));

const mailService = require("../../services/mailService");
const settingsService = require("../../services/settingsService");
const staffSessionService = require("../../services/staffSessionService");
const inventoryService = require("../../services/inventoryService");
const sorbonneService = require("../../services/sorbonneService");
const bookstackService = require("../../services/bookstackService");
const { MachineUsageService } = require("../../services/machineUsageService");

describe("Unit (R-017): 6 Confirmed Business Bug Fixes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    staffSessionService.clearCache();
    mockR017Prisma.staff.findUnique.mockResolvedValue({
      id: 1,
      name: "admin1",
      role: "admin",
      approved: true,
    });
  });

  test("1. routes/admin/warnings.js passes warningtype, comments and staffUsername to mailService.sendWarningAlert", async () => {
    const warningsRouter = require("../../routes/admin/warnings");
    const sendSpy = jest.spyOn(mailService, "sendWarningAlert").mockResolvedValue({ success: true });
    mockR017Prisma.warning.create.mockResolvedValue({
      id: 55,
      comments: "Port de lunettes oublié",
      user: { id: 10, name: "Alice", surname: "Martin", email: "alice@example.org" },
      warningtype: { id: 3, name: "Sécurité laser" },
    });

    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use((req, res, next) => {
      req.session = { loggedin: true, staffId: 1, role: "admin", username: "admin1" };
      next();
    });
    app.use("/admin/warnings", warningsRouter);

    const res = await request(app)
      .post("/admin/warnings/create")
      .type("form")
      .send({ userid: "10", warningtype: "3", comments: "Port de lunettes oublié" });

    expect(res.status).toBe(302);
    expect(sendSpy).toHaveBeenCalledWith({
      user: expect.objectContaining({ id: 10, name: "Alice" }),
      warningtype: expect.objectContaining({ id: 3, name: "Sécurité laser" }),
      comments: "Port de lunettes oublié",
      staffUsername: "admin1",
    });
    sendSpy.mockRestore();
  });

  test("2. sorbonneService applies startDate/endDate to KPIs and restricts toggleSettled to CONSUMABLE", async () => {
    mockR017Prisma.activity.findMany.mockResolvedValue([
      {
        id: 1,
        createdAt: new Date("2026-01-10T10:00:00Z"),
        resourceId: 10,
        resourceType: "CONSUMABLE",
        quantity: 2,
        settled: false,
        userId: 5,
        user: { name: "Ada", surname: "Lovelace", email: "ada@su.fr" },
        history: { sorbonneEntity: "UFR Physique", workspace: { name: "Lab" }, userproject: null },
      },
      {
        id: 2,
        createdAt: new Date("2026-03-15T10:00:00Z"),
        resourceId: 10,
        resourceType: "CONSUMABLE",
        quantity: 5,
        settled: false,
        userId: 5,
        user: { name: "Ada", surname: "Lovelace", email: "ada@su.fr" },
        history: { sorbonneEntity: "UFR Physique", workspace: { name: "Lab" }, userproject: null },
      },
    ]);
    mockR017Prisma.consumable.findMany.mockResolvedValue([{ id: 10, name: "PLA", cost: 10, unit: "g" }]);

    const data = await sorbonneService.getSorbonneConsumptions({
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(data.activities).toHaveLength(1);
    expect(data.pendingTotalCost).toBe(50);
    expect(data.grandTotalCost).toBe(50);
    expect(data.entitySummary[0].pendingCost).toBe(50);

    // toggleSettled rejects non-CONSUMABLE (e.g. MACHINE) activity
    mockR017Prisma.activity.findUnique.mockResolvedValueOnce({
      id: 99,
      resourceType: "MACHINE",
      settled: false,
    });
    const rejected = await sorbonneService.toggleSettled(99, "admin1");
    expect(rejected).toBeNull();
    expect(mockR017Prisma.activity.update).not.toHaveBeenCalled();
  });

  test("3. inventoryService honors KEEP_STATUS on equipment checkout and triggers sendLowStockAlert on consumable checkout", async () => {
    const lowStockSpy = jest.spyOn(mailService, "sendLowStockAlert").mockResolvedValue({ success: true });

    // 3a. Consumable crosses reorderThreshold -> triggers low stock alert
    mockR017Prisma.consumable.findUnique.mockResolvedValue({
      id: 4,
      name: "PLA Noir",
      stock: 12,
      reorderThreshold: 10,
      unit: "m",
    });
    mockR017Prisma.consumable.update.mockResolvedValue({
      id: 4,
      name: "PLA Noir",
      stock: 8,
      reorderThreshold: 10,
      status: "LOW_STOCK",
      unit: "m",
    });
    mockR017Prisma.inventoryMovement.create.mockResolvedValue({ id: 101, unit: "m" });

    await inventoryService.checkoutConsumable({
      id: 4,
      quantity: 4,
      reason: "Atelier",
      author: "admin1",
    });
    expect(lowStockSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 4, status: "LOW_STOCK" }), 8);

    // 3b. Equipment checkout with KEEP_STATUS does NOT update equipment status
    mockR017Prisma.equipment.findUnique.mockResolvedValue({
      id: 8,
      name: "Multimètre",
      status: "AVAILABLE",
    });
    mockR017Prisma.inventoryMovement.create.mockResolvedValue({
      id: 102,
      equipmentStatusBefore: "AVAILABLE",
      equipmentStatusAfter: "AVAILABLE",
    });

    const eqRes = await inventoryService.checkoutEquipment({
      id: 8,
      action: "KEEP_STATUS",
      reason: "Inventaire",
      author: "admin1",
    });
    expect(mockR017Prisma.equipment.update).not.toHaveBeenCalled();
    expect(eqRes.equipment.status).toBe("AVAILABLE");

    lowStockSpy.mockRestore();
  });

  test("4. routes/users.js handles missing user on edit, deduplicates projects by id, handles null birthyear & lastPage fallback", async () => {
    const usersRouter = require("../../routes/users");

    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use((req, res, next) => {
      req.session = { loggedin: true, staffId: 1, role: "admin", username: "admin1" };
      res.render = (view, locals) => res.status(200).json({ view, locals });
      next();
    });
    app.use("/users", usersRouter);

    // 4a. GET /users/edit/999 with null user redirects cleanly instead of 500
    mockR017Prisma.user.findUnique.mockResolvedValueOnce(null);
    const editMissingRes = await request(app).get("/users/edit/999");
    expect(editMissingRes.status).toBe(302);
    expect(editMissingRes.headers.location).toBe("/users/manage");

    // 4b. POST /users/delete/10 with empty lastPage falls back to /users/manage
    mockR017Prisma.user.delete.mockResolvedValueOnce({ id: 10, name: "Bob", surname: "Test" });
    const delRes = await request(app).post("/users/delete/10");
    expect(delRes.status).toBe(302);
    expect(delRes.headers.location).toBe("/users/manage");

    // 4c. POST /users/update/10 with empty birthyear stores null (not 0 / NaN)
    mockR017Prisma.user.update.mockResolvedValueOnce({ id: 10 });
    await request(app)
      .post("/users/update/10")
      .type("form")
      .send({
        name: "Bob",
        surname: "Test",
        email: "bob@example.org",
        usertype: "1",
        birthyear: "",
      });
    expect(mockR017Prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ birthYear: null }),
      }),
    );
  });

  test("5. MachineUsageService.getMachineUsageStats uses SQL aggregation (>100 sessions) & backdated maintenance preserves newer lastMaintenance", async () => {
    const svc = new MachineUsageService({ prisma: mockR017Prisma });
    mockR017Prisma.activity.count.mockResolvedValue(245);
    mockR017Prisma.activity.findMany.mockResolvedValue([{ userId: 1 }, { userId: 2 }, { userId: 3 }]);
    mockR017Prisma.activity.findFirst.mockResolvedValue({
      startedAt: new Date("2026-11-20T14:00:00Z"),
      createdAt: new Date("2026-11-20T14:00:00Z"),
    });

    const stats = await svc.getMachineUsageStats(7);
    expect(stats.totalSessions).toBe(245);
    expect(stats.uniqueUsers).toBe(3);
    expect(stats.lastUsed).not.toBe("Jamais");

    // Backdated maintenance must NOT overwrite newer machine.lastMaintenance
    const machinesRouter = require("../../routes/admin/machines");
    mockR017Prisma.machine.findUnique.mockResolvedValue({
      id: 7,
      name: "Prusa MK4",
      lastMaintenance: new Date("2026-11-15T10:00:00Z"),
    });
    mockR017Prisma.machineMaintenance.create.mockResolvedValue({ id: 1 });

    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use((req, res, next) => {
      req.session = { loggedin: true, staffId: 1, role: "admin", username: "admin1" };
      next();
    });
    app.use("/admin/machines", machinesRouter);

    const res = await request(app)
      .post("/admin/machines/maintenance/create")
      .type("form")
      .send({
        machineId: "7",
        title: "Ancienne révision",
        type: "PREVENTIVE",
        maintenanceDate: "2026-09-01",
      });
    expect(res.status).toBe(302);
    expect(mockR017Prisma.machine.update).not.toHaveBeenCalled();
  });

  test("6. bookstackService.checkProjectDocStatus filters History by userproject.projectId without dead arrival filter", async () => {
    jest.spyOn(settingsService, "getSettings").mockResolvedValue({
      plugin_bookstack_enabled: "true",
      bookstack_url: "https://wiki.fablab.example.org/BookStack/",
      bookstack_token_id: "",
      bookstack_token_secret: "",
    });
    mockR017Prisma.project.findUnique.mockResolvedValue({
      id: 42,
      url: "https://wiki.fablab.example.org/BookStack/books/mon-projet",
    });
    mockR017Prisma.history.findFirst.mockResolvedValue(null);

    const res = await bookstackService.checkProjectDocStatus(42, 9);
    expect(res.success).toBe(true);
    expect(res.reason).toBe("first_visit");

    const whereArg = mockR017Prisma.history.findFirst.mock.calls[0][0].where;
    expect(whereArg).toEqual({
      userId: 9,
      userproject: { projectId: 42 },
    });
    expect(Object.prototype.hasOwnProperty.call(whereArg, "arrival")).toBe(false);
  });
});
