const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const FA_CSS_PATH = path.join(
  ROOT_DIR,
  "node_modules",
  "@fortawesome",
  "fontawesome-free",
  "css",
  "all.min.css",
);

const STANDARD_FA_UTILITIES = new Set([
  "fa-solid",
  "fa-regular",
  "fa-brands",
  "fa-classic",
  "fa-fw",
  "fa-ul",
  "fa-li",
  "fa-spin",
  "fa-pulse",
  "fa-beat",
  "fa-fade",
  "fa-bounce",
  "fa-flip",
  "fa-shake",
  "fa-2xs",
  "fa-xs",
  "fa-sm",
  "fa-lg",
  "fa-xl",
  "fa-2xl",
  "fa-1x",
  "fa-2x",
  "fa-3x",
  "fa-4x",
  "fa-5x",
  "fa-6x",
  "fa-7x",
  "fa-8x",
  "fa-9x",
  "fa-10x",
  "fa-border",
  "fa-pull-left",
  "fa-pull-right",
  "fa-stack",
  "fa-stack-1x",
  "fa-stack-2x",
  "fa-inverse",
]);

function isAllowedUtilityClass(className) {
  return (
    STANDARD_FA_UTILITIES.has(className) ||
    /^fa-(rotate|flip)-/.test(className)
  );
}

function walkFiles(dirPath, extensions, results = []) {
  if (!fs.existsSync(dirPath)) return results;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, extensions, results);
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

function extractDefinedFaClasses(cssContent) {
  const defined = new Set();
  const regex = /\.(fa-[a-z0-9-]+)/g;
  let match;
  while ((match = regex.exec(cssContent)) !== null) {
    defined.add(match[1]);
  }
  return defined;
}

describe("Unit (R-010): Assets Font Awesome Free, dépendances et licences", () => {
  describe("1. Dépendances & hygiène package.json", () => {
    const pkgPath = path.join(ROOT_DIR, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

    test("déclare la licence MIT", () => {
      expect(pkg.license).toBe("MIT");
    });

    test("inclut @fortawesome/fontawesome-free dans dependencies", () => {
      expect(pkg.dependencies).toBeDefined();
      expect(pkg.dependencies["@fortawesome/fontawesome-free"]).toBeTruthy();
    });

    test("place nodemon et @faker-js/faker dans devDependencies et non dans dependencies", () => {
      expect(pkg.dependencies.nodemon).toBeUndefined();
      expect(pkg.dependencies["@faker-js/faker"]).toBeUndefined();

      expect(pkg.devDependencies).toBeDefined();
      expect(pkg.devDependencies.nodemon).toBeTruthy();
      expect(pkg.devDependencies["@faker-js/faker"]).toBeTruthy();
    });

    test("conserve prisma en version 7.x sans downgrade", () => {
      expect(pkg.devDependencies.prisma).toMatch(/^[\^~]?7\./);
      expect(pkg.dependencies["@prisma/client"]).toMatch(/^[\^~]?7\./);
      expect(pkg.dependencies["@prisma/adapter-mariadb"]).toMatch(/^[\^~]?7\./);
    });
  });

  describe("2. Suppression des actifs Font Awesome Pro & montage local Free", () => {
    test("supprime public/stylesheets/fontawsome-all.min.css et public/webfonts", () => {
      expect(
        fs.existsSync(path.join(ROOT_DIR, "public", "stylesheets", "fontawsome-all.min.css")),
      ).toBe(false);
      expect(fs.existsSync(path.join(ROOT_DIR, "public", "webfonts"))).toBe(false);
    });

    test("fournit @fortawesome/fontawesome-free/css/all.min.css sans mention Font Awesome Pro", () => {
      expect(fs.existsSync(FA_CSS_PATH)).toBe(true);
      const cssContent = fs.readFileSync(FA_CSS_PATH, "utf8");
      expect(cssContent).not.toContain("Font Awesome Pro");
    });

    test("référence vendor/fontawesome/css/all.min.css dans views/includes/pagehead.html", () => {
      const pageheadPath = path.join(ROOT_DIR, "views", "includes", "pagehead.html");
      const content = fs.readFileSync(pageheadPath, "utf8");
      expect(content).toContain("vendor/fontawesome/css/all.min.css");
      expect(content).not.toContain("fontawsome-all.min.css");
    });

    test("monte /vendor/fontawesome vers node_modules/@fortawesome/fontawesome-free dans app.js", () => {
      const appPath = path.join(ROOT_DIR, "app.js");
      const content = fs.readFileSync(appPath, "utf8");
      expect(content).toMatch(/["']\/vendor\/fontawesome["']/);
      expect(content).toContain("node_modules/@fortawesome/fontawesome-free");
    });
  });

  describe("3. Audit automatisé des classes fa-* utilisées dans le projet", () => {
    test("toutes les classes fa-* des vues, scripts et services existent dans Font Awesome Free", () => {
      expect(fs.existsSync(FA_CSS_PATH)).toBe(true);
      const cssContent = fs.readFileSync(FA_CSS_PATH, "utf8");
      const definedClasses = extractDefinedFaClasses(cssContent);
      expect(definedClasses.size).toBeGreaterThan(1000);

      const scanRoots = [
        path.join(ROOT_DIR, "views"),
        path.join(ROOT_DIR, "public", "javascripts"),
        path.join(ROOT_DIR, "routes"),
        path.join(ROOT_DIR, "services"),
        path.join(ROOT_DIR, "prisma"),
      ];
      const targetExts = [".ejs", ".html", ".js"];
      const files = scanRoots.flatMap((dir) => walkFiles(dir, targetExts));
      expect(files.length).toBeGreaterThan(0);

      const missing = [];
      const tokenRegex = /(?<![a-z0-9-])(fa-[a-z0-9-]+)/g;

      for (const filePath of files) {
        const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
        lines.forEach((lineText, idx) => {
          let match;
          while ((match = tokenRegex.exec(lineText)) !== null) {
            const className = match[1];
            if (isAllowedUtilityClass(className)) continue;
            if (!definedClasses.has(className)) {
              const relPath = path.relative(ROOT_DIR, filePath);
              missing.push(`${relPath}:${idx + 1}: ${className}`);
            }
          }
        });
      }

      expect(missing).toEqual([]);
    });
  });

  describe("4. Harmonisation des licences", () => {
    test("LICENSE, README.md et views/includes/footer.html mentionnent MIT sans Creative Commons dans footer", () => {
      const licenseText = fs.readFileSync(path.join(ROOT_DIR, "LICENSE"), "utf8");
      const readmeText = fs.readFileSync(path.join(ROOT_DIR, "README.md"), "utf8");
      const footerText = fs.readFileSync(
        path.join(ROOT_DIR, "views", "includes", "footer.html"),
        "utf8",
      );

      expect(licenseText).toContain("MIT");
      expect(readmeText).toContain("MIT");
      expect(footerText).toContain("MIT");
      expect(footerText).not.toMatch(/Creative Commons/i);
    });
  });
});
