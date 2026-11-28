const fs = require("fs");
const path = require("path");
const EventEmitter = require("events");
const ejs = require("ejs");
const express = require("express");
const request = require("supertest");

const ROOT_DIR = path.resolve(__dirname, "../..");
const { RealtimeService } = require("../../services/realtimeService.js");
const realtimeService = require("../../services/realtimeService.js");

const mockPrisma = {
  history: {
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({ id: 42, workspaceId: 2 }),
  },
  warning: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  activity: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  equipment: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  staff: {
    findUnique: jest.fn().mockResolvedValue({ id: 1, name: "admin", role: "admin", approved: true }),
  },
};

jest.mock("../../utilities/db.js", () => ({
  prisma: mockPrisma,
  ResourceType: { MACHINE: "MACHINE", EQUIPMENT: "EQUIPMENT", CONSUMABLE: "CONSUMABLE" },
}));

jest.mock("../../utilities/db", () => ({
  prisma: mockPrisma,
  ResourceType: { MACHINE: "MACHINE", EQUIPMENT: "EQUIPMENT", CONSUMABLE: "CONSUMABLE" },
}));

jest.mock("../../services/staffSessionService.js", () => ({
  verifyActiveStaffSession: jest.fn(() =>
    Promise.resolve({ valid: true, staff: { id: 1, name: "admin", role: "admin", approved: true } }),
  ),
}));

