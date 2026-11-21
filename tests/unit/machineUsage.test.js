const {
  verifyCardUserSchema,
  verifyCardQuerySchema,
  startMachineUsageSchema,
  endMachineUsageSchema,
  recordMachineUsageSchema,
  machineUsageQuerySchema,
} = require("../../schemas");
const { formatDuration, formatDurationSeconds } = require("../../services/dateService");
const checkApiKeyOrSession = require("../../middleware/checkApiKeyOrSession");
const settingsService = require("../../services/settingsService");
const { MachineUsageService } = require("../../services/machineUsageService");

function createMockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

function createMockPrisma() {
  return {
    user: {
      findFirst: jest.fn(),
    },
    history: {
      findFirst: jest.fn(),
    },
    warning: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    machine: {
      findUnique: jest.fn(),
    },
    workshop: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    userWorkshopCompletion: {
      findFirst: jest.fn(),
    },
    activity: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe("Unit: Machine Usage Validation Schemas & Helpers", () => {
  describe("verifyCardUserSchema", () => {
    test("validates valid payload with RFID string", () => {
      const data = { rfid: "04A1B2C3D4", machineId: "5" };
      const res = verifyCardUserSchema.safeParse(data);
      expect(res.success).toBe(true);
      expect(res.data.rfid).toBe("04A1B2C3D4");
      expect(res.data.machineId).toBe(5);
    });

    test("rejects when rfid is empty or missing", () => {
      expect(verifyCardUserSchema.safeParse({ rfid: "   " }).success).toBe(false);
      expect(verifyCardUserSchema.safeParse({}).success).toBe(false);
    });

    test("rejects non-numeric, zero or negative machineId", () => {
      expect(verifyCardUserSchema.safeParse({ rfid: "04AA", machineId: "abc" }).success).toBe(false);
      expect(verifyCardUserSchema.safeParse({ rfid: "04AA", machineId: 0 }).success).toBe(false);
      expect(verifyCardUserSchema.safeParse({ rfid: "04AA", machineId: -2 }).success).toBe(false);
    });
  });

  describe("verifyCardQuerySchema", () => {
    test("accepts rfid or cardId alias with optional machineId", () => {
      const res1 = verifyCardQuerySchema.safeParse({ rfid: "CARD_1", machineId: "3" });
      expect(res1.success).toBe(true);
      expect(res1.data.machineId).toBe(3);

      const res2 = verifyCardQuerySchema.safeParse({ cardId: "CARD_2" });
      expect(res2.success).toBe(true);
    });

    test("rejects missing rfid/cardId or invalid machineId", () => {
      expect(verifyCardQuerySchema.safeParse({}).success).toBe(false);
      expect(verifyCardQuerySchema.safeParse({ rfid: "CARD_1", machineId: "not-a-number" }).success).toBe(false);
    });
  });

  describe("startMachineUsageSchema", () => {
    test("validates valid start with RFID and 3D telemetry", () => {
      const data = {
        rfid: "CARD_123",
        machineId: "2",
        filamentQuantity: "35.5",
        filamentType: "PLA",
        printDuration: "3600",
        gcodeName: "benchy.gcode",
      };
      const res = startMachineUsageSchema.safeParse(data);
      expect(res.success).toBe(true);
      expect(res.data.machineId).toBe(2);
      expect(res.data.filamentQuantity).toBe(35.5);
      expect(res.data.filamentType).toBe("PLA");
      expect(res.data.printDuration).toBe(3600);
      expect(res.data.gcodeName).toBe("benchy.gcode");
    });

    test("validates with userId instead of rfid", () => {
      const data = {
        userId: 42,
        machineId: 1,
      };
      const res = startMachineUsageSchema.safeParse(data);
      expect(res.success).toBe(true);
      expect(res.data.userId).toBe(42);
    });

    test("rejects when neither rfid nor userId is provided", () => {
      const res = startMachineUsageSchema.safeParse({ machineId: 1 });
      expect(res.success).toBe(false);
    });

    test("rejects when machineId is missing or invalid", () => {
      expect(startMachineUsageSchema.safeParse({ rfid: "CARD_123" }).success).toBe(false);
      expect(startMachineUsageSchema.safeParse({ rfid: "CARD_123", machineId: "abc" }).success).toBe(false);
    });

    test("rejects non-numeric filamentQuantity and invalid startedAt date string", () => {
      expect(
        startMachineUsageSchema.safeParse({ rfid: "CARD_123", machineId: 1, filamentQuantity: "abc" }).success
      ).toBe(false);
      expect(
        startMachineUsageSchema.safeParse({ rfid: "CARD_123", machineId: 1, filamentQuantity: -10 }).success
      ).toBe(false);
      expect(
        startMachineUsageSchema.safeParse({ rfid: "CARD_123", machineId: 1, startedAt: "not-a-date" }).success
      ).toBe(false);
    });
  });

  describe("endMachineUsageSchema", () => {
    test("validates valid end with activityId and telemetry update", () => {
      const data = {
        activityId: 10,
        filamentQuantity: 42.1,
        comments: "Parfait sans warping",
      };
      const res = endMachineUsageSchema.safeParse(data);
      expect(res.success).toBe(true);
      expect(res.data.activityId).toBe(10);
      expect(res.data.filamentQuantity).toBe(42.1);
      expect(res.data.comments).toBe("Parfait sans warping");
    });

    test("validates with machineId and rfid when activityId not retained by client", () => {
      const data = {
        machineId: 3,
        rfid: "CARD_123",
      };
      const res = endMachineUsageSchema.safeParse(data);
      expect(res.success).toBe(true);
      expect(res.data.machineId).toBe(3);
    });

    test("rejects when neither activityId nor machineId is provided", () => {
      const res = endMachineUsageSchema.safeParse({ comments: "done" });
      expect(res.success).toBe(false);
    });

    test("rejects invalid endedAt string", () => {
      const res = endMachineUsageSchema.safeParse({ activityId: 10, endedAt: "demain" });
      expect(res.success).toBe(false);
    });
  });

  describe("recordMachineUsageSchema", () => {
    test("validates full session record with start, end and 3D printing details", () => {
      const data = {
        rfid: "CARD_123",
        machineId: 2,
        startedAt: "2026-10-28T14:00:00Z",
        endedAt: "2026-10-28T15:30:00Z",
        filamentQuantity: 28.5,
        filamentType: "PETG",
        printDuration: 5400,
        gcodeName: "gear.gcode",
      };
      const res = recordMachineUsageSchema.safeParse(data);
      expect(res.success).toBe(true);
      expect(res.data.filamentType).toBe("PETG");
      expect(res.data.printDuration).toBe(5400);
    });

    test("rejects when endedAt is earlier than startedAt", () => {
      const res = recordMachineUsageSchema.safeParse({
        rfid: "CARD_123",
        machineId: 2,
        startedAt: "2026-10-28T15:30:00Z",
        endedAt: "2026-10-28T14:00:00Z",
      });
      expect(res.success).toBe(false);
    });
  });

  describe("machineUsageQuerySchema", () => {
    test("validates machineId and bounded limit", () => {
      const res = machineUsageQuerySchema.safeParse({ machineId: "7", limit: "25" });
      expect(res.success).toBe(true);
      expect(res.data.machineId).toBe(7);
      expect(res.data.limit).toBe(25);
    });

    test("rejects missing machineId or out-of-range limit", () => {
      expect(machineUsageQuerySchema.safeParse({}).success).toBe(false);
      expect(machineUsageQuerySchema.safeParse({ machineId: "abc" }).success).toBe(false);
      expect(machineUsageQuerySchema.safeParse({ machineId: "1", limit: "0" }).success).toBe(false);
      expect(machineUsageQuerySchema.safeParse({ machineId: "1", limit: "201" }).success).toBe(false);
      expect(machineUsageQuerySchema.safeParse({ machineId: "1", limit: "abc" }).success).toBe(false);
    });
  });

  describe("dateService duration helpers", () => {
    test("formatDuration computes human readable duration between two dates", () => {
      const start = new Date("2026-10-28T10:00:00Z");
      const end45m = new Date("2026-10-28T10:45:00Z");
      const end2h15 = new Date("2026-10-28T12:15:00Z");

      expect(formatDuration(start, end45m)).toBe("45 min");
      expect(formatDuration(start, end2h15)).toBe("2h15");
      expect(formatDuration(null, end45m)).toBe("-");
    });

    test("formatDurationSeconds formats seconds into minutes and hours", () => {
      expect(formatDurationSeconds(30)).toBe("30s");
      expect(formatDurationSeconds(1800)).toBe("30 min");
      expect(formatDurationSeconds(7200)).toBe("2h");
      expect(formatDurationSeconds(8100)).toBe("2h15");
      expect(formatDurationSeconds(null)).toBe("-");
    });
  });

  describe("checkApiKeyOrSession middleware (Fail-Closed)", () => {
    const originalEnv = process.env.FABTRACK_API_KEY;
    const originalMachineEnv = process.env.MACHINE_API_KEY;

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.FABTRACK_API_KEY = originalEnv;
      } else {
        delete process.env.FABTRACK_API_KEY;
      }
      if (originalMachineEnv !== undefined) {
        process.env.MACHINE_API_KEY = originalMachineEnv;
      } else {
        delete process.env.MACHINE_API_KEY;
      }
      jest.restoreAllMocks();
    });

    test("allows logged in session", async () => {
      const req = { session: { loggedin: true }, headers: {} };
      const res = createMockRes();
      const next = jest.fn();

      await checkApiKeyOrSession(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    test("returns 401 Fail-Closed when no API key is configured on server", async () => {
      delete process.env.FABTRACK_API_KEY;
      delete process.env.MACHINE_API_KEY;
      jest.spyOn(settingsService, "getSettings").mockResolvedValue({ api_machine_token: "" });

      const req = { session: {}, headers: {}, query: {} };
      const res = createMockRes();
      const next = jest.fn();

      await checkApiKeyOrSession(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: "UNAUTHORIZED",
        })
      );
    });

    test("validates x-api-key header when configured", async () => {
      process.env.FABTRACK_API_KEY = "SECRET_LAB_KEY_123";

      const req = { session: {}, headers: { "x-api-key": "SECRET_LAB_KEY_123" }, query: {} };
      const res = createMockRes();
      const next = jest.fn();

      await checkApiKeyOrSession(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    test("validates Authorization: Bearer token when configured", async () => {
      process.env.FABTRACK_API_KEY = "SECRET_LAB_KEY_123";

      const req = { session: {}, headers: { authorization: "Bearer SECRET_LAB_KEY_123" }, query: {} };
      const res = createMockRes();
      const next = jest.fn();

      await checkApiKeyOrSession(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    test("rejects 401 when key is only provided in ?apiKey= query string", async () => {
      process.env.FABTRACK_API_KEY = "SECRET_LAB_KEY_123";

      const req = { session: {}, headers: {}, query: { apiKey: "SECRET_LAB_KEY_123" } };
      const res = createMockRes();
      const next = jest.fn();

      await checkApiKeyOrSession(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: "UNAUTHORIZED",
        })
      );
    });

    test("validates key configured in database settings asynchronously when not set in env", async () => {
      delete process.env.FABTRACK_API_KEY;
      delete process.env.MACHINE_API_KEY;

      const spy = jest.spyOn(settingsService, "getSettings").mockResolvedValue({
        api_machine_token: "SETTINGS_KEY_456",
      });

      const req = { session: {}, headers: { "x-api-key": "SETTINGS_KEY_456" }, query: {} };
      const res = createMockRes();
      const next = jest.fn();

      await checkApiKeyOrSession(req, res, next);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledTimes(1);
    });

    test("rejects 401 when API key does not match", async () => {
      process.env.FABTRACK_API_KEY = "SECRET_LAB_KEY_123";

      const req = { session: {}, headers: { "x-api-key": "WRONG_KEY" }, query: {} };
      const res = createMockRes();
      const next = jest.fn();

      await checkApiKeyOrSession(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: "UNAUTHORIZED",
        })
      );
    });
  });

  describe("MachineUsageService (R-006 security & business rules)", () => {
    let mockPrisma;
    let service;

    const baseUser = {
      id: 10,
      name: "Alice",
      surname: "Martin",
      email: "alice@example.org",
      rfid: "BADGE_ALICE",
      token: "SECRET_TOKEN",
      balance: 25,
      termsAccepted: true,
      isExpert: false,
      deletedAt: null,
      usertype: { id: 1, name: "Étudiant" },
    };

    const baseVisit = {
      id: 50,
      userId: 10,
      arrival: new Date(),
      departure: null,
      workspaceId: 1,
      workspace: { id: 1, name: "Atelier principal" },
    };

    const baseMachine = {
      id: 3,
      name: "Prusa MK4",
      make: "Prusa",
      model: "MK4",
      accessId: 2,
      access: { id: 2, name: "Niveau Atelier 3D" },
      machinetype: { id: 1, name: "Imprimante 3D" },
    };

    beforeEach(() => {
      mockPrisma = createMockPrisma();
      service = new MachineUsageService({
        prisma: mockPrisma,
        logger: { logThat: jest.fn() },
      });
    });

    test("verifyUserPresenceByCard minimizes user PII (never leaks email, rfid, token or balance)", async () => {
      mockPrisma.user.findFirst.mockResolvedValue(baseUser);
      mockPrisma.history.findFirst.mockResolvedValue(baseVisit);
      mockPrisma.warning.findMany.mockResolvedValue([]);
      mockPrisma.machine.findUnique.mockResolvedValue(baseMachine);
      mockPrisma.workshop.findMany.mockResolvedValue([]);

      const res = await service.verifyUserPresenceByCard({ rfid: "BADGE_ALICE", machineId: 3 });

      expect(res.success).toBe(true);
      expect(res.canUnlock).toBe(true);
      expect(res.user).toEqual({
        id: 10,
        name: "Alice",
        surname: "Martin",
        usertype: "Étudiant",
        isExpert: false,
      });
      expect(res.user.email).toBeUndefined();
      expect(res.user.rfid).toBeUndefined();
      expect(res.user.token).toBeUndefined();
      expect(res.user.balance).toBeUndefined();
    });

    test("verifyUserPresenceByCard restricts presence lookup to today (arrival >= start of day)", async () => {
      mockPrisma.user.findFirst.mockResolvedValue(baseUser);
      mockPrisma.history.findFirst.mockResolvedValue(null);

      const res = await service.verifyUserPresenceByCard({ rfid: "BADGE_ALICE" });

      expect(res.success).toBe(false);
      expect(res.code).toBe("NOT_CHECKED_IN");
      expect(res.canUnlock).toBe(false);
      expect(res.user.email).toBeUndefined();

      const historyWhere = mockPrisma.history.findFirst.mock.calls[0][0].where;
      expect(historyWhere.userId).toBe(10);
      expect(historyWhere.departure).toBeNull();
      expect(historyWhere.arrival.gte).toBeInstanceOf(Date);
      expect(historyWhere.arrival.gte.getHours()).toBe(0);
    });

    test("verifyUserPresenceByCard blocks unlock when user has an active warning (Arbitration 2A)", async () => {
      mockPrisma.user.findFirst.mockResolvedValue(baseUser);
      mockPrisma.history.findFirst.mockResolvedValue(baseVisit);
      mockPrisma.warning.findMany.mockResolvedValue([
        {
          id: 99,
          active: true,
          comments: "Zone laser non nettoyée",
          createdAt: new Date("2026-11-20T10:00:00Z"),
          warningtype: { name: "Sécurité" },
        },
      ]);

      const res = await service.verifyUserPresenceByCard({ rfid: "BADGE_ALICE", machineId: 3 });

      expect(res.success).toBe(false);
      expect(res.code).toBe("ACTIVE_WARNING");
      expect(res.canUnlock).toBe(false);
      expect(res.isPresent).toBe(true);
      expect(res.user.email).toBeUndefined();
    });

    test("verifyUserPresenceByCard returns MACHINE_NOT_FOUND for unknown machineId", async () => {
      mockPrisma.user.findFirst.mockResolvedValue(baseUser);
      mockPrisma.history.findFirst.mockResolvedValue(baseVisit);
      mockPrisma.warning.findMany.mockResolvedValue([]);
      mockPrisma.machine.findUnique.mockResolvedValue(null);

      const res = await service.verifyUserPresenceByCard({ rfid: "BADGE_ALICE", machineId: 999 });

      expect(res.success).toBe(false);
      expect(res.code).toBe("MACHINE_NOT_FOUND");
      expect(res.canUnlock).toBe(false);
    });

    test("verifyUserPresenceByCard enforces active workshop completion (Arbitration 1A)", async () => {
      mockPrisma.user.findFirst.mockResolvedValue(baseUser);
      mockPrisma.history.findFirst.mockResolvedValue(baseVisit);
      mockPrisma.warning.findMany.mockResolvedValue([]);
      mockPrisma.machine.findUnique.mockResolvedValue(baseMachine);
      mockPrisma.workshop.findMany.mockResolvedValue([{ id: 7, name: "Initiation Impression 3D" }]);
      mockPrisma.userWorkshopCompletion.findFirst.mockResolvedValue(null);

      const denied = await service.verifyUserPresenceByCard({ rfid: "BADGE_ALICE", machineId: 3 });
      expect(denied.success).toBe(false);
      expect(denied.code).toBe("MACHINE_ACCESS_DENIED");
      expect(denied.canUnlock).toBe(false);
      expect(denied.requiredWorkshops).toEqual(["Initiation Impression 3D"]);

      mockPrisma.userWorkshopCompletion.findFirst.mockResolvedValue({ id: 1 });
      const grantedByWorkshop = await service.verifyUserPresenceByCard({ rfid: "BADGE_ALICE", machineId: 3 });
      expect(grantedByWorkshop.success).toBe(true);
      expect(grantedByWorkshop.canUnlock).toBe(true);

      mockPrisma.user.findFirst.mockResolvedValue({ ...baseUser, isExpert: true });
      mockPrisma.userWorkshopCompletion.findFirst.mockResolvedValue(null);
      const grantedByExpert = await service.verifyUserPresenceByCard({ rfid: "BADGE_ALICE", machineId: 3 });
      expect(grantedByExpert.success).toBe(true);
      expect(grantedByExpert.canUnlock).toBe(true);
    });

    test("_resolveUser filters deletedAt: null even when resolving by userId", async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      const user = await service._resolveUser({ userId: 10 });
      expect(user).toBeNull();
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 10, deletedAt: null },
        include: { usertype: true },
      });
    });

    test("startMachineUsage blocks unaccepted charter and IDOR foreign historyId", async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ ...baseUser, termsAccepted: false });
      const resTerms = await service.startMachineUsage({ rfid: "BADGE_ALICE", machineId: 3 });
      expect(resTerms.success).toBe(false);
      expect(resTerms.code).toBe("TERMS_NOT_ACCEPTED");

      mockPrisma.user.findFirst.mockResolvedValue(baseUser);
      mockPrisma.machine.findUnique.mockResolvedValue(baseMachine);
      mockPrisma.history.findFirst.mockResolvedValue(null);
      const resIdor = await service.startMachineUsage({ rfid: "BADGE_ALICE", machineId: 3, historyId: 9999 });
      expect(resIdor.success).toBe(false);
      expect(resIdor.code).toBe("INVALID_HISTORY");
      expect(mockPrisma.activity.create).not.toHaveBeenCalled();
    });

    test("endMachineUsage returns USER_NOT_FOUND for unknown rfid without closing another user's session", async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const res = await service.endMachineUsage({ machineId: 3, rfid: "UNKNOWN_BADGE" });

      expect(res.success).toBe(false);
      expect(res.code).toBe("USER_NOT_FOUND");
      expect(mockPrisma.activity.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.activity.update).not.toHaveBeenCalled();
    });

    test("endMachineUsage rejects non-MACHINE or already closed activityId", async () => {
      mockPrisma.activity.findUnique.mockResolvedValue({
        id: 77,
        userId: 10,
        resourceType: "CONSUMABLE",
        endedAt: null,
      });
      const resType = await service.endMachineUsage({ activityId: 77 });
      expect(resType.success).toBe(false);
      expect(resType.code).toBe("ACTIVITY_NOT_FOUND");

      mockPrisma.activity.findUnique.mockResolvedValue({
        id: 78,
        userId: 10,
        resourceType: "MACHINE",
        endedAt: new Date(),
      });
      const resClosed = await service.endMachineUsage({ activityId: 78 });
      expect(resClosed.success).toBe(false);
      expect(resClosed.code).toBe("ACTIVITY_NOT_FOUND");
      expect(mockPrisma.activity.update).not.toHaveBeenCalled();
    });

    test("endMachineUsage rejects endedAt earlier than session startedAt", async () => {
      mockPrisma.activity.findUnique.mockResolvedValue({
        id: 79,
        userId: 10,
        resourceId: 3,
        resourceType: "MACHINE",
        startedAt: new Date("2026-11-21T14:00:00Z"),
        endedAt: null,
      });

      const res = await service.endMachineUsage({
        activityId: 79,
        endedAt: "2026-11-21T13:00:00Z",
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe("INVALID_DATE_RANGE");
      expect(mockPrisma.activity.update).not.toHaveBeenCalled();
    });

    test("getMachineUsageHistory restricts User select fields and bounds limit to 1..200", async () => {
      await expect(service.getMachineUsageHistory("abc")).rejects.toThrow();
      await expect(service.getMachineUsageHistory(0)).rejects.toThrow();

      mockPrisma.activity.findMany.mockResolvedValue([]);
      await service.getMachineUsageHistory(3, 500);

      expect(mockPrisma.activity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 200,
          include: expect.objectContaining({
            user: {
              select: {
                id: true,
                name: true,
                surname: true,
              },
            },
          }),
        })
      );

      await service.getMachineUsageHistory(3, 10, { includeEmail: true });
      expect(mockPrisma.activity.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          take: 10,
          include: expect.objectContaining({
            user: {
              select: {
                id: true,
                name: true,
                surname: true,
                email: true,
              },
            },
          }),
        })
      );
    });
  });
});
