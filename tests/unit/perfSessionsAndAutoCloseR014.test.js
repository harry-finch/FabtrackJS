const fs = require("fs");
const path = require("path");
const express = require("express");
const request = require("supertest");

const mockUnitPrisma = {
  staff: { findUnique: jest.fn() },
  consumable: { findMany: jest.fn() },
  history: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  warning: { findMany: jest.fn() },
  activity: { findMany: jest.fn() },
  workshop: { findMany: jest.fn() },
  user: { findFirst: jest.fn() },
  workspace: { findMany: jest.fn(async () => []) },
  systemSetting: { findMany: jest.fn(async () => []) },
  log: { create: jest.fn(async () => ({})) },
};

jest.mock("../../utilities/db", () => ({
  prisma: mockUnitPrisma,
  closePool: jest.fn(async () => {}),
}));

const { PrismaSessionStore } = require("../../services/prismaSessionStore");
const { ReferenceCacheService } = require("../../services/referenceCacheService");
const referenceCacheService = require("../../services/referenceCacheService");
const { invalidateCache } = require("../../middleware/cacheHelper");
const {
  VisitAutoCloseService,
  parseClosingTime,
  getStartOfDay,
  computeSafeDeparture,
} = require("../../services/visitAutoCloseService");

describe("Unit (R-014): SQL Indexes, MariaDB PrismaSessionStore, Global Cache & Visit Auto-Close", () => {
  describe("1. Prisma schema & schema.sql indexes + Session model", () => {
    const schemaPrisma = fs.readFileSync(path.join(__dirname, "../../prisma/schema.prisma"), "utf8");
    const schemaSql = fs.readFileSync(path.join(__dirname, "../../prisma/schema.sql"), "utf8");

    test("schema.prisma declares Session model and all critical composite indexes", () => {
      expect(schemaPrisma).toContain("model Session {");
      expect(schemaPrisma).toContain("@@index([expiresAt])");
      expect(schemaPrisma).toContain("@@index([workspaceId, departure, arrival])");
      expect(schemaPrisma).toContain("@@index([userId, departure, arrival])");
      expect(schemaPrisma).toContain("@@index([arrival])");
      expect(schemaPrisma).toContain("@@index([resourceType, returnedAt, userId])");
      expect(schemaPrisma).toContain("@@index([resourceType, resourceId, endedAt])");
      expect(schemaPrisma).toContain("@@index([createdAt])");
      expect(schemaPrisma).toContain("@@index([userId, active])");
      expect(schemaPrisma).toContain("@@index([timestamp])");
      expect(schemaPrisma).toContain("@@index([machineId, status, createdAt])");
    });

    test("schema.sql is synchronized with Session table and composite indexes", () => {
      expect(schemaSql).toContain("CREATE TABLE `Session`");
      expect(schemaSql).toContain("`Session_expiresAt_idx`");
      expect(schemaSql).toContain("`History_workspaceId_departure_arrival_idx`");
      expect(schemaSql).toContain("`History_userId_departure_arrival_idx`");
      expect(schemaSql).toContain("`Activity_resourceType_returnedAt_userId_idx`");
      expect(schemaSql).toContain("`Activity_resourceType_resourceId_endedAt_idx`");
      expect(schemaSql).toContain("`Warning_userId_active_idx`");
      expect(schemaSql).toContain("`Log_timestamp_idx`");
      expect(schemaSql).toContain("`MachineIssue_machineId_status_createdAt_idx`");
    });
  });

  describe("2. PrismaSessionStore (MariaDB persistent sessions)", () => {
    function createMockSessionPrisma() {
      const rows = new Map();
      return {
        rows,
        session: {
          findUnique: jest.fn(async ({ where }) => rows.get(where.sid) || null),
          upsert: jest.fn(async ({ where, update, create }) => {
            const existing = rows.get(where.sid);
            const next = existing ? { ...existing, ...update } : { ...create };
            rows.set(where.sid, next);
            return next;
          }),
          updateMany: jest.fn(async ({ where, data }) => {
            if (!rows.has(where.sid)) return { count: 0 };
            rows.set(where.sid, { ...rows.get(where.sid), ...data });
            return { count: 1 };
          }),
          deleteMany: jest.fn(async ({ where }) => {
            if (where.sid) {
              const existed = rows.delete(where.sid);
              return { count: existed ? 1 : 0 };
            }
            if (where.expiresAt && where.expiresAt.lte) {
              let count = 0;
              for (const [sid, rec] of rows.entries()) {
                if (new Date(rec.expiresAt).getTime() <= where.expiresAt.lte.getTime()) {
                  rows.delete(sid);
                  count += 1;
                }
              }
              return { count };
            }
            return { count: 0 };
          }),
        },
      };
    }

    test("persists, retrieves, touches, expires, destroys, and prunes sessions via Prisma", async () => {
      const mockPrisma = createMockSessionPrisma();
      const store = new PrismaSessionStore({ prisma: mockPrisma, ttlMs: 60000 });

      const sessPayload = {
        cookie: { originalMaxAge: 3600000, expires: new Date(Date.now() + 3600000) },
        loggedin: true,
        staffId: 1,
        role: "admin",
      };

      await new Promise((resolve, reject) => store.set("sid-1", sessPayload, (e) => (e ? reject(e) : resolve())));
      expect(mockPrisma.rows.has("sid-1")).toBe(true);

      // Simulate restart: new store instance backed by the same DB rows retrieves the session!
      const restartedStore = new PrismaSessionStore({ prisma: mockPrisma, ttlMs: 60000 });
      const loaded = await new Promise((resolve, reject) =>
        restartedStore.get("sid-1", (e, val) => (e ? reject(e) : resolve(val))),
      );
      expect(loaded).toMatchObject({ loggedin: true, staffId: 1, role: "admin" });

      // Touch extends expiresAt
      const newExpiry = new Date(Date.now() + 7200000);
      await new Promise((resolve, reject) =>
        restartedStore.touch("sid-1", { cookie: { expires: newExpiry } }, (e) => (e ? reject(e) : resolve())),
      );
      expect(mockPrisma.rows.get("sid-1").expiresAt.getTime()).toBe(newExpiry.getTime());

      // Expired session returns null and gets purged lazily
      mockPrisma.rows.set("sid-expired", {
        sid: "sid-expired",
        data: JSON.stringify({ loggedin: true }),
        expiresAt: new Date(Date.now() - 1000),
      });
      const expiredRes = await new Promise((resolve, reject) =>
        restartedStore.get("sid-expired", (e, val) => (e ? reject(e) : resolve(val))),
      );
      expect(expiredRes).toBeNull();
      expect(mockPrisma.rows.has("sid-expired")).toBe(false);

      // pruneExpired removes all expired rows
      mockPrisma.rows.set("sid-old", {
        sid: "sid-old",
        data: JSON.stringify({}),
        expiresAt: new Date(Date.now() - 5000),
      });
      const pruned = await restartedStore.pruneExpired();
      expect(pruned).toBe(1);
      expect(mockPrisma.rows.has("sid-old")).toBe(false);
      expect(mockPrisma.rows.has("sid-1")).toBe(true);

      // Destroy deletes active session
      await new Promise((resolve, reject) =>
        restartedStore.destroy("sid-1", (e) => (e ? reject(e) : resolve())),
      );
      expect(mockPrisma.rows.has("sid-1")).toBe(false);
    });

    test("app.createSessionStore uses MemoryStore fallback in test env and PrismaSessionStore in production", () => {
      const app = require("../../app");
      expect(app.createSessionStore({ NODE_ENV: "test" })).toBeUndefined();
      expect(app.createSessionStore({ NODE_ENV: "development", SESSION_STORE: "memory" })).toBeUndefined();
      const prodStore = app.createSessionStore({ NODE_ENV: "production", SESSION_DURATION: "3600000" });
      expect(prodStore).toBeInstanceOf(PrismaSessionStore);
      prodStore.stopCleanupTimer();
    });
  });

  describe("3. ReferenceCacheService & global invalidation", () => {
    function createMockRefPrisma(version = 1) {
      let v = version;
      return {
        bump: () => {
          v += 1;
        },
        workspace: { findMany: jest.fn(async () => [{ id: 1, name: `Lab v${v}` }]) },
        usertype: { findMany: jest.fn(async () => [{ id: 1, name: `Student v${v}` }]) },
        projecttype: { findMany: jest.fn(async () => [{ id: 1, name: `Motif v${v}` }]) },
        machineType: { findMany: jest.fn(async () => [{ id: 1, name: "FDM" }]) },
        warningtype: { findMany: jest.fn(async () => [{ id: 1, name: "Safety" }]) },
        category: { findMany: jest.fn(async () => [{ id: 1, name: "3D" }]) },
        location: { findMany: jest.fn(async () => [{ id: 1, name: "Salle A" }]) },
        access: { findMany: jest.fn(async () => [{ id: 1, name: "Libre" }]) },
        equipment: { findMany: jest.fn(async () => [{ id: 1, name: "Perceuse" }]) },
      };
    }

    test("caches reference data globally, deduplicates concurrent loads, and reloads immediately after invalidate()", async () => {
      const mockPrisma = createMockRefPrisma(1);
      const cache = new ReferenceCacheService({ prisma: mockPrisma, ttlMs: 60000 });

      // Two concurrent calls share a single DB round-trip
      const [first, second] = await Promise.all([cache.getReferenceData(), cache.getReferenceData()]);
      expect(first.projecttypes[0].name).toBe("Motif v1");
      expect(second.projecttypes[0].name).toBe("Motif v1");
      expect(mockPrisma.projecttype.findMany).toHaveBeenCalledTimes(1);

      // Admin mutates DB and calls invalidate() -> kiosk immediately sees v2
      mockPrisma.bump();
      cache.invalidate();
      const afterInvalidation = await cache.getReferenceData();
      expect(afterInvalidation.projecttypes[0].name).toBe("Motif v2");
      expect(afterInvalidation.workspaces[0].name).toBe("Lab v2");
      expect(mockPrisma.projecttype.findMany).toHaveBeenCalledTimes(2);
    });

    test("middleware/cacheHelper.invalidateCache() triggers global referenceCacheService.invalidate()", () => {
      const spy = jest.spyOn(referenceCacheService, "invalidate");
      invalidateCache({ session: { invalidateCache: true } });
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    test("app.js no longer exposes dead res.locals.machines or stores reference arrays in req.session", () => {
      const appSource = fs.readFileSync(path.join(__dirname, "../../app.js"), "utf8");
      expect(appSource).not.toContain("res.locals.machines");
      expect(appSource).not.toContain("req.session.usertypes");
      expect(appSource).not.toContain("req.session.availableWorkspaces");
    });
  });

  describe("4. VisitAutoCloseService, read-only GET /fabtrack/ & rfidPlugin today filter", () => {
    test("parseClosingTime and computeSafeDeparture guarantee departure >= arrival (zero negative duration)", () => {
      expect(parseClosingTime("19:15")).toEqual({ hour: 19, minute: 15 });
      expect(parseClosingTime("invalid")).toEqual({ hour: 18, minute: 30 });

      const morningArrival = new Date(2026, 10, 20, 10, 15, 0, 0);
      const depNormal = computeSafeDeparture(morningArrival, { hour: 18, minute: 30 });
      expect(depNormal.getHours()).toBe(18);
      expect(depNormal.getMinutes()).toBe(30);
      expect(depNormal.getTime()).toBeGreaterThan(morningArrival.getTime());

      // Late arrival after closing time: must clamp to arrival (0 min, never negative!)
      const lateArrival = new Date(2026, 10, 20, 20, 45, 0, 0);
      const depLate = computeSafeDeparture(lateArrival, { hour: 18, minute: 30 });
      expect(depLate.getTime()).toBe(lateArrival.getTime());
    });

    test("closeForgottenVisits closes previous-day open visits across all workspaces with updateMany", async () => {
      const now = new Date(2026, 10, 21, 9, 0, 0, 0);
      const y1 = new Date(2026, 10, 20, 10, 0, 0, 0);
      const y2 = new Date(2026, 10, 20, 14, 0, 0, 0);
      const yLate = new Date(2026, 10, 20, 20, 10, 0, 0);

      const mockPrisma = {
        history: {
          findMany: jest.fn(async () => [
            { id: 10, arrival: y1 },
            { id: 11, arrival: y2 },
            { id: 12, arrival: yLate },
          ]),
          updateMany: jest.fn(async ({ where }) => ({ count: where.id.in.length })),
        },
      };
      const mockSettings = {
        getSettings: jest.fn(async () => ({ visit_auto_close_time: "18:30" })),
      };
      const mockLogger = { logThat: jest.fn() };

      const service = new VisitAutoCloseService({
        prisma: mockPrisma,
        settingsService: mockSettings,
        logger: mockLogger,
      });

      const res = await service.closeForgottenVisits(now);
      expect(res.closedCount).toBe(3);

      // Query must filter strictly before startOfToday and NOT filter by workspaceId (all workspaces)
      const findWhere = mockPrisma.history.findMany.mock.calls[0][0].where;
      expect(findWhere.departure).toBeNull();
      expect(findWhere.workspaceId).toBeUndefined();
      expect(findWhere.arrival.lt.getTime()).toBe(getStartOfDay(now).getTime());

      // 2 batched updateMany calls: [10, 11] at 18:30, and [12] clamped at 20:10
      expect(mockPrisma.history.updateMany).toHaveBeenCalledTimes(2);
      const call1 = mockPrisma.history.updateMany.mock.calls[0][0];
      const call2 = mockPrisma.history.updateMany.mock.calls[1][0];
      expect(call1.where.id.in).toEqual([10, 11]);
      expect(call1.data.departure.getHours()).toBe(18);
      expect(call1.data.departure.getMinutes()).toBe(30);
      expect(call2.where.id.in).toEqual([12]);
      expect(call2.data.departure.getTime()).toBe(yLate.getTime());
      expect(mockLogger.logThat).toHaveBeenCalledTimes(1);
    });

    test("GET /fabtrack/ is strictly read-only, filters today's arrivals, and never wipes present visitors", async () => {
      const staffSessionService = require("../../services/staffSessionService");
      staffSessionService.clearCache();

      const todayArrival = new Date();
      todayArrival.setHours(Math.max(0, todayArrival.getHours() - 1), 0, 0, 0);

      mockUnitPrisma.staff.findUnique.mockResolvedValue({
        id: 1,
        name: "kiosk",
        role: "user",
        approved: true,
      });
      mockUnitPrisma.consumable.findMany.mockResolvedValue([]);
      mockUnitPrisma.history.findMany.mockClear();
      mockUnitPrisma.history.findMany.mockResolvedValue([
        { id: 99, userId: 7, arrival: todayArrival, departure: null, user: { id: 7, name: "Ada" } },
      ]);
      mockUnitPrisma.history.update.mockClear();
      mockUnitPrisma.warning.findMany.mockResolvedValue([]);
      mockUnitPrisma.activity.findMany.mockResolvedValue([]);
      mockUnitPrisma.workshop.findMany.mockResolvedValue([]);

      const fabtrackRouter = require("../../routes/fabtrack");
      const app = express();
      app.use((req, res, next) => {
        req.session = {
          loggedin: true,
          staffId: 1,
          role: "user",
          username: "kiosk",
          selectedWorkspace: { id: 2, name: "Lab" },
        };
        res.render = (view, locals) => res.status(200).json({ view, locals });
        next();
      });
      app.use("/fabtrack", fabtrackRouter);

      const res = await request(app).get("/fabtrack/");
      expect(res.status).toBe(200);
      expect(res.body.locals.history).toHaveLength(1);
      expect(mockUnitPrisma.history.update).not.toHaveBeenCalled();

      const whereArg = mockUnitPrisma.history.findMany.mock.calls[0][0].where;
      expect(whereArg.departure).toBeNull();
      expect(whereArg.arrival).toBeDefined();
      expect(whereArg.arrival.gte).toBeInstanceOf(Date);
      expect(whereArg.arrival.gte.getHours()).toBe(0);
      expect(whereArg.arrival.gte.getMinutes()).toBe(0);
    });

    test("plugins/rfidPlugin.js filters open visits on today's date (arrival >= startOfToday)", async () => {
      const rfidPlugin = require("../../plugins/rfidPlugin");
      const logger = require("../../utilities/simpleLogger");

      const hooks = new Map();
      const fakeHookManager = {
        addHook: (name, fn) => hooks.set(name, fn),
      };
      rfidPlugin.register(fakeHookManager);
      const scanHandler = hooks.get("rfid:scan");

      mockUnitPrisma.user.findFirst.mockResolvedValue({
        id: 5,
        name: "Grace",
        surname: "Hopper",
        rfid: "BADGE-TODAY-01",
        termsAccepted: true,
        usertype: { name: "Student" },
      });
      mockUnitPrisma.history.findFirst.mockClear();
      mockUnitPrisma.history.findFirst.mockResolvedValue(null);
      mockUnitPrisma.history.create.mockClear();
      mockUnitPrisma.history.create.mockResolvedValue({ id: 501 });
      const logSpy = jest.spyOn(logger, "logThat").mockImplementation(() => {});

      const result = await scanHandler({
        rfid: "BADGE-TODAY-01",
        workspaceId: 1,
        staffUsername: "kiosk",
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe("checkin");
      expect(mockUnitPrisma.history.create).toHaveBeenCalledTimes(1);

      const whereArg = mockUnitPrisma.history.findFirst.mock.calls[0][0].where;
      expect(whereArg.departure).toBeNull();
      expect(whereArg.arrival).toBeDefined();
      expect(whereArg.arrival.gte).toBeInstanceOf(Date);
      expect(whereArg.arrival.gte.getHours()).toBe(0);
      expect(whereArg.arrival.gte.getMinutes()).toBe(0);

      logSpy.mockRestore();
    });
  });
});
