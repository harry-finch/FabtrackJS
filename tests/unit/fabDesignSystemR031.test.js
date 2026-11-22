const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

const ROOT_DIR = path.resolve(__dirname, "../..");
const VIEWS_DIR = path.join(ROOT_DIR, "views");

describe("Unit R-031: Fab Design System Option B (44px Top Bar, Segmented Controls & 24px Status Bar)", () => {
  test("floating violet .btn-bd-primary button is completely removed from views and main.css", () => {
    const lightDark = fs.readFileSync(path.join(VIEWS_DIR, "includes/light-dark.html"), "utf8");
    const mainCss = fs.readFileSync(path.join(ROOT_DIR, "public/stylesheets/main.css"), "utf8");

    expect(lightDark).not.toContain("btn-bd-primary");
    expect(mainCss).not.toContain(".btn-bd-primary");
    expect(lightDark).toContain("fab-standalone-controls");
    expect(lightDark).toContain('data-bs-theme-value="auto"');
    expect(lightDark).toContain('data-bs-theme-value="light"');
    expect(lightDark).toContain('data-bs-theme-value="dark"');
  });

  test("header.html renders Option B 44px sticky topbar with Sorbonne blue identity, workspace selector, segmented controls, and role-gated actions", () => {
    const headerPath = path.join(VIEWS_DIR, "includes/header.html");
    const tpl = fs.readFileSync(headerPath, "utf8");

    const htmlAdmin = ejs.render(
      tpl,
      {
        baseUrl: "/fabtrack/",
        basePath: "/fabtrack",
        currentPath: "/fabtrack/admin",
        csrfToken: "tok",
        cspNonce: "nonce-1",
        username: "admin1",
        role: "admin",
        platformName: "FabtrackJS",
        platformSubtitle: "Suivi fablab",
        platformLogoType: "default",
        platformLogoPath: "",
        currentLocale: "fr",
        localesMeta: [
          { code: "fr", name: "Français", flag: "🇫🇷" },
          { code: "en", name: "English", flag: "🇬🇧" },
        ],
        availableWorkspaces: [{ id: 1, name: "Atelier Principal" }],
        selectedWorkspace: { id: 1, name: "Atelier Principal" },
        __: (k) => k,
      },
      { filename: headerPath },
    );

    expect(htmlAdmin).toContain('class="fab-topbar"');
    expect(htmlAdmin).toContain("fab-brand-tile");
    expect(htmlAdmin).toContain("images/logo-fabtrack.svg");
    expect(htmlAdmin).toContain("Atelier Principal");
    expect(htmlAdmin).toContain('href="/fabtrack/change-language/fr"');
    expect(htmlAdmin).toContain('href="/fabtrack/change-language/en"');
    expect(htmlAdmin).toContain('data-bs-theme-value="auto"');
    expect(htmlAdmin).toContain('data-bs-theme-value="light"');
    expect(htmlAdmin).toContain('data-bs-theme-value="dark"');
    expect(htmlAdmin).toContain('href="/fabtrack/admin"');
    expect(htmlAdmin).toContain("modalInventoryCheckout");
    // No Sorbonne University institutional badge in top bar
    expect(htmlAdmin).not.toContain("Sorbonne Université");
  });

  test("footer.html renders compact 24px status bar with workspace, version, RFID state, and realtime slot", () => {
    const footerPath = path.join(VIEWS_DIR, "includes/footer.html");
    const tpl = fs.readFileSync(footerPath, "utf8");

    const html = ejs.render(
      tpl,
      {
        selectedWorkspace: { id: 1, name: "Lab Électronique" },
        isPluginRfidEnabled: true,
        appVersion: "1.5.0",
        notification: "",
        __: (k) => k,
      },
      { filename: footerPath },
    );

    expect(html).toContain('class="fab-statusbar"');
    expect(html).toContain("Lab Électronique");
    expect(html).toContain("RFID prêt");
    expect(html).toContain('id="fabRealtimeStatus"');
    expect(html).toContain("FabtrackJS v1.5.0");
  });

  test("main.css defines Sorbonne blue identity tokens, 44px topbar, 24px statusbar, and tabular numerals", () => {
    const css = fs.readFileSync(path.join(ROOT_DIR, "public/stylesheets/main.css"), "utf8");
    expect(css).toContain("--fab-identity: #4c8df5;");
    expect(css).toContain("height: 44px;");
    expect(css).toContain("height: 24px;");
    expect(css).toContain("font-variant-numeric: tabular-nums;");
  });
});
