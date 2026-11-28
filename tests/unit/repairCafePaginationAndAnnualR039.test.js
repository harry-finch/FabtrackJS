const path = require("path");
const ejs = require("ejs");
const express = require("express");
const request = require("supertest");

const ROOT_DIR = path.resolve(__dirname, "../..");
const { getZonedYearBounds } = require("../../utilities/timezoneHelper.js");
const { repairCafeQuerySchema } = require("../../schemas/admin.schema.js");

const mockDb = {
  rows: [],
};

function matchesWhere(row, where) {
  if (!where) return true;
  if (where.AND) return where.AND.every((clause) => matchesWhere(row, clause));
  if (where.OR) return where.OR.some((clause) => matchesWhere(row, clause));

  if (where.repairObject !== undefined) {
    if (where.repairObject && where.repairObject.not === null) {
      if (row.repairObject == null) return false;
    } else if (where.repairObject && typeof where.repairObject.contains === "string") {
      if (!String(row.repairObject || "").toLowerCase().includes(where.repairObject.contains.toLowerCase())) {
        return false;
      }
    }
  }

  if (where.repairNotes !== undefined && where.repairNotes && typeof where.repairNotes.contains === "string") {
    if (!String(row.repairNotes || "").toLowerCase().includes(where.repairNotes.contains.toLowerCase())) {
      return false;
    }
  }

  if (where.repairStatus !== undefined) {
    if (where.repairStatus === null) {
      if (row.repairStatus !== null && row.repairStatus !== undefined) return false;
    } else if (typeof where.repairStatus === "object" && where.repairStatus.not === null) {
      if (row.repairStatus == null) return false;
    } else if (row.repairStatus !== where.repairStatus) {
      return false;
    }
  }

  if (where.arrival !== undefined) {
    const t = new Date(row.arrival).getTime();
    if (where.arrival.gte && t < new Date(where.arrival.gte).getTime()) return false;
    if (where.arrival.lt && t >= new Date(where.arrival.lt).getTime()) return false;
  }

  if (where.user !== undefined) {
    if (!row.user) return false;
    for (const field of ["name", "surname", "email"]) {
      if (where.user[field] && typeof where.user[field].contains === "string") {
        if (!String(row.user[field] || "").toLowerCase().includes(where.user[field].contains.toLowerCase())) {
          return false;
        }
      }
    }
  }

  return true;
}

const mockPrisma = {
  history: {
    count: jest.fn(async ({ where } = {}) => mockDb.rows.filter((r) => matchesWhere(r, where)).length),
    findMany: jest.fn(async ({ where, orderBy, skip = 0, take } = {}) => {
      let filtered = mockDb.rows.filter((r) => matchesWhere(r, where));
      if (Array.isArray(orderBy)) {
        filtered = [...filtered].sort((a, b) => {
          for (const rule of orderBy) {
            if (rule.arrival) {
              const diff = new Date(b.arrival).getTime() - new Date(a.arrival).getTime();
              if (diff !== 0) return rule.arrival === "desc" ? diff : -diff;
            }
            if (rule.id) {
              const diff = b.id - a.id;
              if (diff !== 0) return rule.id === "desc" ? diff : -diff;
            }
          }
          return 0;
        });
      }
      if (typeof take === "number") {
        return filtered.slice(skip, skip + take);
      }
      return filtered.slice(skip);
    }),
  },
  staff: {
    findUnique: jest.fn().mockResolvedValue({ id: 1, name: "admin", role: "admin", approved: true }),
  },
};

jest.mock("../../utilities/db.js", () => ({ prisma: mockPrisma }));
jest.mock("../../utilities/db", () => ({ prisma: mockPrisma }));
jest.mock("../../services/settingsService.js", () => ({
  getSettings: jest.fn().mockResolvedValue({ plugin_repaircafe_enabled: "true", repaircafe_projecttype_name: "Repair Café" }),
  getSetting: jest.fn().mockResolvedValue("Repair Café"),
}));
jest.mock("../../services/staffSessionService.js", () => ({
  verifyActiveStaffSession: jest.fn().mockResolvedValue({
    valid: true,
    staff: { id: 1, name: "admin", role: "admin", approved: true },
  }),
}));

const repairCafeService = require("../../services/repairCafeService.js");
const repairCafeRouter = require("../../routes/admin/repair-cafe.js");

