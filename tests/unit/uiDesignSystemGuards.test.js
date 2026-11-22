const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "../..");
const VIEWS_DIR = path.join(ROOT_DIR, "views");
const MAIN_CSS_PATH = path.join(ROOT_DIR, "public/stylesheets/main.css");

function walkViews(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkViews(full, acc);
    } else if (/\.(ejs|html)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc.sort();
}

const ALL_VIEWS = walkViews(VIEWS_DIR);
const FULL_PAGES = ALL_VIEWS.filter((f) => {
  const rel = path.relative(VIEWS_DIR, f);
  return !rel.startsWith("includes/") && !rel.includes("/partials/");
});
const ADMIN_PAGES = FULL_PAGES.filter((f) => path.relative(VIEWS_DIR, f).startsWith("admin/"));

describe("UI Design System Option B Guards (docs/DESIGN_SYSTEM.md)", () => {
  test("D1: every admin page uses .fab-page-header and every full page has exactly one <h1>", () => {
    const missingHeader = [];
    const badH1 = [];

    for (const file of ADMIN_PAGES) {
      const content = fs.readFileSync(file, "utf8");
      if (!content.includes("fab-page-header")) {
        missingHeader.push(path.relative(ROOT_DIR, file));
      }
    }

    for (const file of FULL_PAGES) {
      const rel = path.relative(ROOT_DIR, file);
      const content = fs.readFileSync(file, "utf8");
      const h1Count = (content.match(/<h1\b/gi) || []).length;
      // agreement-success.ejs has mutually exclusive if/else branches (1 rendered at runtime)
      const allowedCount = rel === "views/index/agreement-success.ejs" ? 2 : 1;
      if (h1Count !== allowedCount) {
        badH1.push(`${rel} (h1=${h1Count})`);
      }
    }

    expect(missingHeader).toEqual([]);
    expect(badH1).toEqual([]);
  });

  test("D2: zero redundant 'Retour panneau admin' buttons remain on admin pages", () => {
    const offenders = [];
    for (const file of ADMIN_PAGES) {
      const content = fs.readFileSync(file, "utf8");
      if (/Retour\s+(au\s+)?(panneau\s+)?admin/i.test(content)) {
        offenders.push(path.relative(ROOT_DIR, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  test("D3: zero rounded-pill classes and zero solid saturated badges across all views", () => {
    const pillOffenders = [];
    const solidBadgeOffenders = [];

    for (const file of ALL_VIEWS) {
      const rel = path.relative(ROOT_DIR, file);
      const content = fs.readFileSync(file, "utf8");

      if (rel !== "views/includes/admin-sidebar.html" && /\brounded-pill\b/.test(content)) {
        pillOffenders.push(rel);
      }

      if (/\bbadge\s+bg-(primary|secondary|success|danger|warning|info)\b(?!-subtle)/.test(content)) {
        solidBadgeOffenders.push(rel);
      }
    }

    expect(pillOffenders).toEqual([]);
    expect(solidBadgeOffenders).toEqual([]);
  });

  test("D4: zero borderless card (card ... border-0) surfaces remain in views", () => {
    const offenders = [];
    for (const file of ALL_VIEWS) {
      const rel = path.relative(ROOT_DIR, file);
      const content = fs.readFileSync(file, "utf8");
      // Match class="... card ... border-0 ..." while ignoring card-header / card-footer
      const matches = content.match(/class="[^"]*(?:^|\s)card(?:\s[^"]*)?\bborder-0\b[^"]*"/g) || [];
      if (matches.length > 0) {
        offenders.push(`${rel} (${matches.length})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("HTML hygiene: zero duplicate </main> on pages that include footer.html and consistent <title> format", () => {
    const dupMain = [];
    const badTitle = [];

    for (const file of FULL_PAGES) {
      const rel = path.relative(ROOT_DIR, file);
      const content = fs.readFileSync(file, "utf8");
      if (/include\([^)]*footer\.html/.test(content) && /<\/main>/i.test(content)) {
        dupMain.push(rel);
      }
      const titleMatch = content.match(/<title>([\s\S]*?)<\/title>/i);
      if (titleMatch && /Fabtrack\s+-/i.test(titleMatch[1])) {
        badTitle.push(`${rel}: ${titleMatch[1].trim()}`);
      }
    }

    expect(dupMain).toEqual([]);
    expect(badTitle).toEqual([]);
  });

  test("French UI consistency: zero legacy hardcoded English UI labels remain in views", () => {
    const offenders = [];
    const forbiddenEnglish =
      /\b(In Stock|Low Stock|Out of Stock|Create New Consumable|Edit History Record|Pay off debt|Clear debt|Resolve warning|No Workspace|Save changes|Access level)\b/g;

    for (const file of ALL_VIEWS) {
      const rel = path.relative(ROOT_DIR, file);
      const content = fs.readFileSync(file, "utf8");
      const visible = content
        .replace(/<%[\s\S]*?%>/g, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ");
      const hits = visible.match(forbiddenEnglish);
      if (hits && hits.length > 0) {
        offenders.push(`${rel}: ${[...new Set(hits)].join(", ")}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  test("main.css exposes Option B layout primitives, restricts pointer cursor to sortable th, and drops legacy dead CSS", () => {
    const css = fs.readFileSync(MAIN_CSS_PATH, "utf8");

    expect(css).toContain(".fab-page-header");
    expect(css).toContain(".fab-kpi-card");
    expect(css).toContain(".fab-kpi-icon");
    expect(css).toContain(".fab-filter-bar");
    expect(css).toContain(".fab-rfid-bar");
    expect(css).toContain(".fab-auth-card");
    expect(css).toContain(".fab-row-actions");
    expect(css).toContain("overflow-x: clip;");
    expect(css).not.toMatch(/table th\s*\{\s*cursor:\s*pointer;/);
    expect(css).toContain("table th[data-sort]");
    expect(css).not.toContain(".bd-placeholder-img");
    expect(css).not.toContain(".card-dashboard");
    expect(css).not.toContain("border-radius: 50rem !important;");
  });
});
