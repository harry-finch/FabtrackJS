const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../..");

function walkJs(dir) {
  if (!fs.existsSync(dir)) return [];
  let out = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) out = out.concat(walkJs(full));
    else if (full.endsWith(".js")) out.push(full);
  }
  return out;
}

describe("R-022: Unified Prisma singleton, no require.cache hack, dead code & socket.io cleanup", () => {
  test("zero new PrismaClient() calls exist outside utilities/db.js", () => {
    const dirs = ["bin", "core", "middleware", "plugins", "routes", "services", "utilities", "scripts", "prisma"];
    const files = [path.join(ROOT, "app.js"), ...dirs.flatMap((d) => walkJs(path.join(ROOT, d)))];
    const offenders = [];

    for (const file of files) {
      const rel = path.relative(ROOT, file);
      if (rel === path.join("utilities", "db.js")) continue;
      const src = fs.readFileSync(file, "utf8");
      if (/new\s+PrismaClient\s*\(/.test(src)) {
        offenders.push(rel);
      }
    }

    expect(offenders).toEqual([]);
  });

  test("utilities/db.js no longer monkey-patches require.cache", () => {
    const dbSrc = fs.readFileSync(path.join(ROOT, "utilities/db.js"), "utf8");
    expect(dbSrc).not.toContain("require.cache");
    expect(dbSrc).not.toContain("AutoPrismaClient");
  });

  test("socket.io, socket.io-client, randomized-string, node-fetch and uuid are removed from package.json & bin/www", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    for (const dep of ["socket.io", "socket.io-client", "randomized-string", "node-fetch", "uuid"]) {
      expect(pkg.dependencies).not.toHaveProperty(dep);
    }

    const wwwSrc = fs.readFileSync(path.join(ROOT, "bin/www"), "utf8");
    expect(wwwSrc).not.toContain("socket.io");
    expect(wwwSrc).not.toContain("socketio");
    expect(wwwSrc).toContain("runPluginBootstrap");
  });

  test("all listed dead files have been removed and .gitignore ignores uploads/", () => {
    const removedFiles = [
      "utilities/render.js",
      "utilities/package.json",
      "core/hookLoader.js",
      "hooks/testHooks.js",
      "public/javascripts/edit-user.js",
      "views/includes/language-selector.html",
      "views/admin/error.ejs",
      "public/stylesheets/style.css",
      "scripts/seed-3months-activity.js",
      "uploads/logo-1789385910567-749889170.svg",
    ];
    for (const rel of removedFiles) {
      expect(fs.existsSync(path.join(ROOT, rel))).toBe(false);
    }

    const gitignore = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    expect(gitignore).toContain("uploads/*");
  });

  test("plugins do not perform synchronous DB writes during register() (moved to async bootstrap())", () => {
    for (const pluginFile of [
      "plugins/repairCafePlugin.js",
      "plugins/sorbonneProjectsPlugin.js",
      "plugins/workshopPlugin.js",
    ]) {
      const plugin = require(path.join(ROOT, pluginFile));
      const dummyHookManager = { addHook: jest.fn() };
      // Must NOT trigger any Prisma proxy errors during register()
      expect(() => plugin.register(dummyHookManager)).not.toThrow();
      expect(typeof plugin.bootstrap).toBe("function");
    }
  });
});
