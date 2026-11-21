const fs = require("fs");
const path = require("path");
const express = require("express");
const request = require("supertest");
const { z } = require("zod");

const {
  getSafeRedirectPath,
  resolveSafeRedirectUrl,
  escapeCsvCell,
  sanitizeContentDispositionFilename,
} = require("../../utilities/securityHelpers");
const i18nService = require("../../services/i18nService");
const settingsService = require("../../services/settingsService");
const { validateBody } = require("../../middleware/validate");

describe("Unit (R-015): Transverse Injections (Prototype Pollution, Open Redirect, CSV) & Secret Exposure", () => {
  describe("1. Prototype Pollution defense in i18nService.unflattenObject", () => {
    test("blocks __proto__, constructor, and prototype segments and uses null-prototype objects", () => {
      const result = i18nService.unflattenObject({
        "__proto__.polluted": "1",
        "constructor.prototype.pwned": "1",
        "nested.__proto__.evil": "1",
        "prototype.bad": "1",
        "auth.signin_title": "Connexion",
      });

      expect(({}).polluted).toBeUndefined();
      expect(({}).pwned).toBeUndefined();
      expect(({}).evil).toBeUndefined();
      expect(Object.getPrototypeOf(result)).toBeNull();
      expect(result.auth.signin_title).toBe("Connexion");
      expect(Object.getPrototypeOf(result.auth)).toBeNull();
      expect(result.nested).toBeUndefined();
      expect(result.prototype).toBeUndefined();
    });
  });

  describe("2. Open Redirect defense (getSafeRedirectPath, resolveSafeRedirectUrl & validateBody)", () => {
    const mockReq = (referer, host = "localhost:8080") => ({
      protocol: "http",
      headers: { referer, host },
      get: (h) => (h.toLowerCase() === "host" ? host : undefined),
    });

    test("allows same-origin referer and returns relative path with query/hash", () => {
      const req = mockReq("http://localhost:8080/admin/users?page=2#top");
      expect(getSafeRedirectPath(req, "/fabtrack")).toBe("/admin/users?page=2#top");
    });

    test("rejects external host, protocol-relative URL, javascript:, and CR/LF injection", () => {
      expect(getSafeRedirectPath(mockReq("https://evil.example.com/phish"), "/fabtrack")).toBe("/fabtrack");
      expect(getSafeRedirectPath(mockReq("//evil.example.com/phish"), "/fabtrack")).toBe("/fabtrack");
      expect(getSafeRedirectPath(mockReq("javascript:alert(1)"), "/fabtrack")).toBe("/fabtrack");
      expect(getSafeRedirectPath(mockReq("http://localhost:8080/ok\r\nX-Injected: 1"), "/fabtrack")).toBe("/fabtrack");
      expect(resolveSafeRedirectUrl("https://evil.example.com/x", mockReq(""), "/login")).toBe("/login");
      expect(resolveSafeRedirectUrl("//evil.example.com/x", mockReq(""), "/login")).toBe("/login");
      expect(resolveSafeRedirectUrl("/admin/settings", mockReq(""), "/login")).toBe("/admin/settings");
    });

    test("validateBody never redirects to an external Referer header on validation failure", async () => {
      const app = express();
      app.use(express.urlencoded({ extended: false }));
      app.use((req, res, next) => {
        req.session = {};
        next();
      });
      app.post(
        "/test-form",
        validateBody(z.object({ name: z.string().min(3) })),
        (req, res) => res.send("ok"),
      );

      const res = await request(app)
        .post("/test-form")
        .set("Referer", "https://attacker.evil.com/steal")
        .type("form")
        .send({ name: "a" });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/fabtrack");
    });
  });

  describe("3. CSV Formula Injection & Content-Disposition filename sanitization", () => {
    test("escapeCsvCell neutralizes =, +, -, @, tab, CR prefixes and escapes quotes", () => {
      expect(escapeCsvCell("=1+1")).toBe(`"'=1+1"`);
      expect(escapeCsvCell("+CMD|' /C calc'!A0")).toBe(`"'+CMD|' /C calc'!A0"`);
      expect(escapeCsvCell("-2+3")).toBe(`"'-2+3"`);
      expect(escapeCsvCell("@SUM(1,1)")).toBe(`"'@SUM(1,1)"`);
      expect(escapeCsvCell("\t=1+1")).toBe(`"'\t=1+1"`);
      expect(escapeCsvCell('Hello "world"')).toBe(`"Hello ""world"""`);
      expect(escapeCsvCell(42)).toBe('"42"');
      expect(i18nService.escapeCsvValue("=HYPERLINK(\"http://evil\")")).toBe(
        `"'=HYPERLINK(""http://evil"")"`,
      );
    });

    test("sanitizeContentDispositionFilename strips header injection & traversal characters", () => {
      expect(sanitizeContentDispositionFilename('report"\r\nSet-Cookie: evil=1.csv')).toBe(
        "report_Set-Cookie_evil_1.csv",
      );
      expect(sanitizeContentDispositionFilename("../../etc/passwd")).toBe("etc_passwd");
      expect(sanitizeContentDispositionFilename("", "fallback.csv")).toBe("fallback.csv");
    });
  });

  describe("4. Secret exposure filtering (res.locals.settings, manage-settings.ejs, /api/list/*)", () => {
    test("settingsService.filterPublicSettings strips all API keys, tokens, and SMTP password", () => {
      const fullSettings = {
        ...settingsService.getDefaults(),
        platform_name: "FabLab Sorbonne",
        api_machine_token: "fabtrack_secret_123",
        smtp_pass: "super-smtp-secret",
        bookstack_token_id: "bs-id",
        bookstack_token_secret: "bs-secret",
        ai_openai_api_key: "sk-proj-secret",
        ai_gemini_api_key: "AIza-secret",
        ai_anthropic_api_key: "sk-ant-secret",
        ai_local_api_key: "local-secret",
        platform_installed: "true",
      };

      const filtered = settingsService.filterPublicSettings(fullSettings);

      expect(filtered.platform_name).toBe("FabLab Sorbonne");
      expect(filtered.platform_installed).toBe("true");
      expect(filtered.api_machine_token).toBeUndefined();
      expect(filtered.smtp_pass).toBeUndefined();
      expect(filtered.bookstack_token_id).toBeUndefined();
      expect(filtered.bookstack_token_secret).toBeUndefined();
      expect(filtered.ai_openai_api_key).toBeUndefined();
      expect(filtered.ai_gemini_api_key).toBeUndefined();
      expect(filtered.ai_anthropic_api_key).toBeUndefined();
      expect(filtered.ai_local_api_key).toBeUndefined();
    });

    test("views/admin/manage-settings.ejs never renders secret values into HTML input attributes", () => {
      const tpl = fs.readFileSync(path.join(__dirname, "../../views/admin/manage-settings.ejs"), "utf8");
      expect(tpl).not.toContain("settings.api_machine_token");
      expect(tpl).not.toContain("settings.ai_openai_api_key");
      expect(tpl).not.toContain("settings.ai_gemini_api_key");
      expect(tpl).not.toContain("settings.ai_anthropic_api_key");
      expect(tpl).not.toContain("settings.ai_local_api_key");
    });

    test("routes/api.js enforces explicit select projections without password/pwdToken/token/rfid on /api/list/*", () => {
      const apiSrc = fs.readFileSync(path.join(__dirname, "../../routes/api.js"), "utf8");

      const staffBlock = apiSrc.slice(apiSrc.indexOf('"/list/all-staff"'), apiSrc.indexOf('"/list/all-usertypes"'));
      expect(staffBlock).toContain("select:");
      expect(staffBlock).not.toContain("password");
      expect(staffBlock).not.toContain("pwdToken");
      expect(staffBlock).not.toContain("tokenExpiry");

      const usersBlock = apiSrc.slice(apiSrc.indexOf('"/list/all-users"'), apiSrc.indexOf('"/list/all-history"'));
      expect(usersBlock).toContain("select:");
      expect(usersBlock).not.toContain("token:");
      expect(usersBlock).not.toContain("rfid:");
    });
  });
});
