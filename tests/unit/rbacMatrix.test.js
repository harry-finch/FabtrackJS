const express = require("express");
const request = require("supertest");

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  staff: {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  history: {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  project: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
  },
  projecttype: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  userProject: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  activity: {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
  },
  consumable: {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
  },
  equipment: {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  machine: {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
  },
  machineType: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  location: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  access: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  category: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  machineIssue: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  machineMaintenance: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  workshop: {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  userWorkshopInterest: {
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  userWorkshopCompletion: {
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  warning: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
  },
  warningtype: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  inventoryMovement: {
    count: jest.fn().mockResolvedValue(0),
  },
  systemSetting: {
    findMany: jest.fn().mockResolvedValue([]),
  },
};

const ENUM_STUBS = {
  ResourceType: {
    MACHINE: "MACHINE",
    EQUIPMENT: "EQUIPMENT",
    CONSUMABLE: "CONSUMABLE",
  },
  ConsumableStatus: {
    AVAILABLE: "AVAILABLE",
    LOW_STOCK: "LOW_STOCK",
    OUT_OF_STOCK: "OUT_OF_STOCK",
  },
};

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn(() => mockPrisma),
  ...ENUM_STUBS,
}));

jest.mock("../../utilities/db", () => ({
  prisma: mockPrisma,
  ...ENUM_STUBS,
}));

const mockMailService = {
  sendAgreementEmail: jest.fn().mockResolvedValue({ success: true }),
  sendWarningAlert: jest.fn().mockResolvedValue({ success: true }),
  sendLowStockAlert: jest.fn().mockResolvedValue({ success: true }),
  sendStaffApprovedNotification: jest.fn().mockResolvedValue({ success: true }),
};
jest.mock("../../services/mailService.js", () => mockMailService);
jest.mock("../../services/mailService", () => mockMailService);

const mockLogger = {
  logThat: jest.fn(),
};
jest.mock("../../utilities/simpleLogger.js", () => mockLogger);
jest.mock("../../utilities/simpleLogger", () => mockLogger);

const mockInventoryService = {
  getInventoryItems: jest.fn().mockResolvedValue({ consumables: [], equipment: [] }),
  checkoutConsumable: jest.fn().mockResolvedValue({
    consumable: { id: 1, name: "PLA", stock: 45 },
    movement: { id: 1, unit: "g" },
  }),
  checkoutEquipment: jest.fn().mockResolvedValue({
    equipment: { id: 2, name: "Perceuse", status: "OUT_OF_SERVICE" },
    movement: { id: 2, unit: "u" },
  }),
  getMovements: jest.fn().mockResolvedValue({ total: 0, movements: [] }),
  exportMovementsCsv: jest.fn().mockResolvedValue(""),
  restoreEquipment: jest.fn().mockResolvedValue({ equipment: { id: 2, name: "Perceuse" } }),
};
jest.mock("../../services/inventoryService.js", () => mockInventoryService);
jest.mock("../../services/inventoryService", () => mockInventoryService);

const mockRepairCafeService = {
  recordRepairExit: jest.fn().mockResolvedValue({}),
};
jest.mock("../../services/repairCafeService.js", () => mockRepairCafeService);
jest.mock("../../services/repairCafeService", () => mockRepairCafeService);

const { BalanceService } = require("../../services/balanceService");
const { StaffAdminService } = require("../../services/staffAdminService");
const staffSessionService = require("../../services/staffSessionService");

const historyRouter = require("../../routes/history");
const usersRouter = require("../../routes/users");
const inventoryRouter = require("../../routes/admin/inventory");
const machinesRouter = require("../../routes/admin/machines");
const staffRouter = require("../../routes/admin/staff");
const warningRouter = require("../../routes/warning");
const apiRouter = require("../../routes/api");

const ROLE_DEFAULT_STAFF_IDS = {
  admin: 1,
  user: 2,
  staff: 3,
};

