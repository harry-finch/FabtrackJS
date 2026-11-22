const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

const ROOT_DIR = path.resolve(__dirname, "../..");
const VIEWS_DIR = path.join(ROOT_DIR, "views");

function walkFiles(dir, extensions) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath, extensions));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

describe("Unit R-030: Reverse-Proxy Subpath Links & Admin Navigation Consistency", () => {
  test("zero HTML href/action/src attributes start with bare '/' across all views", () => {
    const files = walkFiles(VIEWS_DIR, [".ejs", ".html"]);
    const violations = [];

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      const parts = content.split(/(<script\b[\s\S]*?<\/script>)/gi);
      parts.forEach((part, idx) => {
        if (idx % 2 === 1) return;
        const clean = part.replace(/<%[\s\S]*?%>/g, "__EJS__");
        for (const match of clean.matchAll(/\b(href|action|src)=["'](\/(?!\/)[^"']*)["']/g)) {
          violations.push(`${path.relative(ROOT_DIR, file)}: ${match[0]}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });

  test("header.html includes inventory-checkout-modal only for admin/user roles, not staff kiosk", () => {
    const headerPath = path.join(VIEWS_DIR, "includes/header.html");
    const tpl = fs.readFileSync(headerPath, "utf8");
    const baseLocals = {
      filename: headerPath,
      baseUrl: "/fabtrack/",
      basePath: "/fabtrack",
      csrfToken: "csrf-123",
      cspNonce: "nonce-123",
      username: "kiosk1",
      availableWorkspaces: [],
      selectedWorkspace: null,
      platformName: "FabtrackJS",
      platformSubtitle: "",
      platformLogoType: "default",
      platformLogoPath: "",
      __: (k) => k,
    };

    const staffHtml = ejs.render(tpl, { ...baseLocals, role: "staff" }, { filename: headerPath });
    expect(staffHtml).not.toContain("modalInventoryCheckout");
    expect(staffHtml).toContain('href="/fabtrack/fabtrack"');
    expect(staffHtml).toContain('action="/fabtrack/logout"');

    const userHtml = ejs.render(tpl, { ...baseLocals, role: "user" }, { filename: headerPath });
    expect(userHtml).toContain("modalInventoryCheckout");

    const adminHtml = ejs.render(tpl, { ...baseLocals, role: "admin" }, { filename: headerPath });
    expect(adminHtml).toContain("modalInventoryCheckout");
    expect(adminHtml).toContain('href="/fabtrack/admin"');
  });

  test("auth views and admin/main.ejs render subpath-prefixed URLs under APP_BASE_PATH='/fabtrack'", () => {
    const locals = {
      baseUrl: "/fabtrack/",
      basePath: "/fabtrack",
      csrfToken: "csrf-123",
      cspNonce: "nonce-123",
      currentLocale: "fr",
      platformName: "FabtrackJS",
      platformLogoType: "default",
      platformLogoPath: "",
      allowSelfRegistration: true,
      notification: "",
      __: (k) => k,
    };

    for (const rel of ["index/login.ejs", "index/register.ejs", "index/forgot.ejs"]) {
      const filePath = path.join(VIEWS_DIR, rel);
      const html = ejs.render(fs.readFileSync(filePath, "utf8"), locals, { filename: filePath });
      expect(html).toContain('src="/fabtrack/images/logo-fabtrack.svg"');
      expect(html).not.toContain('src="/images/logo-fabtrack.svg"');
    }

    const adminMainSrc = fs.readFileSync(path.join(VIEWS_DIR, "admin/main.ejs"), "utf8");
    expect(adminMainSrc).not.toContain("? 'btn-outline-secondary' : 'btn-outline-secondary'");
  });

  test("main.css back-to-admin button selector supports subpath hrefs", () => {
    const css = fs.readFileSync(path.join(ROOT_DIR, "public/stylesheets/main.css"), "utf8");
    expect(css).toContain('a[href$="/admin"].btn:not(.header-action-btn)');
  });
});
