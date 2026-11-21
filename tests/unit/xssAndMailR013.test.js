const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ejs = require("ejs");
const express = require("express");
const request = require("supertest");

const {
  DEFAULT_WARNING_ICON_CLASS,
  escapeHtml,
  safeJson,
  safeHttpUrl,
  sanitizeWarningIcon,
} = require("../../utilities/xssHelpers");
const { reportBugSchema } = require("../../schemas/bug.schema");
const mailService = require("../../services/mailService");
const settingsService = require("../../services/settingsService");

function collectFiles(dir, extensions) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, extensions));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

describe("Unit (R-013): XSS Defense, URL Validation, /report-bug & MailService", () => {
  describe("1. utilities/xssHelpers.js", () => {
    test("safeJson neutralizes </script><img onerror=1> and Unicode line separators while staying valid JSON", () => {
      const payload = {
        xss: "</script><img src=x onerror=1>&test",
        separators: "line1\u2028line2\u2029line3",
      };
      const out = safeJson(payload);
      expect(out).not.toContain("</script>");
      expect(out).not.toContain("<img");
      expect(out).not.toContain("&");
      expect(out).not.toContain("\u2028");
      expect(out).not.toContain("\u2029");
      expect(out).toContain("\\u003c/script\\u003e\\u003cimg");
      expect(JSON.parse(out)).toEqual(payload);
    });

    test("escapeHtml escapes all dangerous HTML characters", () => {
      expect(escapeHtml(`<script>alert("x" & 'y' + \`z\`)</script>`)).toBe(
        "&lt;script&gt;alert(&quot;x&quot; &amp; &#39;y&#39; + &#96;z&#96;)&lt;/script&gt;",
      );
      expect(escapeHtml(null)).toBe("");
      expect(escapeHtml(undefined)).toBe("");
    });

    test("safeHttpUrl accepts strictly http/https and rejects javascript:, data:, vbscript: and control chars", () => {
      expect(safeHttpUrl("https://fablab.example.org/doc?a=1")).toBe("https://fablab.example.org/doc?a=1");
      expect(safeHttpUrl("http://localhost:8080/fabtrack")).toBe("http://localhost:8080/fabtrack");
      expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
      expect(safeHttpUrl("JaVaScRiPt:alert(1)")).toBeNull();
      expect(safeHttpUrl("java\tscript:alert(1)")).toBeNull();
      expect(safeHttpUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
      expect(safeHttpUrl("vbscript:msgbox(1)")).toBeNull();
      expect(safeHttpUrl("//evil.example.org")).toBeNull();
      expect(safeHttpUrl("")).toBeNull();
      expect(safeHttpUrl(null)).toBeNull();
    });

    test("sanitizeWarningIcon whitelists FA classes, extracts legacy <i> tags safely, and blocks HTML/XSS payloads", () => {
      expect(sanitizeWarningIcon("fa-solid fa-ban text-danger")).toBe("fa-solid fa-ban text-danger");
      expect(sanitizeWarningIcon('<i class="fa-solid fa-fire text-warning"></i>')).toBe(
        "fa-solid fa-fire text-warning",
      );
      expect(sanitizeWarningIcon('<img src=x onerror=alert(1)>')).toBe(DEFAULT_WARNING_ICON_CLASS);
      expect(sanitizeWarningIcon('<i class="fa-solid fa-ban" onclick="alert(1)"></i>')).toBe(
        DEFAULT_WARNING_ICON_CLASS,
      );
      expect(sanitizeWarningIcon("<script>alert(1)</script>")).toBe(DEFAULT_WARNING_ICON_CLASS);
      expect(sanitizeWarningIcon("fa-solid evil-class text-danger")).toBe(DEFAULT_WARNING_ICON_CLASS);
    });
  });

  describe("2. Static XSS audit across all EJS/HTML views", () => {
    const viewFiles = collectFiles(path.join(__dirname, "../../views"), [".ejs", ".html"]);

    test("0 occurrences of raw <%- JSON.stringify(...) %> remain in views/", () => {
      const hits = [];
      for (const file of viewFiles) {
        const content = fs.readFileSync(file, "utf8");
        if (/<%-\s*JSON\.stringify\s*\(/.test(content)) {
          hits.push(path.relative(process.cwd(), file));
        }
      }
      expect(hits).toEqual([]);
    });

    test("0 occurrences of raw <%- ...icon %> remain in views/", () => {
      const hits = [];
      for (const file of viewFiles) {
        const content = fs.readFileSync(file, "utf8");
        if (/<%-.*icon/i.test(content)) {
          hits.push(path.relative(process.cwd(), file));
        }
      }
      expect(hits).toEqual([]);
    });

    test("0 occurrences of inline onsubmit/onclick confirm(...) remain in views/", () => {
      const hits = [];
      for (const file of viewFiles) {
        const content = fs.readFileSync(file, "utf8");
        if (/\bon(submit|click)\s*=\s*["'][^"']*confirm\s*\(/i.test(content)) {
          hits.push(path.relative(process.cwd(), file));
        }
      }
      expect(hits).toEqual([]);
    });
  });

  describe("3. Runtime EJS template rendering against real XSS payloads", () => {
    const baseLocals = {
      baseUrl: "/",
      basePath: "",
      csrfToken: "a".repeat(64),
      platformName: "FabtrackJS",
      platformLogoType: "default",
      platformLogoPath: "",
      platformFaviconPath: "",
      currentLocale: "fr",
      currentLocaleFlag: "🇫🇷",
      currentLocaleName: "Français",
      localesMeta: [],
      role: "admin",
      username: "admin",
      currentPath: "/admin",
      notification: "",
      availableWorkspaces: [],
      selectedWorkspace: { id: 1, name: "Atelier" },
      settings: {},
      __: (k) => k,
      escapeHtml,
      safeJson,
      safeHttpUrl,
      sanitizeWarningIcon,
    };

    test("agreement-success.ejs neutralizes javascript: redirectUrl and </script> payloads", () => {
      const templatePath = path.join(__dirname, "../../views/index/agreement-success.ejs");
      const src = fs.readFileSync(templatePath, "utf8");

      const htmlJsScheme = ejs.render(
        src,
        {
          ...baseLocals,
          success: true,
          title: "Merci",
          message: "OK",
          userName: "Alice",
          redirectUrl: "javascript:alert(1)",
          redirectDelay: 5,
        },
        { filename: templatePath },
      );
      expect(htmlJsScheme).not.toContain("javascript:alert(1)");
      expect(htmlJsScheme).not.toContain("window.location.assign");

      const htmlScriptBreak = ejs.render(
        src,
        {
          ...baseLocals,
          success: true,
          title: "Merci",
          message: "OK",
          userName: "Alice",
          redirectUrl: "https://example.org/?q=</script><img onerror=1>",
          redirectDelay: 5,
        },
        { filename: templatePath },
      );
      expect(htmlScriptBreak).not.toContain("</script><img");
      expect(htmlScriptBreak).toContain("%3C/script%3E");
    });

    test("manage-categories.ejs neutralizes ');alert(1);// via data-confirm attribute", () => {
      const templatePath = path.join(__dirname, "../../views/admin/manage-categories.ejs");
      const src = fs.readFileSync(templatePath, "utf8");

      const html = ejs.render(
        src,
        {
          ...baseLocals,
          categories: [{ id: 7, name: "');alert(1);//\"<img onerror=1>", workspaceId: 1, workspace: { name: "Lab" } }],
          workspaces: [{ id: 1, name: "Lab" }],
        },
        { filename: templatePath },
      );
      expect(html).not.toContain("onsubmit=\"return confirm(");
      expect(html).toContain("data-confirm=");
      expect(html).not.toContain("<img onerror=1>");
    });
  });

  describe("4. Client-side main.js data-confirm & pagination.js safe DOM rendering", () => {
    test("main.js cancels form submission when data-confirm dialog is rejected", () => {
      const mainJs = fs.readFileSync(path.join(__dirname, "../../public/javascripts/main.js"), "utf8");
      const listeners = {};
      const confirmMock = jest.fn(() => false);
      const docMock = {
        readyState: "complete",
        documentElement: { appendChild: jest.fn() },
        getElementById: jest.fn(() => ({
          classList: { add: jest.fn(), remove: jest.fn() },
          style: {},
        })),
        createElement: jest.fn(() => ({ classList: { add: jest.fn(), remove: jest.fn() }, style: {} })),
        querySelector: jest.fn(() => null),
        querySelectorAll: jest.fn(() => []),
        addEventListener: jest.fn((evt, cb) => {
          listeners[evt] = cb;
        }),
      };
      const winMock = {
        addEventListener: jest.fn(),
        confirm: confirmMock,
        location: { origin: "http://localhost:8080", pathname: "/admin", search: "", href: "http://localhost:8080/admin" },
        matchMedia: jest.fn(() => ({ matches: false })),
        getCsrfToken: jest.fn(() => "tok"),
        getAppBaseUrl: jest.fn((p) => p),
      };

      vm.runInNewContext(mainJs, { window: winMock, document: docMock, setTimeout, clearTimeout, URL });

      const preventDefault = jest.fn();
      const form = {
        dataset: {},
        action: "http://localhost:8080/admin/categories/delete/1",
        method: "POST",
        getAttribute: jest.fn((attr) => {
          if (attr === "data-confirm") return "Supprimer ');alert(1);// ?";
          if (attr === "method") return "POST";
          return null;
        }),
        querySelector: jest.fn(() => null),
      };

      listeners.submit({ defaultPrevented: false, target: form, preventDefault });

      expect(confirmMock).toHaveBeenCalledWith("Supprimer ');alert(1);// ?");
      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(form.dataset.submitting).toBeUndefined();
    });

    test("pagination.js never uses innerHTML and rejects javascript: links", () => {
      const paginationJs = fs.readFileSync(path.join(__dirname, "../../public/javascripts/pagination.js"), "utf8");
      expect(paginationJs).not.toMatch(/\.innerHTML\s*=/);

      const createdNodes = [];
      const fakeDoc = {
        createElement: (tag) => {
          const el = {
            tagName: tag.toUpperCase(),
            className: "",
            textContent: "",
            children: [],
            attrs: {},
            setAttribute(k, v) {
              this.attrs[k] = v;
            },
            appendChild(child) {
              this.children.push(child);
              return child;
            },
          };
          createdNodes.push(el);
          return el;
        },
        createTextNode: (text) => ({ nodeType: 3, textContent: String(text) }),
      };

      const ctx = { document: fakeDoc, window: {}, URL };
      vm.runInNewContext(paginationJs, ctx);

      const tdPayload = fakeDoc.createElement("td");
      ctx.renderCellContent(tdPayload, "<img src=x onerror=alert(1)>");
      expect(tdPayload.textContent).toBe("<img src=x onerror=alert(1)>");
      expect(tdPayload.children).toHaveLength(0);

      const tdBadLink = fakeDoc.createElement("td");
      ctx.renderCellContent(tdBadLink, { type: "link", url: "javascript:alert(1)", label: "Doc" });
      expect(tdBadLink.children[0].tagName).toBe("SPAN");
      expect(tdBadLink.children[0].textContent).toBe("-");

      const tdGoodLink = fakeDoc.createElement("td");
      ctx.renderCellContent(tdGoodLink, {
        type: "link",
        url: "https://wiki.example.org/book/1",
        label: "Doc",
      });
      expect(tdGoodLink.children[0].tagName).toBe("A");
      expect(tdGoodLink.children[0].href).toBe("https://wiki.example.org/book/1");
      expect(tdGoodLink.children[0].rel).toBe("noopener noreferrer");
    });
  });

  describe("5. POST /report-bug auth guard, schema & mailService HTML escaping/toggles", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test("reportBugSchema rejects javascript: pageUrl and accepts https:", () => {
      const bad = reportBugSchema.safeParse({
        title: "Bug titre",
        description: "Description assez longue pour passer.",
        pageUrl: "javascript:alert(1)",
      });
      expect(bad.success).toBe(false);

      const good = reportBugSchema.safeParse({
        title: "Bug titre",
        description: "Description assez longue pour passer.",
        pageUrl: "https://fablab.example.org/fabtrack",
        severity: "Critique",
      });
      expect(good.success).toBe(true);
    });

    test("POST /report-bug rejects unauthenticated callers (401 JSON / 302 HTML)", async () => {
      const indexRouter = require("../../routes/index");
      if (indexRouter.rateLimiters && indexRouter.rateLimiters.reportBugLimiter) {
        indexRouter.rateLimiters.reportBugLimiter.reset();
      }
      const sendSpy = jest.spyOn(mailService, "sendBugReportAlert").mockResolvedValue({ success: true });

      const app = express();
      app.use(express.urlencoded({ extended: false }));
      app.use(express.json());
      app.use((req, res, next) => {
        req.session = {};
        next();
      });
      app.use("/", indexRouter);

      const resJson = await request(app)
        .post("/report-bug")
        .set("Accept", "application/json")
        .send({ title: "Spam bug", description: "Anonymous spam payload" });
      expect(resJson.status).toBe(401);
      expect(sendSpy).not.toHaveBeenCalled();

      const resHtml = await request(app)
        .post("/report-bug")
        .type("form")
        .send({ title: "Spam bug", description: "Anonymous spam payload" });
      expect(resHtml.status).toBe(302);
      expect(resHtml.headers.location).toBe("/login");
      expect(sendSpy).not.toHaveBeenCalled();
    });

    test("mailService escapes HTML payloads and drops javascript: URLs in bug report & warning emails", async () => {
      jest.spyOn(settingsService, "getSettings").mockResolvedValue({
        mail_notif_bug_report: "true",
        mail_notif_user_warning: "true",
        mail_notif_staff_registration: "true",
        mail_admin_recipient: "admin@fablab.fr",
      });
      jest.spyOn(mailService, "getTransporter").mockResolvedValue({
        transporter: { sendMail: jest.fn() },
        from: "noreply@fablab.fr",
        adminRecipient: "admin@fablab.fr",
        settings: {},
      });
      const sendMailSpy = jest.spyOn(mailService, "sendMail").mockResolvedValue({ success: true });

      await mailService.sendBugReportAlert({
        title: "<script>alert(1)</script>",
        category: "<b>Cat</b>",
        description: "<img src=x onerror=alert(2)>",
        pageUrl: "javascript:alert(3)",
        reporterName: "<svg onload=alert(4)>",
        reporterEmail: "a@b.fr",
        severity: "Critique",
        hostUrl: "https://fablab.example.org",
      });

      expect(sendMailSpy).toHaveBeenCalledTimes(1);
      const bugHtml = sendMailSpy.mock.calls[0][0].html;
      expect(bugHtml).not.toContain("<script>alert(1)</script>");
      expect(bugHtml).not.toContain("<img src=x onerror=alert(2)>");
      expect(bugHtml).not.toContain("<svg onload=alert(4)>");
      expect(bugHtml).not.toContain("javascript:alert(3)");
      expect(bugHtml).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
      expect(bugHtml).toContain("&lt;img src=x onerror=alert(2)&gt;");
      expect(bugHtml).toContain("https://fablab.example.org/fabtrack");

      sendMailSpy.mockClear();

      await mailService.sendWarningAlert({
        user: { id: 42, name: "<img onerror=1>", surname: "Dupont", email: "u@example.org" },
        warningtype: { name: "<b>Safety</b>" },
        comments: "<script>evil()</script>",
        staffUsername: "<i>Med</i>",
      });

      const warnHtml = sendMailSpy.mock.calls[0][0].html;
      expect(warnHtml).not.toContain("<script>evil()</script>");
      expect(warnHtml).not.toContain("<img onerror=1>");
      expect(warnHtml).toContain("&lt;script&gt;evil()&lt;/script&gt;");
    });

    test("mailService respects mail_notif_staff_registration and mail_notif_bug_report toggles", async () => {
      jest.spyOn(settingsService, "getSettings").mockResolvedValue({
        mail_notif_staff_registration: "false",
        mail_notif_bug_report: "false",
      });
      const sendMailSpy = jest.spyOn(mailService, "sendMail").mockResolvedValue({ success: true });

      const staffRes = await mailService.sendStaffRegisteredAlert({
        username: "newstaff",
        email: "newstaff@example.org",
        hostUrl: "https://fablab.example.org",
      });
      expect(staffRes).toEqual({
        skipped: true,
        reason: "Staff registration notification disabled in settings",
      });

      const bugRes = await mailService.sendBugReportAlert({
        title: "Test bug",
        category: "Bug",
        description: "Test description",
        severity: "Moyenne",
        hostUrl: "https://fablab.example.org",
      });
      expect(bugRes).toEqual({
        skipped: true,
        reason: "Bug report notification disabled in settings",
      });

      expect(sendMailSpy).not.toHaveBeenCalled();
    });
  });
});