function createTestApp() {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  app.use((req, res, next) => {
    const role = req.headers["x-test-role"];
    if (role) {
      const defaultStaffId = ROLE_DEFAULT_STAFF_IDS[role] || 1;
      req.session = {
        loggedin: true,
        role,
        staffId: req.headers["x-test-staff-id"] ? Number(req.headers["x-test-staff-id"]) : defaultStaffId,
        username: req.headers["x-test-username"] || `${role}_tester`,
        selectedWorkspace: { id: 1, name: "Fablab" },
      };
    } else {
      req.session = {};
    }

    res.render = (view) => res.status(200).json({ rendered: view });
    next();
  });

  app.use("/history", historyRouter);
  app.use("/users", usersRouter);
  app.use("/admin/inventory", inventoryRouter);
  app.use("/admin/machines", machinesRouter);
  app.use("/admin/staff", staffRouter);
  app.use("/warning", warningRouter);
  app.use("/api", apiRouter);

  app.use((err, req, res, next) => {
    res.status(500).json({ success: false, error: err.message });
  });

  return app;
}

function resetMocks() {
  jest.clearAllMocks();
  staffSessionService.clearCache();

  mockPrisma.user.findFirst.mockResolvedValue({
    id: 10,
    name: "Alice",
    surname: "Martin",
    balance: -12.5,
    termsAccepted: true,
    deletedAt: null,
  });
  mockPrisma.user.findUnique.mockResolvedValue({
    id: 10,
    name: "Alice",
    surname: "Martin",
    email: "alice@example.org",
    token: "tok-123",
    balance: -12.5,
    termsAccepted: true,
    isExpert: false,
    createdAt: new Date(),
    projects: [],
    workshopInterests: [],
    workshopCompletions: [],
  });
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.user.create.mockResolvedValue({ id: 22, name: "Bob", surname: "Dupont" });
  mockPrisma.user.update.mockResolvedValue({ id: 10, balance: 15 });
  mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.user.delete.mockResolvedValue({ id: 10, name: "Alice", surname: "Martin" });

  mockPrisma.staff.findUnique.mockImplementation(async ({ where }) => {
    if (where.id === 1 || where.name === "admin_tester") {
      return { id: 1, name: "admin_tester", email: "admin@lab.fr", role: "admin", approved: true };
    }
    if (where.id === 3 || where.name === "staff_tester") {
      return { id: 3, name: "staff_tester", email: "staff@lab.fr", role: "staff", approved: true };
    }
    return { id: where.id || 2, name: "mediateur_2", email: "med@lab.fr", role: "user", approved: true };
  });
  mockPrisma.staff.findMany.mockResolvedValue([]);
  mockPrisma.staff.count.mockResolvedValue(2);
  mockPrisma.staff.update.mockResolvedValue({
    id: 2,
    name: "mediateur_2",
    email: "med@lab.fr",
    role: "admin",
    approved: true,
  });
  mockPrisma.staff.delete.mockResolvedValue({ id: 2, name: "mediateur_2" });

  mockPrisma.history.findMany.mockResolvedValue([]);
  mockPrisma.history.create.mockResolvedValue({ id: 500 });
  mockPrisma.history.update.mockResolvedValue({ id: 100 });
  mockPrisma.history.delete.mockResolvedValue({ id: 100 });

  mockPrisma.project.update.mockResolvedValue({ id: 5, active: false });
  mockPrisma.projecttype.findMany.mockResolvedValue([]);

  mockPrisma.activity.findUnique.mockResolvedValue({
    id: 30,
    resourceId: 4,
    resourceType: "EQUIPMENT",
    userId: 10,
    user: { name: "Alice", surname: "Martin" },
  });
  mockPrisma.activity.findMany.mockResolvedValue([]);
  mockPrisma.activity.create.mockResolvedValue({ id: 31 });
  mockPrisma.activity.update.mockResolvedValue({ id: 30 });

  mockPrisma.equipment.findUnique.mockResolvedValue({ id: 4, name: "Multimètre" });
  mockPrisma.equipment.findMany.mockResolvedValue([]);
  mockPrisma.consumable.findMany.mockResolvedValue([]);

  mockPrisma.machine.findUnique.mockResolvedValue({ id: 3, name: "Prusa MK4" });
  mockPrisma.machine.findMany.mockResolvedValue([]);
  mockPrisma.machine.update.mockResolvedValue({ id: 3, name: "Prusa MK4" });
  mockPrisma.machineType.findMany.mockResolvedValue([]);
  mockPrisma.location.findMany.mockResolvedValue([]);
  mockPrisma.access.findMany.mockResolvedValue([]);
  mockPrisma.category.findMany.mockResolvedValue([]);
  mockPrisma.machineIssue.findUnique.mockResolvedValue({
    id: 7,
    machineId: 3,
    status: "OPEN",
    resolutionNotes: null,
  });
  mockPrisma.machineIssue.update.mockResolvedValue({ id: 7, status: "RESOLVED" });
  mockPrisma.machineIssue.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.machineMaintenance.create.mockResolvedValue({ id: 8, title: "Entretien" });

  mockPrisma.workshop.findMany.mockResolvedValue([]);
  mockPrisma.userWorkshopInterest.upsert.mockResolvedValue({ id: 1 });
  mockPrisma.userWorkshopInterest.deleteMany.mockResolvedValue({ count: 1 });
  mockPrisma.userWorkshopCompletion.upsert.mockResolvedValue({ id: 1 });
  mockPrisma.userWorkshopCompletion.deleteMany.mockResolvedValue({ count: 1 });

  mockPrisma.warning.findMany.mockResolvedValue([]);
  mockPrisma.warning.create.mockResolvedValue({
    id: 9,
    comments: "Rappel consignes",
    user: { id: 10, name: "Alice", surname: "Martin" },
    warningtype: { id: 1, name: "Sécurité" },
  });
  mockPrisma.warning.update.mockResolvedValue({ id: 9, active: false });
}

