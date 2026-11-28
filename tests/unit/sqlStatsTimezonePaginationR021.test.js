const fs = require("fs");
const path = require("path");
const express = require("express");
const request = require("supertest");

const timezoneHelper = require("../../utilities/timezoneHelper.js");

const mockRoutePrisma = {
  user: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  project: {
    findMany: jest.fn(),
  },
  userProject: {
    findMany: jest.fn(),
  },
  history: {
    findMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
};

jest.mock("../../services/staffSessionService.js", () => ({
  verifyActiveStaffSession: jest.fn(async () => ({ valid: true })),
  invalidateStaffSessionCache: jest.fn(),
}));

jest.mock("../../utilities/db", () => ({
  prisma: mockRoutePrisma,
  ResourceType: { MACHINE: "MACHINE", EQUIPMENT: "EQUIPMENT", CONSUMABLE: "CONSUMABLE" },
  ConsumableStatus: { AVAILABLE: "AVAILABLE", LOW_STOCK: "LOW_STOCK", OUT_OF_STOCK: "OUT_OF_STOCK" },
}));

jest.mock("@prisma/client", () => {
  const actual = jest.requireActual("@prisma/client");
  return {
    ...actual,
    PrismaClient: jest.fn(() => mockRoutePrisma),
  };
});

const { StatisticsService, buildTimelineAndWeekdays } = require("../../services/statisticsService.js");
const bookstackService = require("../../services/bookstackService.js");
const apiRouter = require("../../routes/api.js");
const usersRouter = require("../../routes/users.js");
const adminIndexRouter = require("../../routes/admin/index.js");

describe("R-021: SQL statistics, APP_TIMEZONE, server pagination, kiosk search & BookStack hardening", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("1. timezoneHelper (CET/CEST DST, ISO week-year & bounded loop)", () => {
    test("computes exact Europe/Paris day bounds in winter (CET +01:00) and summer (CEST +02:00)", () => {
      const winter = timezoneHelper.getZonedDayBounds("2026-01-15", "Europe/Paris");
      expect(winter.start.toISOString()).toBe("2026-01-14T23:00:00.000Z");
      expect(winter.end.toISOString()).toBe("2026-01-15T22:59:59.999Z");

      const summer = timezoneHelper.getZonedDayBounds("2026-07-15", "Europe/Paris");
      expect(summer.start.toISOString()).toBe("2026-07-14T22:00:00.000Z");
      expect(summer.end.toISOString()).toBe("2026-07-15T21:59:59.999Z");
    });

    test("computes authoritative ISO week-year across Dec 31 and Jan 1 boundaries", () => {
      const dec31_2024 = timezoneHelper.getIsoWeekYearAndNumber(new Date("2024-12-31T12:00:00Z"), "Europe/Paris");
      expect(dec31_2024.isoYear).toBe(2025);
      expect(dec31_2024.isoWeek).toBe(1);
      expect(dec31_2024.key).toBe("2025-W01");

      const jan1_2021 = timezoneHelper.getIsoWeekYearAndNumber(new Date("2021-01-01T12:00:00Z"), "Europe/Paris");
      expect(jan1_2021.isoYear).toBe(2020);
      expect(jan1_2021.isoWeek).toBe(53);
      expect(jan1_2021.key).toBe("2020-W53");

      const dec31_2026 = timezoneHelper.getIsoWeekYearAndNumber(new Date("2026-12-31T12:00:00Z"), "Europe/Paris");
      expect(dec31_2026.isoYear).toBe(2026);
      expect(dec31_2026.isoWeek).toBe(53);
      expect(dec31_2026.key).toBe("2026-W53");
    });

    test("enumerateWeekdayOccurrences counts exact weekdays and enforces maxDays bound", () => {
      expect(timezoneHelper.enumerateWeekdayOccurrences("2026-07-06", "2026-07-12")).toEqual([1, 1, 1, 1, 1, 1, 1]);
      expect(timezoneHelper.enumerateWeekdayOccurrences("2026-07-12", "2026-07-06")).toEqual([0, 0, 0, 0, 0, 0, 0]);
      const capped = timezoneHelper.enumerateWeekdayOccurrences("1900-01-01", "2100-01-01", 100);
      expect(capped.reduce((a, b) => a + b, 0)).toBe(100);
    });

    test("getAppTimezone honors valid APP_TIMEZONE and falls back safely to Europe/Paris", () => {
      expect(timezoneHelper.getAppTimezone({})).toBe("Europe/Paris");
      expect(timezoneHelper.getAppTimezone({ APP_TIMEZONE: "America/New_York" })).toBe("America/New_York");
      expect(timezoneHelper.getAppTimezone({ APP_TIMEZONE: "Invalid/Zone" })).toBe("Europe/Paris");
    });
  });

  describe("2. StatisticsService SQL aggregation & 5-min LRU cache", () => {
    test("aggregates KPIs and charts in SQL without raw History/Activity findMany and caches for 5 minutes", async () => {
      const mockStatsPrisma = {
        workspace: { findMany: jest.fn().mockResolvedValue([{ id: 1, name: "Atelier", location: "RDC" }]) },
        machine: { findMany: jest.fn().mockResolvedValue([{ id: 10, name: "Laser Trotec" }]) },
        consumable: {
          findMany: jest.fn().mockResolvedValue([
            { id: 20, name: "PLA Noir", cost: 0.05, unit: "g", stockUnit: "bobine", unitsPerPack: 1000 },
          ]),
        },
        project: { count: jest.fn().mockResolvedValue(4) },
        history: { findMany: jest.fn() },
        activity: { findMany: jest.fn() },
        $queryRaw: jest
          .fn()
          // a) visit KPIs
          .mockResolvedValueOnce([
            {
              totalVisits: BigInt(12),
              uniqueVisitors: BigInt(5),
              totalDurationMinutes: 600,
              completedVisitsCount: BigInt(10),
              minArrival: new Date("2024-12-31T10:00:00Z"),
              maxArrival: new Date("2025-01-20T14:00:00Z"),
            },
          ])
          // b) active projects
          .mockResolvedValueOnce([{ activeProjectsCount: BigInt(3) }])
          // c) machine activities
          .mockResolvedValueOnce([{ resourceId: 10, sessionCount: BigInt(7) }])
          // d) consumable activities
          .mockResolvedValueOnce([{ resourceId: 20, totalQty: BigInt(500), totalCost: 25.5 }])
          // e) hourly buckets (Dec 31 2024 => 2025-W01!)
          .mockResolvedValueOnce([
            { bucketUtc: "2024-12-31 10:00:00", cnt: BigInt(4) },
            { bucketUtc: "2025-01-20 14:00:00", cnt: BigInt(8) },
          ])
          // f) user types
          .mockResolvedValueOnce([{ label: "Étudiant", cnt: BigInt(12) }])
          // g) project types
          .mockResolvedValueOnce([{ label: "Projet perso", cnt: BigInt(12) }])
          // h) workspace summary
          .mockResolvedValueOnce([{ workspaceId: 1, totalVisits: BigInt(12), uniqueVisitors: BigInt(5) }]),
      };

      const service = new StatisticsService({ prisma: mockStatsPrisma, timeZone: "Europe/Paris" });
      const res1 = await service.getDashboardStats({
        period: "custom",
        startDate: "2024-12-31",
        endDate: "2025-01-20",
      });

      expect(mockStatsPrisma.history.findMany).not.toHaveBeenCalled();
      expect(mockStatsPrisma.activity.findMany).not.toHaveBeenCalled();
      expect(mockStatsPrisma.$queryRaw).toHaveBeenCalledTimes(8);
      expect(res1.kpis.totalVisits).toBe(12);
      expect(res1.kpis.uniqueVisitors).toBe(5);
      expect(res1.kpis.avgDurationFormatted).toBe("1h 00m");
      expect(res1.kpis.totalConsumablesCost).toBe("25.50");
      expect(res1.chartData.timelineLabels[0]).toBe("Sem. 1 (2025)");
      expect(res1.chartData.topMachineLabels).toEqual(["Laser Trotec"]);
      expect(res1.chartData.topConsumableCounts).toEqual([0.5]);

      // Second identical call hits 5-minute cache (no extra DB queries)
      const res2 = await service.getDashboardStats({
        period: "custom",
        startDate: "2024-12-31",
        endDate: "2025-01-20",
      });
      expect(mockStatsPrisma.$queryRaw).toHaveBeenCalledTimes(8);
      expect(res2.kpis.totalVisits).toBe(12);

      // invalidateCache clears cached entries
      service.invalidateCache();
      expect(service.cache.size).toBe(0);
    });

    test("buildTimelineAndWeekdays groups Dec 31 2024 into 2025-W01 accurately", () => {
      const result = buildTimelineAndWeekdays({
        hourlyBuckets: [{ bucketUtc: "2024-12-31 22:30:00", cnt: 3 }],
        startDateObj: new Date("2024-12-01T00:00:00Z"),
        endDateObj: new Date("2025-01-15T23:59:59Z"),
        filterStartDate: "2024-12-01",
        filterEndDate: "2025-01-15",
        timeZone: "Europe/Paris",
      });
      expect(result.timelineLabels).toEqual(["Sem. 1 (2025)"]);
      expect(result.timelineValues).toEqual([3]);
    });
  });

  describe("3. BookstackService bounded concurrency, AbortController timeout & LRU cache", () => {
    test("runWithConcurrency caps concurrent workers to limit and preserves item order", async () => {
      let active = 0;
      let maxActive = 0;
      const items = Array.from({ length: 12 }, (_, i) => i + 1);

      const results = await bookstackService.runWithConcurrency(items, 5, async (item) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return item * 10;
      });

      expect(maxActive).toBeLessThanOrEqual(5);
      expect(results).toEqual(items.map((x) => x * 10));
    });

    test("fetchWithTimeout aborts stalled fetch requests after timeoutMs", async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn((_url, { signal }) => {
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      });

      try {
        await expect(bookstackService.fetchWithTimeout("https://example.org", {}, 25)).rejects.toThrow(/aborted/i);
      } finally {
        global.fetch = originalFetch;
      }
    });

    test("clearCache resets the bounded BookStack LRU cache", () => {
      expect(bookstackService.CONCURRENCY_LIMIT).toBe(5);
      expect(bookstackService.MAX_CACHE_ENTRIES).toBe(500);
      expect(bookstackService.DEFAULT_FETCH_TIMEOUT_MS).toBe(5000);
      bookstackService.clearCache();
    });
  });

  describe("4. Server-side pagination & lightweight kiosk user search", () => {
    function buildApp(mountPath, router, role = "admin") {
      const app = express();
      app.use((req, res, next) => {
        req.session = { loggedin: true, role, username: "tester" };
        res.locals.currentLocale = "fr";
        res.render = (view, data) => res.status(200).json({ view, data });
        next();
      });
      app.use(mountPath, router);
      return app;
    }

    test("GET /api/users/search queries deletedAt:null with limit<=20 and strips PII", async () => {
      mockRoutePrisma.user.findMany.mockResolvedValue([
        {
          id: 7,
          name: "Ada",
          surname: "Lovelace",
          termsAccepted: true,
          projects: [{ id: 1, userId: 7, projectId: 3 }],
        },
      ]);

      const app = buildApp("/api", apiRouter, "user");
      const res = await request(app).get("/api/users/search?q=Ada+Love&limit=20");

      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(1);
      expect(res.body.users[0]).toEqual({
        id: 7,
        fullname: "Ada Lovelace",
        termsAccepted: true,
        projects: JSON.stringify([{ id: 1, userId: 7, projectId: 3 }]),
      });
      expect(res.body.users[0]).not.toHaveProperty("email");
      expect(res.body.users[0]).not.toHaveProperty("rfid");

      const findCall = mockRoutePrisma.user.findMany.mock.calls[0][0];
      expect(findCall.where.deletedAt).toBeNull();
      expect(findCall.take).toBe(20);
      expect(findCall.where.AND).toHaveLength(2);
    });

    test("GET /api/list/autocomplete-lists?scope=projects skips prisma.user.findMany entirely", async () => {
      mockRoutePrisma.project.findMany.mockResolvedValue([]);
      mockRoutePrisma.userProject.findMany.mockResolvedValue([]);

      const app = buildApp("/api", apiRouter, "user");
      const res = await request(app).get("/api/list/autocomplete-lists?scope=projects");

      expect(res.status).toBe(200);
      expect(res.body.userlist).toEqual([]);
      expect(mockRoutePrisma.user.findMany).not.toHaveBeenCalled();
    });

    test("GET /users/manage paginates in SQL and enforces deletedAt:null", async () => {
      mockRoutePrisma.user.findMany.mockResolvedValue([]);
      mockRoutePrisma.user.count
        .mockResolvedValueOnce(45) // totalFiltered
        .mockResolvedValueOnce(120) // totalActiveUsers
        .mockResolvedValueOnce(100); // signedCount

      const app = buildApp("/users", usersRouter, "admin");
      const res = await request(app).get("/users/manage?page=2&limit=20&search=curie&charter=signed");

      expect(res.status).toBe(200);
      expect(res.body.view).toBe("admin/manage-users");
      expect(res.body.data.currentPage).toBe(2);
      expect(res.body.data.totalPages).toBe(3);
      expect(res.body.data.totalActiveUsers).toBe(120);
      expect(res.body.data.signedCount).toBe(100);
      expect(res.body.data.pendingCount).toBe(20);

      const queryArgs = mockRoutePrisma.user.findMany.mock.calls[0][0];
      expect(queryArgs.skip).toBe(20);
      expect(queryArgs.take).toBe(20);
      expect(queryArgs.where.deletedAt).toBeNull();
      expect(queryArgs.where.termsAccepted).toBe(true);
    });

    test("GET /admin/view-history paginates in SQL with Europe/Paris CEST date bounds", async () => {
      mockRoutePrisma.history.findMany.mockResolvedValue([]);
      mockRoutePrisma.history.count
        .mockResolvedValueOnce(60) // totalCount
        .mockResolvedValueOnce(500); // grandTotalCount
      mockRoutePrisma.history.groupBy.mockResolvedValue([{ workspaceId: 3, _count: { id: 60 } }]);

      const app = buildApp("/admin", adminIndexRouter, "admin");
      const res = await request(app).get(
        "/admin/view-history?page=2&limit=25&workspaceId=3&startDate=2026-07-15&endDate=2026-07-15",
      );

      expect(res.status).toBe(200);
      expect(res.body.view).toBe("admin/view-history");
      expect(res.body.data.currentPage).toBe(2);
      expect(res.body.data.totalPages).toBe(3);
      expect(res.body.data.workspaceCountsMap[3]).toBe(60);

      const queryArgs = mockRoutePrisma.history.findMany.mock.calls[0][0];
      expect(queryArgs.skip).toBe(25);
      expect(queryArgs.take).toBe(25);
      expect(queryArgs.where.workspaceId).toBe(3);
      expect(queryArgs.where.arrival.gte.toISOString()).toBe("2026-07-14T22:00:00.000Z");
      expect(queryArgs.where.arrival.lte.toISOString()).toBe("2026-07-15T21:59:59.999Z");
    });

    test("public/javascripts/fabtrack.js uses debounced /api/users/search with AbortController and scope=projects", () => {
      const kioskJs = fs.readFileSync(path.join(__dirname, "../../public/javascripts/fabtrack.js"), "utf8");
      expect(kioskJs).toContain("api/list/autocomplete-lists?scope=projects");
      expect(kioskJs).toContain("api/users/search");
      expect(kioskJs).toContain("AbortController");
    });
  });
});