describe("Unit R-039: Repair Café Pagination (25/page), Cross-Year Search & Annual KPIs", () => {
  beforeEach(() => {
    mockDb.rows = [];
    jest.clearAllMocks();
  });

  test("getZonedYearBounds classifies Dec 31 23:30 UTC as Jan 1 of next year in Europe/Paris", () => {
    const bounds2026 = getZonedYearBounds(new Date("2026-06-15T12:00:00Z"), "Europe/Paris");
    expect(bounds2026.year).toBe(2026);

    const dec31Local2330 = new Date("2026-12-31T22:30:00Z"); // 23:30 CET on Dec 31, 2026
    const jan01Local0030 = new Date("2026-12-31T23:30:00Z"); // 00:30 CET on Jan 1, 2027

    expect(dec31Local2330 >= bounds2026.start && dec31Local2330 < bounds2026.nextYearStart).toBe(true);
    expect(jan01Local0030 >= bounds2026.start && jan01Local0030 < bounds2026.nextYearStart).toBe(false);

    const bounds2027 = getZonedYearBounds(jan01Local0030, "Europe/Paris");
    expect(bounds2027.year).toBe(2027);
    expect(jan01Local0030 >= bounds2027.start && jan01Local0030 < bounds2027.nextYearStart).toBe(true);
  });

  test("paginates 26 interventions into 25 on page 1 and 1 on page 2 with stable ordering on equal timestamps", async () => {
    const sharedDate = new Date("2026-05-10T14:00:00Z");
    for (let i = 1; i <= 26; i++) {
      mockDb.rows.push({
        id: i,
        userId: i,
        arrival: sharedDate,
        departure: sharedDate,
        repairObject: `Objet ${i}`,
        repairStatus: "REPAIRED",
        repairNotes: "",
        user: { id: i, name: `Prenom${i}`, surname: `Nom${i}`, email: `u${i}@example.org` },
        workspace: { id: 1, name: "Lab" },
      });
    }

    const p1 = await repairCafeService.getRepairStats({ page: 1, referenceDate: sharedDate, timeZone: "Europe/Paris" });
    const p2 = await repairCafeService.getRepairStats({ page: 2, referenceDate: sharedDate, timeZone: "Europe/Paris" });

    expect(p1.records).toHaveLength(25);
    expect(p2.records).toHaveLength(1);
    expect(p1.pagination).toMatchObject({ page: 1, pageSize: 25, totalCount: 26, totalPages: 2, hasPrev: false, hasNext: true });
    expect(p2.pagination).toMatchObject({ page: 2, pageSize: 25, totalCount: 26, totalPages: 2, hasPrev: true, hasNext: false });

    const ids1 = p1.records.map((r) => r.id);
    const ids2 = p2.records.map((r) => r.id);
    expect(ids1[0]).toBe(26);
    expect(ids2[0]).toBe(1);
    expect(new Set([...ids1, ...ids2]).size).toBe(26);
  });

  test("searches across previous years, combines with status filter, and keeps current-year KPIs unaffected", async () => {
    // 2025 older record (outside 2026 annual KPIs)
    mockDb.rows.push({
      id: 100,
      userId: 10,
      arrival: new Date("2025-03-12T10:00:00Z"),
      departure: new Date("2025-03-12T12:00:00Z"),
      repairObject: "Grille-pain vintage",
      repairStatus: "NOT_REPAIRED",
      repairNotes: "Résistance coupée",
      user: { id: 10, name: "Alice", surname: "Durand", email: "alice@example.org" },
      workspace: { id: 1, name: "Lab" },
    });
    // Two 2026 visits from same contributor + one from another contributor
    mockDb.rows.push(
      {
        id: 201,
        userId: 20,
        arrival: new Date("2026-02-01T10:00:00Z"),
        departure: new Date("2026-02-01T11:00:00Z"),
        repairObject: "Cafetière Seb",
        repairStatus: "REPAIRED",
        repairNotes: "",
        user: { id: 20, name: "Bob", surname: "Martin", email: "bob@example.org" },
        workspace: { id: 1, name: "Lab" },
      },
      {
        id: 202,
        userId: 20,
        arrival: new Date("2026-04-01T10:00:00Z"),
        departure: new Date("2026-04-01T11:00:00Z"),
        repairObject: "Lampe de bureau",
        repairStatus: "PARTIALLY_REPAIRED",
        repairNotes: "",
        user: { id: 20, name: "Bob", surname: "Martin", email: "bob@example.org" },
        workspace: { id: 1, name: "Lab" },
      },
      {
        id: 203,
        userId: 30,
        arrival: new Date("2026-06-01T10:00:00Z"),
        departure: new Date("2026-06-01T11:00:00Z"),
        repairObject: "Grille-pain moderne",
        repairStatus: "REPAIRED",
        repairNotes: "",
        user: { id: 30, name: "Chloé", surname: "Petit", email: "chloe@example.org" },
        workspace: { id: 1, name: "Lab" },
      },
    );

    const ref = new Date("2026-09-01T12:00:00Z");
    const filtered = await repairCafeService.getRepairStats({
      search: "grille-pain",
      status: "NOT_REPAIRED",
      page: 1,
      referenceDate: ref,
      timeZone: "Europe/Paris",
    });

    // List finds the 2025 record matching both search & status
    expect(filtered.records).toHaveLength(1);
    expect(filtered.records[0].id).toBe(100);
    expect(filtered.pagination.totalCount).toBe(1);

    // Annual KPIs remain strictly 2026 (3 visits, 2 distinct visitors, 2 repaired + 1 partial -> 83% global / 67% strict)
    expect(filtered.statsYear).toBe(2026);
    expect(filtered.totalVisits).toBe(3);
    expect(filtered.uniqueVisitors).toBe(2);
    expect(filtered.repairedCount).toBe(2);
    expect(filtered.partiallyRepairedCount).toBe(1);
    expect(filtered.notRepairedCount).toBe(0);
    expect(filtered.globalSuccessRate).toBe(83);
    expect(filtered.strictSuccessRate).toBe(67);
  });

  test("early January with zero visits in current year shows 0 KPIs while older history stays browsable", async () => {
    mockDb.rows.push({
      id: 50,
      userId: 5,
      arrival: new Date("2026-12-31T22:45:00Z"), // Dec 31 23:45 in Europe/Paris
      departure: new Date("2026-12-31T22:55:00Z"),
      repairObject: "Aspirateur",
      repairStatus: "REPAIRED",
      repairNotes: "",
      user: { id: 5, name: "Luc", surname: "Moreau", email: "luc@example.org" },
      workspace: { id: 1, name: "Lab" },
    });

    const jan2027 = new Date("2027-01-02T09:00:00Z");
    const stats = await repairCafeService.getRepairStats({ referenceDate: jan2027, timeZone: "Europe/Paris" });

    expect(stats.statsYear).toBe(2027);
    expect(stats.totalVisits).toBe(0);
    expect(stats.uniqueVisitors).toBe(0);
    expect(stats.globalSuccessRate).toBe(0);
    expect(stats.records).toHaveLength(1);
    expect(stats.records[0].repairObject).toBe("Aspirateur");
  });

  test("repairCafeQuerySchema accepts empty query and GET /admin/repair-cafe renders annual header, filters and empty state", async () => {
    expect(repairCafeQuerySchema.safeParse({}).success).toBe(true);
    expect(repairCafeQuerySchema.safeParse({ search: "lampe", status: "REPAIRED", page: "2" }).success).toBe(true);
    expect(repairCafeQuerySchema.safeParse({ status: "INVALID" }).success).toBe(false);

    const app = express();
    app.set("views", path.join(ROOT_DIR, "views"));
    app.set("view engine", "ejs");
    app.engine("html", ejs.renderFile);
    app.use((req, res, next) => {
      req.session = { loggedin: true, role: "admin", staffId: 1, username: "admin" };
      res.locals.role = "admin";
      res.locals.baseUrl = "/";
      res.locals.csrfToken = "tok";
      res.locals.cspNonce = "nonce";
      res.locals.currentPath = "/admin/repair-cafe";
      res.locals.isAdminLayout = true;
      res.locals.__ = (k) => k;
      next();
    });
    app.use("/admin/repair-cafe", repairCafeRouter);

    const res = await request(app).get("/admin/repair-cafe?search=introuvable&status=REPAIRED");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Indicateurs de l'année");
    expect(res.text).toContain("Aucune intervention ne correspond aux critères sélectionnés.");
    expect(res.text).toContain('name="status"');
  });
});