describe("Unit R-032: Realtime SSE Bus & Partial Kiosk/Admin Refresh", () => {
  afterEach(() => {
    realtimeService.shutdown();
  });

  test("RealtimeService sets SSE headers with X-Accel-Buffering: no, scopes by workspaceId, strips PII, and cleans up on close", () => {
    const bus = new RealtimeService();

    function createMockStream() {
      const req = new EventEmitter();
      const headers = {};
      const chunks = [];
      const res = new EventEmitter();
      res.status = jest.fn(() => res);
      res.setHeader = jest.fn((k, v) => {
        headers[k.toLowerCase()] = v;
      });
      res.flushHeaders = jest.fn();
      res.write = jest.fn((chunk) => chunks.push(chunk));
      res.end = jest.fn(() => {
        res.writableEnded = true;
      });
      res.writableEnded = false;
      res.destroyed = false;
      return { req, res, headers, chunks };
    }

    const ws1 = createMockStream();
    const ws2 = createMockStream();
    const adminStream = createMockStream();

    bus.subscribe(ws1.req, ws1.res, { workspaceId: 1, channels: ["kiosk"] });
    bus.subscribe(ws2.req, ws2.res, { workspaceId: 2, channels: ["kiosk"] });
    bus.subscribe(adminStream.req, adminStream.res, { workspaceId: null, channels: ["admin"] });

    expect(ws1.headers["content-type"]).toContain("text/event-stream");
    expect(ws1.headers["x-accel-buffering"]).toBe("no");
    expect(ws1.headers["cache-control"]).toContain("no-cache");
    expect(bus.getClientCount()).toBe(3);

    // Publish workspace 1 kiosk invalidation with extra sensitive keys — must NOT leak PII and only hit ws1
    const delivered = bus.publish("kiosk", {
      workspaceId: 1,
      action: "checkin",
      email: "secret@example.com",
      surname: "Dupont",
    });
    expect(delivered).toBe(1);
    expect(ws1.chunks.some((c) => c.includes("event: invalidate") && c.includes('"action":"checkin"'))).toBe(true);
    expect(ws1.chunks.join("")).not.toContain("secret@example.com");
    expect(ws1.chunks.join("")).not.toContain("Dupont");
    expect(ws2.chunks.filter((c) => c.includes("event: invalidate"))).toHaveLength(0);

    // Disconnect cleanup
    ws1.req.emit("close");
    expect(bus.getClientCount()).toBe(2);

    bus.shutdown();
    expect(bus.getClientCount()).toBe(0);
  });

  test("GET /events/stream requires authentication (redirects to /login when logged out)", async () => {
    const eventsRouter = require("../../routes/events.js");
    const app = express();
    app.use((req, res, next) => {
      req.session = { loggedin: false };
      next();
    });
    app.use("/events", eventsRouter);

    const res = await request(app).get("/events/stream");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/login");
  });

  test("GET /fabtrack/present-table renders partial HTML for mediators and forbids borne (role: staff — R-036)", async () => {
    mockPrisma.history.findMany.mockResolvedValueOnce([
      {
        id: 101,
        userId: 7,
        arrival: new Date("2026-11-22T09:15:00Z"),
        comments: "Découpe laser",
        repairObject: null,
        workshop: null,
        user: { id: 7, name: "Alice", surname: "Martin", balance: 0, isExpert: false },
      },
    ]);

    const fabtrackRouter = require("../../routes/fabtrack.js");
    const app = express();
    app.set("views", path.join(ROOT_DIR, "views"));
    app.set("view engine", "ejs");
    app.engine("html", ejs.renderFile);
    app.use((req, res, next) => {
      const role = req.headers["x-test-role"] || "user";
      req.session = { loggedin: true, role, staffId: 1, username: "mediator", selectedWorkspace: { id: 1, name: "Lab" } };
      res.locals.role = role;
      res.locals.baseUrl = "/fabtrack/";
      res.locals.csrfToken = "csrf-1";
      res.locals.__ = (k) => k;
      next();
    });
    app.use("/fabtrack", fabtrackRouter);

    const res = await request(app).get("/fabtrack/present-table").set("x-test-role", "user");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.text).toContain("Alice Martin");
    expect(res.text).toContain('data-ajax-kiosk="true"');

    const staffRes = await request(app)
      .get("/fabtrack/present-table")
      .set("x-test-role", "staff")
      .set("Accept", "application/json");
    expect(staffRes.status).toBe(403);
  });

  test("POST /history/exit/:id returns JSON in AJAX mode and publishes SSE kiosk/admin invalidation", async () => {
    const publishSpy = jest.spyOn(realtimeService, "publish");
    const historyRouter = require("../../routes/history.js");
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use((req, res, next) => {
      req.session = { loggedin: true, role: "admin", staffId: 1, username: "admin", selectedWorkspace: { id: 2, name: "Lab 2" } };
      next();
    });
    app.use("/history", historyRouter);

    const res = await request(app)
      .post("/history/exit/42")
      .set("Accept", "application/json")
      .set("X-Requested-With", "XMLHttpRequest");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(publishSpy).toHaveBeenCalledWith("kiosk", expect.objectContaining({ workspaceId: 2, action: "checkout" }));
    expect(publishSpy).toHaveBeenCalledWith("admin", expect.objectContaining({ entity: "history", action: "checkout" }));
    publishSpy.mockRestore();
  });

  test("rfid-listener.js uses refreshKioskPresentTable instead of unconditional reload and app.js bypasses compression for /events", () => {
    const rfidJs = fs.readFileSync(path.join(ROOT_DIR, "public/javascripts/rfid-listener.js"), "utf8");
    const appJs = fs.readFileSync(path.join(ROOT_DIR, "app.js"), "utf8");
    const liveRefreshJs = fs.readFileSync(path.join(ROOT_DIR, "public/javascripts/live-refresh.js"), "utf8");

    expect(rfidJs).toContain("window.refreshKioskPresentTable");
    expect(appJs).toContain('req.path.startsWith("/events")');
    expect(liveRefreshJs).toContain("EventSource");
    expect(liveRefreshJs).toContain("DOMParser");
    expect(liveRefreshJs).toContain("isUserEditingOrModalOpen");
  });

  test("GET /fabtrack/present-table renders an explicit empty state when nobody is in the lab", async () => {
    mockPrisma.history.findMany.mockResolvedValueOnce([]);

    const fabtrackRouter = require("../../routes/fabtrack.js");
    const app = express();
    app.set("views", path.join(ROOT_DIR, "views"));
    app.set("view engine", "ejs");
    app.engine("html", ejs.renderFile);
    app.use((req, res, next) => {
      req.session = { loggedin: true, role: "user", staffId: 1, username: "mediator", selectedWorkspace: { id: 1, name: "Lab" } };
      res.locals.role = "user";
      res.locals.baseUrl = "/";
      res.locals.csrfToken = "csrf-empty";
      res.locals.__ = (k) => k;
      next();
    });
    app.use("/fabtrack", fabtrackRouter);

    const res = await request(app).get("/fabtrack/present-table");
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="kioskPresentCard"');
    expect(res.text).toContain('id="kioskEmptyState"');
    expect(res.text).toContain("Le lab est actuellement vide");
  });

  test("UI polish guards: no horizontal overflow, unified compact admin action columns, separated profile sections", () => {
    const mainCss = fs.readFileSync(path.join(ROOT_DIR, "public/stylesheets/main.css"), "utf8");
    const consumablesEjs = fs.readFileSync(path.join(ROOT_DIR, "views/admin/manage-consumables.ejs"), "utf8");
    const historyEjs = fs.readFileSync(path.join(ROOT_DIR, "views/admin/view-history.ejs"), "utf8");
    const usersEjs = fs.readFileSync(path.join(ROOT_DIR, "views/admin/manage-users.ejs"), "utf8");
    const machinesEjs = fs.readFileSync(path.join(ROOT_DIR, "views/admin/manage-machines.ejs"), "utf8");
    const ueEjs = fs.readFileSync(path.join(ROOT_DIR, "views/admin/manage-teaching-units.ejs"), "utf8");
    const editUserEjs = fs.readFileSync(path.join(ROOT_DIR, "views/fabtrack/edit-user.ejs"), "utf8");

    expect(mainCss).toContain("overflow-x: clip;");
    expect(mainCss).toContain(".fab-row-actions");
    expect(consumablesEjs).toContain("fab-row-actions");
    expect(consumablesEjs).toContain('colspan="6"');
    expect(consumablesEjs).not.toContain("Catégorie <i");
    expect(historyEjs).toContain("fab-row-actions");
    expect(historyEjs).toContain('colspan="8"');
    expect(historyEjs).toContain("isRepairProject");
    expect(machinesEjs).toContain("<th scope=\"col\">Modèle</th>");
    expect(machinesEjs).not.toContain("machines.col_category");
    expect(ueEjs).not.toContain("<th>Responsable</th>");
    expect(ueEjs).toContain('colspan="8"');
    expect(usersEjs).toContain("fab-row-actions");
    expect(editUserEjs).toContain("fab-section-header");
  });
});
