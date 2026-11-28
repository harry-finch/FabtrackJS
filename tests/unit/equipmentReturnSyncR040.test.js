const fs = require("fs");
const path = require("path");
const express = require("express");
const request = require("supertest");

const mockPrisma = {
  activity: {
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    findMany: jest.fn(),
  },
  equipment: {
    findUnique: jest.fn(),
  },
};

const mockLogger = {
  logThat: jest.fn(),
};

const mockRealtimeService = {
  publish: jest.fn(),
};

jest.mock("../../utilities/db.js", () => ({
  prisma: mockPrisma,
  ResourceType: { MACHINE: "MACHINE", EQUIPMENT: "EQUIPMENT", CONSUMABLE: "CONSUMABLE" },
}));

jest.mock("../../utilities/simpleLogger.js", () => mockLogger);
jest.mock("../../services/realtimeService.js", () => mockRealtimeService);
jest.mock("../../middleware/checkSession.js", () => (req, _res, next) => next());
jest.mock("../../services/staffSessionService.js", () => ({
  verifyActiveStaffSession: jest.fn().mockResolvedValue({ valid: true }),
}));

const equipmentLoanService = require("../../services/equipmentLoanService.js");
const historyRouter = require("../../routes/history.js");
const adminEquipmentRouter = require("../../routes/admin/equipment.js");

function buildApp(role = "admin") {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = {
      loggedin: true,
      role,
      username: role === "admin" ? "admin1" : "mediator1",
      lastPage: "/admin/equipment/manage",
    };
    next();
  });
  app.use("/history", historyRouter);
  app.use("/admin/equipment", adminEquipmentRouter);
  return app;
}

