const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

const ROOT_DIR = path.resolve(__dirname, "../..");
const VIEWS_DIR = path.join(ROOT_DIR, "views");

const mockPrisma = {
  history: { count: jest.fn().mockResolvedValue(4) },
  warning: { count: jest.fn().mockResolvedValue(2) },
  activity: {
    count: jest.fn().mockResolvedValue(1),
    findMany: jest.fn().mockResolvedValue([
      {
        id: 10,
        resourceId: 5,
        userId: 3,
        expectedReturnAt: new Date("2026-11-18T12:00:00Z"),
        user: { id: 3, name: "Camille", surname: "Durand" },
      },
    ]),
  },
  equipment: {
    findMany: jest.fn().mockResolvedValue([{ id: 5, name: "Multimètre Fluke" }]),
  },
  consumable: {
    count: jest.fn().mockResolvedValue(2),
    findMany: jest.fn().mockResolvedValue([
      { id: 9, name: "PLA Noir 1.75mm", stock: 0, unit: "bobine", reorderThreshold: 2, status: "OUT_OF_STOCK" },
    ]),
  },
  machine: { count: jest.fn().mockResolvedValue(12) },
  machineIssue: {
    count: jest.fn().mockResolvedValue(1),
    findMany: jest.fn().mockResolvedValue([
      { id: 7, machineId: 4, status: "OPEN", description: "Buse bouchée sur tête 1", machine: { id: 4, name: "Ultimaker S5" } },
    ]),
  },
  staff: {
    count: jest.fn().mockResolvedValue(1),
    findMany: jest.fn().mockResolvedValue([
      { id: 8, name: "mediat_new", email: "new@fablab.fr", createdAt: new Date() },
    ]),
  },
};

jest.mock("../../utilities/db.js", () => ({
  prisma: mockPrisma,
}));

const adminCockpitService = require("../../services/adminCockpitService.js");

describe("Unit R-033: Persistent Admin Sidebar & Live Cockpit (Prop. 3)", () => {
  beforeEach(() => {
    adminCockpitService.invalidateSidebarCache();
    jest.clearAllMocks();
  });

  test("adminCockpitService caches sidebar counters within TTL and invalidates cleanly", async () => {
    const first = await adminCockpitService.getSidebarCounters();
    expect(first).toEqual({
      presentCount: 4,
      activeWarningsCount: 2,
      overdueLoansCount: 1,
      lowStockCount: 2,
      machinesCount: 12,
      openIssuesCount: 1,
      pendingStaffCount: 1,
    });
    expect(mockPrisma.machine.count).toHaveBeenCalledTimes(1);

    // Second call hits memory cache without querying Prisma again
    const second = await adminCockpitService.getSidebarCounters();
    expect(second).toEqual(first);
    expect(mockPrisma.machine.count).toHaveBeenCalledTimes(1);

    // Explicit invalidation forces fresh query
    adminCockpitService.invalidateSidebarCache();
    await adminCockpitService.getSidebarCounters();
    expect(mockPrisma.machine.count).toHaveBeenCalledTimes(2);
  });

  test("adminCockpitService.getCockpitData builds actionable 'À traiter aujourd'hui' todoItems", async () => {
    const data = await adminCockpitService.getCockpitData();
    expect(data.counters.machinesCount).toBe(12);
    expect(data.todoItems.map((t) => t.kind)).toEqual([
      "overdue_loan",
      "machine_issue",
      "low_stock",
      "pending_staff",
    ]);
    expect(data.todoItems[0].title).toContain("Multimètre Fluke");
    expect(data.todoItems[1].href).toBe("admin/machines/view/4");
    expect(data.todoItems[2].badge).toBe("Rupture de stock");
  });

  test("admin-sidebar.html hides disabled plugins, highlights active route, and respects APP_BASE_PATH", () => {
    const sbPath = path.join(VIEWS_DIR, "includes/admin-sidebar.html");
    const tpl = fs.readFileSync(sbPath, "utf8");

    const html = ejs.render(
      tpl,
      {
        baseUrl: "/fabtrack/",
        currentPath: "/fabtrack/admin/machines/manage",
        adminSidebarCounters: {
          activeWarningsCount: 3,
          overdueLoansCount: 2,
          lowStockCount: 1,
          machinesCount: 10,
          openIssuesCount: 1,
          pendingStaffCount: 0,
        },
        isPluginWorkshopEnabled: false,
        isPluginUeEnabled: true,
        isPluginSorbonneEnabled: false,
        isPluginRepairCafeEnabled: false,
        isPluginBookstackEnabled: true,
      },
      { filename: sbPath },
    );

    expect(html).toContain('id="adminSidebarFilter"');
    expect(html).toContain('href="/fabtrack/admin/machines/manage"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("UE &amp; Facturation");
    expect(html).toContain("Wiki BookStack");
    // Disabled plugins MUST NOT appear in sidebar
    expect(html).not.toContain("Repair Café");
    expect(html).not.toContain("Projets Sorbonne");
    expect(html).not.toContain("admin/workshops/manage");
  });

  test("views/admin/main.ejs renders live Cockpit KPIs, 'À traiter aujourd'hui', and sidebar shell without 25-card wall", () => {
    const mainPath = path.join(VIEWS_DIR, "admin/main.ejs");
    const tpl = fs.readFileSync(mainPath, "utf8");

    const html = ejs.render(
      tpl,
      {
        baseUrl: "/fabtrack/",
        basePath: "/fabtrack",
        currentPath: "/fabtrack/admin",
        currentLocale: "fr",
        csrfToken: "tok",
        cspNonce: "nonce-1",
        username: "admin",
        role: "admin",
        isAdminLayout: true,
        adminSidebarCounters: { machinesCount: 12, overdueLoansCount: 1, lowStockCount: 2, openIssuesCount: 1, activeWarningsCount: 0, pendingStaffCount: 0 },
        cockpit: {
          counters: { presentCount: 5, overdueLoansCount: 1, lowStockCount: 2, machinesCount: 12, openIssuesCount: 1 },
          todoItems: [
            {
              kind: "machine_issue",
              severity: "danger",
              icon: "fa-solid fa-triangle-exclamation",
              badge: "Panne ouverte",
              title: "Laser Trotec",
              subtitle: "Alignement miroir",
              href: "admin/machines/view/2",
              actionLabel: "Voir la fiche",
            },
          ],
        },
        platformName: "FabtrackJS",
        platformSubtitle: "Suivi fablab",
        platformLogoType: "default",
        platformLogoPath: "",
        availableWorkspaces: [],
        selectedWorkspace: null,
        notification: "",
        appVersion: "1.5.0",
        isPluginRfidEnabled: false,
        isPluginUeEnabled: true,
        isPluginSorbonneEnabled: false,
        isPluginRepairCafeEnabled: false,
        isPluginBookstackEnabled: false,
        isPluginWorkshopEnabled: true,
        __: (k) => k,
      },
      { filename: mainPath },
    );

    expect(html).toContain("Cockpit d'administration");
    expect(html).toContain("À traiter aujourd'hui");
    expect(html).toContain("Laser Trotec");
    expect(html).toContain('class="fab-admin-shell"');
    expect(html).toContain('id="adminSidebarOffcanvas"');
    expect(html).toContain("Raccourcis rapides");
    expect(html).not.toContain("card-dashboard");
  });

  test("package.json is bumped to version 1.5.0 for v1.5 milestone completion", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
    expect(pkg.version).toBe("1.5.0");
  });
});
