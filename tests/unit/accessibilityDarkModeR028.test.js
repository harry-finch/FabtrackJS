const fs = require("fs");
const path = require("path");
const vm = require("vm");

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

describe("Unit R-028: WCAG AA Accessibility, Keyboard Navigation, Dark Mode & Touch", () => {
  const viewFiles = walkFiles(VIEWS_DIR, [".ejs", ".html"]);

  test("all HTML documents use dynamic <html lang=\"<%= ... currentLocale ... %>\"> instead of hardcoded lang", () => {
    const violations = [];
    for (const file of viewFiles) {
      const content = fs.readFileSync(file, "utf8");
      if (/<html\b[^>]*lang="(fr|en)"/i.test(content)) {
        violations.push(path.relative(ROOT_DIR, file));
      }
    }
    expect(violations).toEqual([]);
  });

  test("zero visible or file form controls lack both <label for> and aria-label/aria-labelledby", () => {
    const violations = [];
    for (const file of viewFiles) {
      const content = fs.readFileSync(file, "utf8");
      const clean = content.replace(/<%[\s\S]*?%>/g, "__EJS__");
      const labels = new Set([...clean.matchAll(/<label\b[^>]*for=["']([^"']+)["']/gi)].map((m) => m[1]));

      for (const match of clean.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
        const tag = match[0];
        if (/type=["'](hidden|submit|button|reset)["']/i.test(tag)) continue;
        if (/aria-hidden=["']true["']/i.test(tag)) continue;
        if (/aria-label=|aria-labelledby=/i.test(tag)) continue;
        const idMatch = tag.match(/\bid=["']([^"']+)["']/i);
        if (idMatch && labels.has(idMatch[1])) continue;
        violations.push(`${path.relative(ROOT_DIR, file)}: ${tag.replace(/\s+/g, " ").slice(0, 120)}`);
      }
    }
    expect(violations).toEqual([]);
  });

  test("main.css uses valid --bs-tertiary-bg variable, :focus-visible outline, and >= 44px touch targets", () => {
    const css = fs.readFileSync(path.join(ROOT_DIR, "public/stylesheets/main.css"), "utf8");
    expect(css).not.toContain("--bs-body-tertiary-bg");
    expect(css).toContain("--bs-tertiary-bg");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("min-height: 44px");
  });

  test("zero views contain dark-mode-breaking bg-light, bg-white, or text-dark classes", () => {
    const violations = [];
    for (const file of viewFiles) {
      const content = fs.readFileSync(file, "utf8");
      const matches = content.match(/\b(bg-light|bg-white|text-dark)\b/g);
      if (matches && matches.length > 0) {
        violations.push(`${path.relative(ROOT_DIR, file)}: ${[...new Set(matches)].join(", ")}`);
      }
    }
    expect(violations).toEqual([]);
  });

  test("all target=\"_blank\" links include rel=\"noopener noreferrer\"", () => {
    const violations = [];
    for (const file of viewFiles) {
      const content = fs.readFileSync(file, "utf8");
      const clean = content.replace(/<%[\s\S]*?%>/g, "__EJS__");
      for (const match of clean.matchAll(/<a\b[^>]*>/gi)) {
        const tag = match[0];
        if (/target=["']_blank["']/i.test(tag) && !/rel=["'][^"']*noopener/i.test(tag)) {
          violations.push(`${path.relative(ROOT_DIR, file)}: ${tag.slice(0, 120)}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test("color-mode-toggler.js dispatches fabtrack:themechange and manage-statistics.ejs listens to refresh Chart.js", () => {
    const toggler = fs.readFileSync(path.join(ROOT_DIR, "public/javascripts/color-mode-toggler.js"), "utf8");
    const statsView = fs.readFileSync(path.join(VIEWS_DIR, "admin/manage-statistics.ejs"), "utf8");

    expect(toggler).toContain("fabtrack:themechange");
    expect(statsView).toContain("fabtrack:themechange");
    expect(statsView).toContain("applyStatsChartsTheme");
  });

  test("table-sorting.js binds keyboard Enter/Space, aria-sort, and multi-table sorting without innerHTML", () => {
    const sortingSource = fs.readFileSync(path.join(ROOT_DIR, "public/javascripts/table-sorting.js"), "utf8");
    expect(sortingSource).not.toMatch(/\.innerHTML\s*=/);

    const makeRow = (vals) => ({
      children: vals.map((v) => ({ textContent: v })),
    });

    const thListeners = {};
    const thAttrs = { "data-sort": "0" };
    const thClasses = new Set();
    const thChildren = [];

    const makeTh = () => ({
      style: {},
      dataset: {},
      hasAttribute: (k) => k in thAttrs,
      getAttribute: (k) => thAttrs[k] || null,
      setAttribute: (k, v) => {
        thAttrs[k] = String(v);
      },
      classList: {
        add: (...c) => c.forEach((x) => thClasses.add(x)),
        remove: (...c) => c.forEach((x) => thClasses.delete(x)),
        contains: (c) => thClasses.has(c),
      },
      querySelector: () => null,
      appendChild: (node) => thChildren.push(node),
      closest: () => tableObj,
      addEventListener: (evt, cb) => {
        thListeners[evt] = cb;
      },
    });

    const thObj = makeTh();
    const rows = [makeRow(["Zebra"]), makeRow(["Alpha"])];
    const appendedRows = [];
    const tbodyObj = {
      querySelectorAll: () => rows,
      appendChild: (r) => appendedRows.push(r),
    };
    const tableAttrs = {};
    const tableObj = {
      getAttribute: (k) => tableAttrs[k] || null,
      setAttribute: (k, v) => {
        tableAttrs[k] = String(v);
      },
      querySelector: (sel) => (sel === "tbody" ? tbodyObj : null),
      querySelectorAll: (sel) => (sel === "th" ? [thObj] : []),
    };

    const windowObj = {};
    const documentObj = {
      readyState: "complete",
      querySelector: () => null,
      querySelectorAll: (sel) => (sel === "th[data-sort]" ? [thObj] : []),
      createElement: () => ({
        className: "",
        textContent: "",
        setAttribute: jest.fn(),
      }),
      addEventListener: jest.fn(),
    };

    vm.runInNewContext(sortingSource, { window: windowObj, document: documentObj }, { filename: "table-sorting.js" });

    expect(thAttrs.tabindex).toBe("0");
    expect(thAttrs.role).toBe("button");
    expect(thAttrs["aria-sort"]).toBe("none");

    const preventDefault = jest.fn();
    thListeners.keydown({ key: "Enter", preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(thAttrs["aria-sort"]).toBe("ascending");
    expect(appendedRows[0].children[0].textContent).toBe("Alpha");
    expect(appendedRows[1].children[0].textContent).toBe("Zebra");

    thListeners.keydown({ key: " ", preventDefault });
    expect(thAttrs["aria-sort"]).toBe("descending");
  });

  test("inventory-checkout-modal action cards are keyboard accessible", () => {
    const modal = fs.readFileSync(path.join(VIEWS_DIR, "includes/inventory-checkout-modal.html"), "utf8");
    expect(modal).toContain('tabindex="0" role="button"');
    expect(modal).toContain('event.key === "Enter" || event.key === " "');
  });
});