describe("R-040 — Synchronized equipment return across kiosk & admin", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("POST /admin/equipment/return/:id and POST /history/equipment/return/:id share atomic logic, support legacy resourceId-only loans, log once, and broadcast on both kiosk & admin SSE channels", async () => {
    const legacyLoan = {
      id: 99,
      resourceType: "EQUIPMENT",
      resourceId: 12,
      equipmentId: null, // legacy loan without typed FK
      userId: 7,
      returnedAt: null,
      user: { id: 7, name: "Lina", surname: "Morel" },
    };
    mockPrisma.activity.findUnique.mockResolvedValue(legacyLoan);
    mockPrisma.activity.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.equipment.findUnique.mockResolvedValue({ id: 12, name: "Multimètre Fluke" });

    const adminRes = await request(buildApp("admin"))
      .post("/admin/equipment/return/99")
      .set("Accept", "application/json")
      .send({ returnNotes: "Rendu en bon état" });

    expect(adminRes.status).toBe(200);
    expect(adminRes.body.ok).toBe(true);
    expect(adminRes.body.status).toBe("returned");
    expect(mockPrisma.activity.updateMany).toHaveBeenCalledWith({
      where: { id: 99, resourceType: "EQUIPMENT", returnedAt: null },
      data: expect.objectContaining({ returnNotes: "Rendu en bon état", returnedAt: expect.any(Date) }),
    });
    expect(mockLogger.logThat).toHaveBeenCalledTimes(1);
    expect(mockRealtimeService.publish).toHaveBeenCalledWith("kiosk", {
      action: "equipment-return",
      activityId: 99,
    });
    expect(mockRealtimeService.publish).toHaveBeenCalledWith("admin", {
      entity: "equipment",
      action: "equipment-return",
      activityId: 99,
    });
  });

  test("concurrent return on two stations: only first succeeds, second receives 'déjà restitué' with zero duplicate logs or SSE broadcasts", async () => {
    const loan = {
      id: 100,
      resourceType: "EQUIPMENT",
      resourceId: 15,
      equipmentId: 15,
      userId: 8,
      returnedAt: null,
      user: { id: 8, name: "Alex", surname: "Martin" },
    };
    mockPrisma.activity.findUnique.mockResolvedValue(loan);
    mockPrisma.activity.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    mockPrisma.equipment.findUnique.mockResolvedValue({ id: 15, name: "Dremel 4000" });

    const [first, second] = await Promise.all([
      equipmentLoanService.processEquipmentReturn({
        prisma: mockPrisma,
        activityId: 100,
        returnNotes: "Première note",
        staffUsername: "poste1",
        logger: mockLogger,
        realtimeService: mockRealtimeService,
      }),
      equipmentLoanService.processEquipmentReturn({
        prisma: mockPrisma,
        activityId: 100,
        returnNotes: "Seconde note",
        staffUsername: "poste2",
        logger: mockLogger,
        realtimeService: mockRealtimeService,
      }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual(["already_returned", "returned"]);
    const duplicate = first.status === "already_returned" ? first : second;
    expect(duplicate.message).toMatch(/déjà été marqué comme restitué/i);
    expect(mockLogger.logThat).toHaveBeenCalledTimes(1);
    expect(mockRealtimeService.publish).toHaveBeenCalledTimes(2); // 1 kiosk + 1 admin
  });

  test("missing activity or non-EQUIPMENT activity returns 'Emprunt introuvable' with zero writes or broadcasts", async () => {
    mockPrisma.activity.findUnique.mockResolvedValueOnce(null);
    const missingRes = await request(buildApp("user"))
      .post("/history/equipment/return/404")
      .set("Accept", "application/json")
      .send({});

    expect(missingRes.status).toBe(404);
    expect(missingRes.body.message).toBe("Emprunt introuvable.");

    mockPrisma.activity.findUnique.mockResolvedValueOnce({
      id: 55,
      resourceType: "CONSUMABLE",
      returnedAt: null,
    });
    const wrongTypeRes = await request(buildApp("admin"))
      .post("/admin/equipment/return/55")
      .set("Accept", "application/json")
      .send({});

    expect(wrongTypeRes.status).toBe(404);
    expect(wrongTypeRes.body.message).toBe("Emprunt introuvable.");
    expect(mockPrisma.activity.updateMany).not.toHaveBeenCalled();
    expect(mockLogger.logThat).not.toHaveBeenCalled();
    expect(mockRealtimeService.publish).not.toHaveBeenCalled();
  });

  test("borne account (role: 'staff') is forbidden from returning equipment on both routes", async () => {
    const historyRes = await request(buildApp("staff"))
      .post("/history/equipment/return/99")
      .set("Accept", "application/json")
      .send({});
    expect(historyRes.status).toBe(403);

    const adminRes = await request(buildApp("staff"))
      .post("/admin/equipment/return/99")
      .set("Accept", "application/json")
      .send({});
    expect(adminRes.status).toBe(403);
    expect(mockPrisma.activity.updateMany).not.toHaveBeenCalled();
    expect(mockRealtimeService.publish).not.toHaveBeenCalled();
  });

  test("manage-equipment.ejs defines live-refresh regions for KPIs, active loans, and catalog, and DEVELOPMENT.md section 13 is accurate", () => {
    const viewSrc = fs.readFileSync(
      path.join(__dirname, "../../views/admin/manage-equipment.ejs"),
      "utf8",
    );
    expect(viewSrc).toContain('data-live-refresh-region="equipment-kpi-row"');
    expect(viewSrc).toContain('data-live-refresh-region="equipment-active-loans-card"');
    expect(viewSrc).toContain('data-live-refresh-region="equipment-catalog-card"');

    const liveRefreshSrc = fs.readFileSync(
      path.join(__dirname, "../../public/javascripts/live-refresh.js"),
      "utf8",
    );
    expect(liveRefreshSrc).toContain("data-live-refresh-region");
    expect(liveRefreshSrc).toContain("isUserEditingOrModalOpen");

    const devDoc = fs.readFileSync(path.join(__dirname, "../../DEVELOPMENT.md"), "utf8");
    expect(devDoc).toContain("POST /history/activity");
    expect(devDoc).toContain("POST /history/equipment/return/:id");
    expect(devDoc).toContain("POST /admin/equipment/return/:id");
    expect(devDoc).toContain("Activity.returnedAt");
    expect(devDoc).toContain("Activity.returnNotes");
  });
});
