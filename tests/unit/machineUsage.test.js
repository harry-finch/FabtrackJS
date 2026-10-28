const {
  verifyCardUserSchema,
  startMachineUsageSchema,
  endMachineUsageSchema,
  recordMachineUsageSchema,
} = require("../../schemas");
const { formatDuration, formatDurationSeconds } = require("../../services/dateService");
const checkApiKeyOrSession = require("../../middleware/checkApiKeyOrSession");

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
      const res = verifyCardUserSchema.safeParse({ rfid: "   " });
      expect(res.success).toBe(false);
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

    test("rejects when machineId is missing", () => {
      const res = startMachineUsageSchema.safeParse({ rfid: "CARD_123" });
      expect(res.success).toBe(false);
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

  describe("checkApiKeyOrSession middleware", () => {
    const originalEnv = process.env.FABTRACK_API_KEY;

    afterEach(() => {
      process.env.FABTRACK_API_KEY = originalEnv;
    });

    test("allows logged in session", () => {
      const req = { session: { loggedin: true }, headers: {} };
      const res = {};
      const next = jest.fn();

      checkApiKeyOrSession(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test("allows request when no API key configured on server", () => {
      delete process.env.FABTRACK_API_KEY;
      delete process.env.MACHINE_API_KEY;

      const req = { session: {}, headers: {}, query: {} };
      const res = {};
      const next = jest.fn();

      checkApiKeyOrSession(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test("validates x-api-key header when configured", () => {
      process.env.FABTRACK_API_KEY = "SECRET_LAB_KEY_123";

      const req = { session: {}, headers: { "x-api-key": "SECRET_LAB_KEY_123" }, query: {} };
      const res = {};
      const next = jest.fn();

      checkApiKeyOrSession(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test("validates Authorization: Bearer token when configured", () => {
      process.env.FABTRACK_API_KEY = "SECRET_LAB_KEY_123";

      const req = { session: {}, headers: { authorization: "Bearer SECRET_LAB_KEY_123" }, query: {} };
      const res = {};
      const next = jest.fn();

      checkApiKeyOrSession(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test("rejects 401 when API key does not match", () => {
      process.env.FABTRACK_API_KEY = "SECRET_LAB_KEY_123";

      const req = { session: {}, headers: { "x-api-key": "WRONG_KEY" }, query: {} };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      checkApiKeyOrSession(req, res, next);
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
});