describe("Unit: Services & RBAC Matrix (R-007)", () => {
  beforeEach(() => {
    resetMocks();
  });

  describe("BalanceService (isolation tests)", () => {
    test("clearUserDebt clears only negative balances and logs audit trail", async () => {
      const service = new BalanceService({ prisma: mockPrisma, logger: mockLogger });

      const res = await service.clearUserDebt({ userId: 10, actorUsername: "Med1" });
      expect(res.success).toBe(true);
      expect(res.previousBalance).toBe(-12.5);
      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 10, deletedAt: null, balance: { lt: 0 } },
        data: { balance: 0.0 },
      });
      expect(mockLogger.logThat).toHaveBeenCalledWith(expect.stringContaining("[SOLDE]"));
    });

    test("clearUserDebt refuses positive or zero balance without touching DB", async () => {
      const service = new BalanceService({ prisma: mockPrisma, logger: mockLogger });

      mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 10, name: "Alice", surname: "Martin", balance: 40 });
      const posRes = await service.clearUserDebt({ userId: 10, actorUsername: "Med1" });
      expect(posRes.success).toBe(false);
      expect(posRes.code).toBe("POSITIVE_BALANCE");
      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();

      mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 10, name: "Alice", surname: "Martin", balance: 0 });
      const zeroRes = await service.clearUserDebt({ userId: 10, actorUsername: "Med1" });
      expect(zeroRes.success).toBe(false);
      expect(zeroRes.code).toBe("NO_DEBT");
      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
    });

    test("creditUserBalance rejects non-positive amounts and logs positive credits", async () => {
      const service = new BalanceService({ prisma: mockPrisma, logger: mockLogger });

      const bad = await service.creditUserBalance({ userId: 10, amount: -5, actorUsername: "Med1" });
      expect(bad.success).toBe(false);
      expect(bad.code).toBe("INVALID_AMOUNT");
      expect(mockPrisma.user.update).not.toHaveBeenCalled();

      mockPrisma.user.findFirst.mockResolvedValue({ id: 10, name: "Alice", surname: "Martin", balance: 5 });
      mockPrisma.user.update.mockResolvedValue({ id: 10, balance: 20 });
      const ok = await service.creditUserBalance({ userId: 10, amount: 15, actorUsername: "Med1" });
      expect(ok.success).toBe(true);
      expect(ok.newBalance).toBe(20);
      expect(mockLogger.logThat).toHaveBeenCalledWith(expect.stringContaining("+15.00 €"));
    });

    test("adjustUserBalance applies signed adjustment with mandatory reason in log", async () => {
      const service = new BalanceService({ prisma: mockPrisma, logger: mockLogger });

      const missingReason = await service.adjustUserBalance({
        userId: 10,
        delta: -5,
        reason: "x",
        actorUsername: "Admin1",
      });
      expect(missingReason.success).toBe(false);
      expect(missingReason.code).toBe("INVALID_REASON");

      mockPrisma.user.findFirst.mockResolvedValue({ id: 10, name: "Alice", surname: "Martin", balance: 15 });
      mockPrisma.user.update.mockResolvedValue({ id: 10, balance: 10 });
      const ok = await service.adjustUserBalance({
        userId: 10,
        delta: -5,
        reason: "Correction caisse",
        actorUsername: "Admin1",
      });
      expect(ok.success).toBe(true);
      expect(mockLogger.logThat).toHaveBeenCalledWith(expect.stringContaining("Correction caisse"));
    });
  });

  describe("StaffAdminService (self-lockout & last-admin guards)", () => {
    test("blocks self-deletion, self-demotion and self-disable", async () => {
      const service = new StaffAdminService({
        prisma: mockPrisma,
        mailService: mockMailService,
        logger: mockLogger,
      });

      const delSelf = await service.deleteStaff({
        targetId: 1,
        actor: { staffId: 1, username: "admin_tester" },
      });
      expect(delSelf.success).toBe(false);
      expect(delSelf.code).toBe("SELF_ACTION_FORBIDDEN");
      expect(mockPrisma.staff.delete).not.toHaveBeenCalled();

      const demoteSelf = await service.demoteStaff({
        targetId: 1,
        actor: { staffId: 1, username: "admin_tester" },
      });
      expect(demoteSelf.success).toBe(false);
      expect(demoteSelf.code).toBe("SELF_ACTION_FORBIDDEN");
      expect(mockPrisma.staff.update).not.toHaveBeenCalled();

      const disableSelf = await service.disableStaff({
        targetId: 1,
        actor: { staffId: 1, username: "admin_tester" },
      });
      expect(disableSelf.success).toBe(false);
      expect(disableSelf.code).toBe("SELF_ACTION_FORBIDDEN");
    });

    test("blocks removing last active admin even by another admin, and allows when >= 2 admins exist", async () => {
      const service = new StaffAdminService({
        prisma: mockPrisma,
        mailService: mockMailService,
        logger: mockLogger,
      });

      mockPrisma.staff.findUnique.mockResolvedValue({
        id: 5,
        name: "other_admin",
        email: "a2@lab.fr",
        role: "admin",
        approved: true,
      });
      mockPrisma.staff.count.mockResolvedValue(1);

      const blocked = await service.demoteStaff({
        targetId: 5,
        actor: { staffId: 1, username: "admin_tester" },
      });
      expect(blocked.success).toBe(false);
      expect(blocked.code).toBe("LAST_ADMIN_PROTECTED");

      mockPrisma.staff.count.mockResolvedValue(2);
      const allowed = await service.demoteStaff({
        targetId: 5,
        actor: { staffId: 1, username: "admin_tester" },
      });
      expect(allowed.success).toBe(true);
    });
  });

  describe("Supertest 3-Profile RBAC Matrix (anonymous, staff, user, admin)", () => {
    let app;

    beforeAll(() => {
      app = createTestApp();
    });

    test("Anonymous user receives 401 JSON on API/AJAX and 302 /login on HTML", async () => {
      const apiRes = await request(app).get("/api/list/all-staff");
      expect(apiRes.status).toBe(401);
      expect(apiRes.body.code).toBe("UNAUTHENTICATED");

      const ajaxRes = await request(app)
        .post("/admin/inventory/checkout")
        .set("Accept", "application/json")
        .send({});
      expect(ajaxRes.status).toBe(401);

      const htmlRes = await request(app).post("/history/credit").type("form").send({ userid: 10, money: 5 });
      expect(htmlRes.status).toBe(302);
      expect(htmlRes.headers.location).toBe("/login");
    });

    test("staff (borne kiosque) is restricted to badge-only pointing and blocked on all manual/privileged routes (R-007 + R-036)", async () => {
      // Blocked routes for staff (AJAX => 403 JSON, HTML => 302 /fabtrack, 0 DB mutations)
      const staffBlockedJson = [
        ["post", "/history/create", { userid: 10 }],
        ["post", "/history/exit/100"],
        ["post", "/history/exit-repair", { historyid: 100, repairStatus: "REPAIRED" }],
        ["post", "/history/cleardebt/10"],
        ["post", "/history/credit", { userid: 10, money: 10 }],
        ["post", "/history/balance-adjust", { userid: 10, operation: "debit", amount: 5, reason: "test" }],
        ["post", "/history/delete/100"],
        ["post", "/history/update", { historyid: 100 }],
        ["post", "/history/update-comment", { historyid: 100, comments: "hi" }],
        ["post", "/history/project/archive/5"],
        ["post", "/history/project/unarchive/5"],
        ["post", "/history/activity", { activityhistoryid: 100, activityuserid: 10, machineId: 3 }],
        ["post", "/history/equipment/return/30", {}],
        ["get", "/admin/inventory/items"],
        ["post", "/admin/inventory/checkout", { itemType: "CONSUMABLE", itemId: 1, quantity: 1, reason: "Casse / Dégradation" }],
        ["post", "/admin/inventory/checkout", { itemType: "EQUIPMENT", itemId: 2, equipmentAction: "DECOMMISSIONED", reason: "Casse / Dégradation" }],
        ["post", "/admin/machines/issues/7/status", { status: "RESOLVED", machineId: 3 }],
        ["post", "/admin/machines/maintenance/create", { machineId: 3, title: "Test", type: "PREVENTIVE" }],
        ["get", "/admin/staff/manage"],
        ["get", "/users/edit/10"],
        ["post", "/users/create", { newname: "A", newsurname: "B", newemail: "a@b.fr", newusertype: 1, newbirthyear: 2000 }],
        ["post", "/users/update/10", { name: "A", surname: "B", email: "a@b.fr", usertype: 1, birthyear: 2000 }],
        ["post", "/users/resend/10"],
        ["post", "/users/10/workshop-interest/add", { workshopId: 1 }],
        ["post", "/users/10/workshop-interest/remove/1"],
        ["post", "/users/10/workshop-badge/award", { workshopId: 1 }],
        ["post", "/users/10/workshop-badge/revoke/1"],
        ["post", "/warning/deactivate/9"],
        ["post", "/warning/create", { userid: 10, warningtype: 1 }],
        ["get", "/api/list/all-staff"],
        ["get", "/api/list/users-inlab"],
        ["get", "/api/users/search?q=Alice"],
        ["get", "/api/list/autocomplete-lists?scope=projects"],
        ["get", "/api/rfid/check-availability?rfid=ABC123"],
      ];

      for (const [method, url, body] of staffBlockedJson) {
        let reqBuilder = request(app)
          [method](url)
          .set("x-test-role", "staff")
          .set("Accept", "application/json");
        if (body) reqBuilder = reqBuilder.send(body);
        const res = await reqBuilder;
        expect(res.status).toBe(403);
        expect(res.body.code).toBe("FORBIDDEN");
      }

      // Also verify HTML redirect behaviour for staff on sensitive GET/POST routes
      const staffHtmlCredit = await request(app)
        .post("/history/credit")
        .set("x-test-role", "staff")
        .type("form")
        .send({ userid: 10, money: 20 });
      expect(staffHtmlCredit.status).toBe(302);
      expect(staffHtmlCredit.headers.location).toBe("/fabtrack");

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.history.delete).not.toHaveBeenCalled();
      expect(mockPrisma.warning.update).not.toHaveBeenCalled();
      expect(mockPrisma.machineIssue.update).not.toHaveBeenCalled();
      expect(mockPrisma.machineMaintenance.create).not.toHaveBeenCalled();
      expect(mockInventoryService.checkoutConsumable).not.toHaveBeenCalled();
      expect(mockInventoryService.checkoutEquipment).not.toHaveBeenCalled();
      expect(mockPrisma.userWorkshopCompletion.upsert).not.toHaveBeenCalled();
      expect(mockMailService.sendAgreementEmail).not.toHaveBeenCalled();
    });

    test("user (médiateur) accesses mediator routes including workshop badges & consumable checkout, blocked from admin-only routes", async () => {
      // Allowed for user (mediator)
      const commentRes = await request(app)
        .post("/history/update-comment")
        .set("x-test-role", "user")
        .type("form")
        .send({ historyid: 100, comments: "Nouvelle note" });
      expect(commentRes.status).toBe(302);
      expect(mockPrisma.history.update).toHaveBeenCalledTimes(1);

      const clearDebtRes = await request(app)
        .post("/history/cleardebt/10")
        .set("x-test-role", "user")
        .set("Accept", "application/json");
      expect(clearDebtRes.status).toBe(200);
      expect(mockPrisma.user.updateMany).toHaveBeenCalledTimes(1);

      const creditRes = await request(app)
        .post("/history/credit")
        .set("x-test-role", "user")
        .set("Accept", "application/json")
        .send({ userid: 10, money: "10.00" });
      expect(creditRes.status).toBe(200);

      const badCreditRes = await request(app)
        .post("/history/credit")
        .set("x-test-role", "user")
        .set("Accept", "application/json")
        .send({ userid: 10, money: "-5" });
      expect(badCreditRes.status).toBe(400);

      const archiveRes = await request(app).post("/history/project/archive/5").set("x-test-role", "user");
      expect(archiveRes.status).toBe(302);
      expect(mockPrisma.project.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { active: false } });

      const unarchiveRes = await request(app).post("/history/project/unarchive/5").set("x-test-role", "user");
      expect(unarchiveRes.status).toBe(302);

      const consCheckoutRes = await request(app)
        .post("/admin/inventory/checkout")
        .set("x-test-role", "user")
        .set("Accept", "application/json")
        .send({ itemType: "CONSUMABLE", itemId: 1, quantity: 2, reason: "Casse / Dégradation" });
      expect(consCheckoutRes.status).toBe(200);
      expect(mockInventoryService.checkoutConsumable).toHaveBeenCalledTimes(1);

      const issueStatusRes = await request(app)
        .post("/admin/machines/issues/7/status")
        .set("x-test-role", "user")
        .type("form")
        .send({ status: "RESOLVED", machineId: 3 });
      expect(issueStatusRes.status).toBe(302);
      expect(mockPrisma.machineIssue.update).toHaveBeenCalledTimes(1);

      const maintRes = await request(app)
        .post("/admin/machines/maintenance/create")
        .set("x-test-role", "user")
        .type("form")
        .send({ machineId: 3, title: "Nettoyage buse", type: "PREVENTIVE" });
      expect(maintRes.status).toBe(302);
      expect(mockPrisma.machineMaintenance.create).toHaveBeenCalledTimes(1);

      const awardBadgeRes = await request(app)
        .post("/users/10/workshop-badge/award")
        .set("x-test-role", "user")
        .type("form")
        .send({ workshopId: 4 });
      expect(awardBadgeRes.status).toBe(302);
      expect(awardBadgeRes.headers.location).toBe("/users/edit/10#collapseInterests");
      expect(mockPrisma.userWorkshopCompletion.upsert).toHaveBeenCalledTimes(1);

      const revokeBadgeRes = await request(app)
        .post("/users/10/workshop-badge/revoke/4")
        .set("x-test-role", "user");
      expect(revokeBadgeRes.status).toBe(302);
      expect(mockPrisma.userWorkshopCompletion.deleteMany).toHaveBeenCalledTimes(1);

      const interestRes = await request(app)
        .post("/users/10/workshop-interest/add")
        .set("x-test-role", "user")
        .type("form")
        .send({ workshopId: 4 });
      expect(interestRes.status).toBe(302);

      const resendRes = await request(app).post("/users/resend/10").set("x-test-role", "user");
      expect(resendRes.status).toBe(302);
      expect(mockMailService.sendAgreementEmail).toHaveBeenCalledTimes(1);

      const createWarnRes = await request(app)
        .post("/warning/create")
        .set("x-test-role", "user")
        .type("form")
        .send({ userid: 10, warningtype: 1, comments: "Oubli EPI" });
      expect(createWarnRes.status).toBe(302);
      expect(mockPrisma.warning.create).toHaveBeenCalledTimes(1);

      // Blocked for user (mediator) => 403 JSON
      const mediatorBlocked = [
        ["post", "/history/delete/100"],
        ["post", "/history/update", { historyid: 100 }],
        ["post", "/history/balance-adjust", { userid: 10, operation: "debit", amount: 5, reason: "test" }],
        ["post", "/warning/deactivate/9"],
        ["post", "/admin/inventory/checkout", { itemType: "EQUIPMENT", itemId: 2, equipmentAction: "DECOMMISSIONED", reason: "Casse / Dégradation" }],
        ["get", "/admin/staff/manage"],
        ["get", "/users/manage"],
        ["post", "/users/delete/10"],
        ["post", "/admin/machines/issues/7/delete"],
        ["get", "/api/list/all-staff"],
      ];

      for (const [method, url, body] of mediatorBlocked) {
        let reqBuilder = request(app)
          [method](url)
          .set("x-test-role", "user")
          .set("Accept", "application/json");
        if (body) reqBuilder = reqBuilder.send(body);
        const res = await reqBuilder;
        expect(res.status).toBe(403);
      }

      expect(mockPrisma.history.delete).not.toHaveBeenCalled();
      expect(mockPrisma.warning.update).not.toHaveBeenCalled();
      expect(mockInventoryService.checkoutEquipment).not.toHaveBeenCalled();
    });

    test("admin accesses all privileged endpoints while business guards stay enforced", async () => {
      const delHistRes = await request(app).post("/history/delete/100").set("x-test-role", "admin");
      expect(delHistRes.status).toBe(302);
      expect(mockPrisma.history.delete).toHaveBeenCalledWith({ where: { id: 100 } });

      const updHistRes = await request(app)
        .post("/history/update")
        .set("x-test-role", "admin")
        .type("form")
        .send({ historyid: 100, comments: "Admin fix" });
      expect(updHistRes.status).toBe(302);

      const adjRes = await request(app)
        .post("/history/balance-adjust")
        .set("x-test-role", "admin")
        .set("Accept", "application/json")
        .send({ userid: 10, operation: "debit", amount: "4.50", reason: "Correction solde" });
      expect(adjRes.status).toBe(200);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 10 }, data: { balance: { increment: -4.5 } } }),
      );

      // Guard: cleardebt refuses positive balance even for admin
      mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 10, name: "Alice", surname: "Martin", balance: 30 });
      const posClearRes = await request(app)
        .post("/history/cleardebt/10")
        .set("x-test-role", "admin")
        .set("Accept", "application/json");
      expect(posClearRes.status).toBe(400);
      expect(posClearRes.body.code).toBe("POSITIVE_BALANCE");

      const deactWarnRes = await request(app).post("/warning/deactivate/9").set("x-test-role", "admin");
      expect(deactWarnRes.status).toBe(302);
      expect(mockPrisma.warning.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { active: false } });

      const eqCheckoutRes = await request(app)
        .post("/admin/inventory/checkout")
        .set("x-test-role", "admin")
        .set("Accept", "application/json")
        .send({
          itemType: "EQUIPMENT",
          itemId: 2,
          equipmentAction: "DECOMMISSIONED",
          reason: "Mise au rebut / Usure",
        });
      expect(eqCheckoutRes.status).toBe(200);
      expect(mockInventoryService.checkoutEquipment).toHaveBeenCalledTimes(1);

      const apiStaffRes = await request(app).get("/api/list/all-staff").set("x-test-role", "admin");
      expect(apiStaffRes.status).toBe(200);

      // Guard: admin/staff/update rejects invalid role and self-demotion
      const invalidRoleRes = await request(app)
        .post("/admin/staff/update")
        .set("x-test-role", "admin")
        .set("x-test-staff-id", "1")
        .set("Accept", "application/json")
        .send({
          id: 2,
          username: "mediateur_2",
          email: "med@lab.fr",
          role: "hacker_role",
          approved: "on",
        });
      expect(invalidRoleRes.status).toBe(400);

      const selfDemoteRes = await request(app)
        .post("/admin/staff/demote/1")
        .set("x-test-role", "admin")
        .set("x-test-staff-id", "1")
        .set("Accept", "application/json");
      expect(selfDemoteRes.status).toBe(403);
      expect(selfDemoteRes.body.code).toBe("SELF_ACTION_FORBIDDEN");
    });
  });
});
