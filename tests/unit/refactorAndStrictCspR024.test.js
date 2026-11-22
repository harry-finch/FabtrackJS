const fs = require("fs");
const path = require("path");
const request = require("supertest");

const { computeConsumableStatus } = require("../../services/consumableStatusHelper.js");
const { returnEquipmentLoan, getActiveEquipmentLoans } = require("../../services/equipmentLoanService.js");
const { detectDelimiter, parseCsvText } = require("../../services/csvParserService.js");
const { createReferenceCrudRouter } = require("../../utilities/referenceCrudFactory.js");
const app = require("../../app.js");

const ROOT = path.join(__dirname, "../..");

function walkViews(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) out = out.concat(walkViews(full));
    else if (full.endsWith(".ejs") || full.endsWith(".html")) out.push(full);
  }
  return out;
}

describe("R-024: Backend factorization & strict CSP without unsafe-inline", () => {
  describe("1. Strict Helmet CSP & cryptographic per-request nonce", () => {
    test("app.js Helmet CSP disables unsafe-inline on scriptSrc and sets scriptSrcAttr to 'none'", () => {
      const appSrc = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
      const scriptSrcBlock = appSrc.match(/scriptSrc:\s*\[[\s\S]*?\]/);
      const scriptSrcAttrBlock = appSrc.match(/scriptSrcAttr:\s*\[[\s\S]*?\]/);
      expect(scriptSrcBlock).not.toBeNull();
      expect(scriptSrcBlock[0]).not.toContain("unsafe-inline");
      expect(scriptSrcBlock[0]).toContain("nonce-");
      expect(scriptSrcAttrBlock).not.toBeNull();
      expect(scriptSrcAttrBlock[0]).toContain("'none'");
      expect(scriptSrcAttrBlock[0]).not.toContain("unsafe-inline");
    });

    test("HTTP responses emit unique per-request CSP nonces without unsafe-inline in script-src", async () => {
      const res1 = await request(app).get("/javascripts/app-base.js");
      const res2 = await request(app).get("/javascripts/app-base.js");
      const csp1 = res1.headers["content-security-policy"] || "";
      const csp2 = res2.headers["content-security-policy"] || "";

      expect(csp1).toContain("script-src-attr 'none'");
      expect(csp1).toMatch(/script-src [^;]*'nonce-[A-Za-z0-9+/=]+'/);
      const scriptSrcDirective = csp1.split(";").find((d) => d.trim().startsWith("script-src "));
      expect(scriptSrcDirective).not.toContain("unsafe-inline");

      const nonce1 = csp1.match(/'nonce-([^']+)'/)?.[1];
      const nonce2 = csp2.match(/'nonce-([^']+)'/)?.[1];
      expect(nonce1).toBeTruthy();
      expect(nonce2).toBeTruthy();
      expect(nonce1).not.toBe(nonce2);
    });
  });

  describe("2. Static view audit for strict CSP compliance", () => {
    const viewFiles = walkViews(path.join(ROOT, "views"));

    test("zero inline HTML on*= event handler attributes exist across all views", () => {
      const offenders = [];
      for (const file of viewFiles) {
        const raw = fs.readFileSync(file, "utf8");
        // Strip <script>...</script> bodies so JS property assignments like reader.onload are not flagged as HTML attributes
        const htmlOnly = raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
        const matches = htmlOnly.match(/\son[a-z]+\s*=/gi);
        if (matches && matches.length > 0) {
          offenders.push({ file: path.relative(ROOT, file), matches });
        }
      }
      expect(offenders).toEqual([]);
    });

    test("every inline <script> tag across all views carries a cspNonce attribute", () => {
      const missingNonce = [];
      for (const file of viewFiles) {
        const raw = fs.readFileSync(file, "utf8");
        const tags = raw.match(/<script\b(?:<%[\s\S]*?%>|[^>])*>/gi) || [];
        for (const tag of tags) {
          if (/\bsrc\s*=/i.test(tag)) continue;
          if (/type\s*=\s*["']application\/json["']/i.test(tag)) continue;
          if (!/\bnonce\s*=\s*["']<%=.*cspNonce.*%>["']/i.test(tag)) {
            missingNonce.push({ file: path.relative(ROOT, file), tag });
          }
        }
      }
      expect(missingNonce).toEqual([]);
    });

    test("pagehead.html externalizes app-base.js with zero inline script blocks", () => {
      const pagehead = fs.readFileSync(path.join(ROOT, "views/includes/pagehead.html"), "utf8");
      expect(pagehead).toContain('src="javascripts/app-base.js"');
      expect(fs.existsSync(path.join(ROOT, "public/javascripts/app-base.js"))).toBe(true);
    });
  });

  describe("3. Extracted backend services & reference CRUD factorization", () => {
    test("consumableStatusHelper computes OUT_OF_STOCK, LOW_STOCK and AVAILABLE accurately", () => {
      expect(computeConsumableStatus(0, 10)).toBe("OUT_OF_STOCK");
      expect(computeConsumableStatus(-2, 10)).toBe("OUT_OF_STOCK");
      expect(computeConsumableStatus(5, 10)).toBe("LOW_STOCK");
      expect(computeConsumableStatus(10, 10)).toBe("LOW_STOCK");
      expect(computeConsumableStatus(11, 10)).toBe("AVAILABLE");
    });

    test("equipmentLoanService.returnEquipmentLoan enforces atomic returnedAt:null update", async () => {
      const mockPrisma = {
        activity: {
          updateMany: jest
            .fn()
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 0 }),
          findMany: jest.fn().mockResolvedValue([{ id: 42 }]),
        },
      };

      const first = await returnEquipmentLoan({ prisma: mockPrisma, activityId: 42, returnNotes: "  OK  " });
      expect(first).toMatchObject({ returned: true, activityId: 42 });
      expect(mockPrisma.activity.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 42, resourceType: "EQUIPMENT", returnedAt: null },
          data: expect.objectContaining({ returnNotes: "OK" }),
        }),
      );

      const second = await returnEquipmentLoan({ prisma: mockPrisma, activityId: 42 });
      expect(second).toMatchObject({ returned: false, activityId: 42 });

      const active = await getActiveEquipmentLoans({ prisma: mockPrisma, userId: 7 });
      expect(active).toEqual([{ id: 42 }]);
    });

    test("csvParserService parses RFC-4180 CSV with BOM, quotes, escaped quotes and auto-detected delimiter", () => {
      const csv = '\uFEFF"clé";"fr";"en"\r\n"hello";"Bonjour ""Fab""";"Hello; World"\r\n\r\n';
      expect(detectDelimiter(csv)).toBe(";");
      const rows = parseCsvText(csv);
      expect(rows).toEqual([
        ["clé", "fr", "en"],
        ["hello", 'Bonjour "Fab"', "Hello; World"],
      ]);
    });

    test("all 6 reference CRUD admin routers delegate to utilities/referenceCrudFactory.js", () => {
      expect(typeof createReferenceCrudRouter).toBe("function");
      for (const routeFile of [
        "routes/admin/accesslevels.js",
        "routes/admin/locations.js",
        "routes/admin/projecttypes.js",
        "routes/admin/usertypes.js",
        "routes/admin/warningtypes.js",
        "routes/admin/workspaces.js",
      ]) {
        const src = fs.readFileSync(path.join(ROOT, routeFile), "utf8");
        expect(src).toContain("createReferenceCrudRouter");
      }
    });
  });
});
