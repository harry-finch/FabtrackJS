const fs = require("fs");
const path = require("path");
const { setFlash, formatFlash } = require("../../utilities/flashHelper.js");
const clearNotification = require("../../middleware/clearNotification.js");
const i18nService = require("../../services/i18nService.js");
const { parseCsvText } = require("../../services/csvParserService.js");

const ROOT_DIR = path.resolve(__dirname, "../..");

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

function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

describe("Unit R-029: Terminology Consistency, Franglais Removal & i18n Catalog Sync", () => {
  test("zero visible 'Usager' or 'Type de projet' terminology in views, client JS, and French locale", () => {
    const targets = [
      ...walkFiles(path.join(ROOT_DIR, "views"), [".ejs", ".html"]),
      ...walkFiles(path.join(ROOT_DIR, "public/javascripts"), [".js"]),
      path.join(ROOT_DIR, "locales/fr.json"),
    ];
    const violations = [];
    for (const file of targets) {
      const content = fs.readFileSync(file, "utf8");
      const lines = content.split("\n");
      lines.forEach((line, idx) => {
        if (/\busagers?\b/i.test(line) || /types?\s+de\s+projets?/i.test(line)) {
          violations.push(`${path.relative(ROOT_DIR, file)}:${idx + 1}: ${line.trim().slice(0, 100)}`);
        }
      });
    }
    expect(violations).toEqual([]);
  });

  test("known franglais strings are eliminated from views and fabtrack.js", () => {
    const checkedFiles = [
      "views/index/login.ejs",
      "views/index/register.ejs",
      "views/index/forgot.ejs",
      "views/index/reset.ejs",
      "views/admin/manage-machines.ejs",
      "views/admin/manage-consumables.ejs",
      "views/admin/view-machine.ejs",
      "public/javascripts/fabtrack.js",
    ];
    const bannedPatterns = [
      "Fabtrack signin",
      "Manage Machines",
      "Manage Fablab Consumables",
      "Back to Machines List",
      "No documentation found, type new URL to create project",
      "current user projects",
      "all other projects",
    ];
    for (const rel of checkedFiles) {
      const content = fs.readFileSync(path.join(ROOT_DIR, rel), "utf8");
      for (const banned of bannedPatterns) {
        expect(content).not.toContain(banned);
      }
    }
  });

  test("locales/fr.json, locales/en.json, and translations.csv are 100% key-synchronized and include common.menu", () => {
    const fr = flatten(JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "locales/fr.json"), "utf8")));
    const en = flatten(JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "locales/en.json"), "utf8")));
    const csvRows = parseCsvText(fs.readFileSync(path.join(ROOT_DIR, "translations.csv"), "utf8"), {
      trimFields: false,
    });
    const csvKeys = csvRows
      .slice(1)
      .map((r) => (r[0] || "").trim())
      .filter(Boolean)
      .sort();

    const frKeys = Object.keys(fr).sort();
    const enKeys = Object.keys(en).sort();

    expect(frKeys).toEqual(enKeys);
    expect(csvKeys).toEqual(frKeys);
    expect(fr["common.menu"]).toBe("Menu");
    expect(en["common.menu"]).toBe("Menu");
    expect(fr["auth.remember_me"]).toBeUndefined();
    expect(en["auth.remember_me"]).toBeUndefined();
  });

  test("config/i18n.js and services/i18nService.js do not contain dead '|| true' conditions", () => {
    const configSrc = fs.readFileSync(path.join(ROOT_DIR, "config/i18n.js"), "utf8");
    const serviceSrc = fs.readFileSync(path.join(ROOT_DIR, "services/i18nService.js"), "utf8");

    expect(configSrc).not.toContain("|| true");
    expect(serviceSrc).not.toContain("|| true");
    expect(i18nService.getAvailableLocales()).toEqual(expect.arrayContaining(["fr", "en"]));
  });

  test("flashHelper & clearNotification translate structured { type, key, params } payloads and preserve legacy strings", () => {
    const req = { session: {} };
    setFlash(req, "success", "alerts.csv_imported", [42]);
    expect(req.session.notification).toEqual({
      type: "success",
      key: "alerts.csv_imported",
      params: [42],
    });

    const translateEn = (key, count) => (key === "alerts.csv_imported" ? `Imported ${count} keys.` : key);
    expect(formatFlash(req.session.notification, translateEn)).toBe("Success: Imported 42 keys.");
    expect(formatFlash("Warning: Stock faible", translateEn)).toBe("Warning: Stock faible");

    const res = {
      locals: {},
      __: jest.fn((key) => (key === "alerts.settings_saved" ? "Settings saved successfully." : key)),
    };
    setFlash(req, "success", "alerts.settings_saved");
    const next = jest.fn();
    clearNotification(req, res, next);
    expect(res.locals.notification).toBe("Success: Settings saved successfully.");
    expect(req.session.notification).toBe("");
    expect(next).toHaveBeenCalledTimes(1);
  });
});
