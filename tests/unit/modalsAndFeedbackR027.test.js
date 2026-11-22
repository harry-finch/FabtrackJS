const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ejs = require("ejs");
const express = require("express");
const request = require("supertest");

const ROOT_DIR = path.resolve(__dirname, "../..");
const VIEWS_DIR = path.join(ROOT_DIR, "views");
const PUBLIC_JS_DIR = path.join(ROOT_DIR, "public/javascripts");

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

const mockPrisma = {
  machine: {
    findMany: jest.fn().mockResolvedValue([]),
  },
};

jest.mock("../../utilities/db.js", () => ({
  prisma: mockPrisma,
}));

jest.mock("../../services/mailService.js", () => ({
  sendMachineIssueAlert: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("../../utilities/simpleLogger.js", () => ({
  logThat: jest.fn(),
}));

describe("Unit R-027: Reusable Bootstrap modals, toast cleanup & error feedback", () => {
  describe("1. Zero native browser dialogs (alert / confirm / prompt)", () => {
    test("no views or public client scripts invoke native alert(), confirm(), or prompt()", () => {
      const files = [
        ...walkFiles(VIEWS_DIR, [".ejs", ".html"]),
        ...walkFiles(PUBLIC_JS_DIR, [".js"]),
      ];
      // Match bare or window-qualified alert(, confirm(, prompt( (excluding identifiers like fabtrackConfirm)
      const nativeDialogRegex = /(?:^|[^.\w$])(?:window\.)?(alert|confirm|prompt)\s*\(/gm;
      const violations = [];

      for (const file of files) {
        const content = fs.readFileSync(file, "utf8");
        // Strip single-line // comments and block /* */ comments so docstrings don't trigger false positives
        const stripped = content
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/(^|\s)\/\/.*$/gm, "");
        let match;
        while ((match = nativeDialogRegex.exec(stripped)) !== null) {
          violations.push(`${path.relative(ROOT_DIR, file)}: ${match[0].trim()}`);
        }
      }

      expect(violations).toEqual([]);
    });

    test("footer.html and setup/index.ejs include confirm-modal.html and dialogs.js", () => {
      const footer = fs.readFileSync(path.join(VIEWS_DIR, "includes/footer.html"), "utf8");
      const setup = fs.readFileSync(path.join(VIEWS_DIR, "setup/index.ejs"), "utf8");

      expect(footer).toContain("confirm-modal.html");
      expect(footer).toContain("javascripts/dialogs.js");
      expect(setup).toContain("confirm-modal.html");
      expect(setup).toContain("javascripts/dialogs.js");
    });
  });

  describe("2. Reusable Bootstrap dialog API (public/javascripts/dialogs.js)", () => {
    function createDialogHarness() {
      const source = fs.readFileSync(path.join(PUBLIC_JS_DIR, "dialogs.js"), "utf8");
      const listeners = {};
      const makeEl = (id, attrs = {}) => {
        const classes = new Set();
        return {
          id,
          className: "",
          textContent: "",
          value: "",
          placeholder: "",
          classList: {
            add: (...cls) => cls.forEach((c) => classes.add(c)),
            remove: (...cls) => cls.forEach((c) => classes.delete(c)),
            contains: (c) => classes.has(c),
          },
          getAttribute: (name) => attrs[name] || null,
          addEventListener: (evt, cb) => {
            listeners[`${id}:${evt}`] = cb;
          },
          removeEventListener: (evt) => {
            delete listeners[`${id}:${evt}`];
          },
          focus: jest.fn(),
          select: jest.fn(),
        };
      };

      const elements = {
        fabtrackDialogModal: makeEl("fabtrackDialogModal", {
          "data-label-confirm": "Confirmer",
          "data-label-cancel": "Annuler",
          "data-label-close": "Fermer",
          "data-label-warning": "Avertissement",
        }),
        fabtrackDialogTitleText: makeEl("fabtrackDialogTitleText"),
        fabtrackDialogIconWrap: makeEl("fabtrackDialogIconWrap"),
        fabtrackDialogIcon: makeEl("fabtrackDialogIcon"),
        fabtrackDialogMessage: makeEl("fabtrackDialogMessage"),
        fabtrackDialogInputWrapper: makeEl("fabtrackDialogInputWrapper"),
        fabtrackDialogInputLabel: makeEl("fabtrackDialogInputLabel"),
        fabtrackDialogInput: makeEl("fabtrackDialogInput"),
        fabtrackDialogCancelBtn: makeEl("fabtrackDialogCancelBtn"),
        fabtrackDialogConfirmBtn: makeEl("fabtrackDialogConfirmBtn"),
      };

      const modalControls = {
        show: jest.fn(() => {
          if (listeners["fabtrackDialogModal:shown.bs.modal"]) {
            listeners["fabtrackDialogModal:shown.bs.modal"]();
          }
        }),
        hide: jest.fn(() => {
          if (listeners["fabtrackDialogModal:hidden.bs.modal"]) {
            listeners["fabtrackDialogModal:hidden.bs.modal"]();
          }
        }),
      };

      const windowObj = {
        bootstrap: {
          Modal: {
            getOrCreateInstance: jest.fn(() => modalControls),
          },
        },
      };

      const documentObj = {
        activeElement: { focus: jest.fn() },
        getElementById: (id) => elements[id] || null,
      };

      vm.runInNewContext(source, { window: windowObj, document: documentObj }, { filename: "dialogs.js" });

      return { window: windowObj, elements, listeners, modalControls };
    }

    test("fabtrackConfirm resolves true on confirm click and false on dismiss", async () => {
      const h = createDialogHarness();

      const pAccept = h.window.fabtrackConfirm({ message: "Supprimer cet élément ?", variant: "danger" });
      await Promise.resolve();
      expect(h.elements.fabtrackDialogMessage.textContent).toBe("Supprimer cet élément ?");
      expect(h.elements.fabtrackDialogCancelBtn.focus).toHaveBeenCalled();
      h.listeners["fabtrackDialogConfirmBtn:click"]();
      await expect(pAccept).resolves.toBe(true);

      const pCancel = h.window.fabtrackConfirm("Autre suppression ?");
      await Promise.resolve();
      h.listeners["fabtrackDialogModal:hidden.bs.modal"]();
      await expect(pCancel).resolves.toBe(false);
    });

    test("fabtrackPrompt returns entered value on Enter key and null on dismiss", async () => {
      const h = createDialogHarness();

      const pPrompt = h.window.fabtrackPrompt({
        title: "Badge RFID",
        message: "UID :",
        placeholder: "04A1B2",
      });
      await Promise.resolve();
      expect(h.elements.fabtrackDialogInputWrapper.classList.contains("d-none")).toBe(false);
      h.elements.fabtrackDialogInput.value = "DEADBEEF";
      h.listeners["fabtrackDialogInput:keydown"]({ key: "Enter", preventDefault: jest.fn() });
      await expect(pPrompt).resolves.toBe("DEADBEEF");

      const pCancel = h.window.fabtrackPrompt("UID :");
      await Promise.resolve();
      h.listeners["fabtrackDialogModal:hidden.bs.modal"]();
      await expect(pCancel).resolves.toBeNull();
    });
  });

  describe("3. Toast prefix stripping & window.showAppToast (public/javascripts/notifications.js)", () => {
    function runNotificationsHarness(initialRawText) {
      const source = fs.readFileSync(path.join(PUBLIC_JS_DIR, "notifications.js"), "utf8");
      const toastClasses = new Set(["toast", "text-bg-secondary"]);
      const closeClasses = new Set(["btn-close", "btn-close-white"]);
      const createdNodes = [];

      function createNode(tag) {
        const node = {
          tagName: tag.toUpperCase(),
          className: "",
          textContent: "",
          attrs: {},
          children: [],
          setAttribute: (k, v) => {
            node.attrs[k] = v;
          },
          appendChild: (child) => {
            node.children.push(child);
            return child;
          },
        };
        createdNodes.push(node);
        return node;
      }

      const toastBody = {
        textContent: initialRawText,
        children: [],
        appendChild: (child) => {
          toastBody.children.push(child);
          return child;
        },
      };

      const closeBtn = {
        classList: {
          add: (c) => closeClasses.add(c),
          remove: (c) => closeClasses.delete(c),
          contains: (c) => closeClasses.has(c),
        },
      };

      const toastEl = {
        classList: {
          add: (c) => toastClasses.add(c),
          remove: (c) => toastClasses.delete(c),
          contains: (c) => toastClasses.has(c),
        },
        querySelector: (sel) => {
          if (sel === ".toast-body") return toastBody;
          if (sel === ".btn-close") return closeBtn;
          return null;
        },
      };

      const showMock = jest.fn();
      const windowObj = {
        bootstrap: {
          Toast: {
            getOrCreateInstance: jest.fn(() => ({ show: showMock })),
          },
        },
      };
      const documentObj = {
        getElementById: (id) => (id === "liveToastMessage" ? toastEl : null),
        createElement: createNode,
      };

      vm.runInNewContext(source, { window: windowObj, document: documentObj }, { filename: "notifications.js" });
      return { window: windowObj, toastBody, toastClasses, closeClasses, showMock };
    }

    test.each([
      { raw: "Success: Enregistré avec succès.", bg: "text-bg-success", clean: "Enregistré avec succès.", whiteClose: true },
      { raw: "Error: Champ invalide.", bg: "text-bg-danger", clean: "Champ invalide.", whiteClose: true },
      { raw: "Warning: Stock faible.", bg: "text-bg-warning", clean: "Stock faible.", whiteClose: false },
      { raw: "Info: Mode démonstration.", bg: "text-bg-info", clean: "Mode démonstration.", whiteClose: false },
    ])("strips raw prefix from '$raw' and applies $bg", ({ raw, bg, clean, whiteClose }) => {
      const h = runNotificationsHarness(raw);
      expect(h.showMock).toHaveBeenCalledTimes(1);
      expect(h.toastClasses.has(bg)).toBe(true);
      expect(h.toastClasses.has("text-bg-secondary")).toBe(false);
      expect(h.closeClasses.has("btn-close-white")).toBe(whiteClose);
      const renderedText = h.toastBody.children[0].children[1].textContent;
      expect(renderedText).toBe(clean);
      expect(renderedText).not.toMatch(/^(Success|Error|Warning|Info)\s*:/i);
    });

    test("exports window.showAppToast for client-side feedback", () => {
      const h = runNotificationsHarness("");
      expect(h.showMock).not.toHaveBeenCalled();

      const ok = h.window.showAppToast("Adresses copiées", "success");
      expect(ok).toBe(true);
      expect(h.showMock).toHaveBeenCalledTimes(1);
      expect(h.toastClasses.has("text-bg-success")).toBe(true);
    });
  });

  describe("4. /report-issue clears & displays notifications; login.ejs & reset.ejs", () => {
    test("GET /report-issue consumes req.session.notification and renders clean alert banner", async () => {
      const reportIssueRouter = require("../../routes/report-issue.js");
      const app = express();
      app.set("views", VIEWS_DIR);
      app.set("view engine", "ejs");
      app.engine("html", ejs.renderFile);

      const sessionObj = {
        notification: "Error: Format de fichier non pris en charge.",
      };
      app.use((req, res, next) => {
        req.session = sessionObj;
        res.locals.baseUrl = "/";
        res.locals.basePath = "";
        res.locals.csrfToken = "test-csrf";
        res.locals.cspNonce = "test-nonce";
        res.locals.platformName = "FabtrackJS";
        next();
      });
      app.use("/report-issue", reportIssueRouter);

      const res = await request(app).get("/report-issue");
      expect(res.status).toBe(200);
      expect(sessionObj.notification).toBe("");
      expect(res.text).toContain('id="reportIssueNotification"');
      expect(res.text).toContain("alert-danger");
      expect(res.text).toContain("Format de fichier non pris en charge.");
      expect(res.text).not.toContain("Error: Format de fichier non pris en charge.");
    });

    test("login.ejs removes dead rememberMe checkbox and reset.ejs uses user.name + #warning", () => {
      const loginHtml = fs.readFileSync(path.join(VIEWS_DIR, "index/login.ejs"), "utf8");
      const resetHtml = fs.readFileSync(path.join(VIEWS_DIR, "index/reset.ejs"), "utf8");

      expect(loginHtml).not.toContain("rememberMe");
      expect(loginHtml).not.toContain("remember_me");
      expect(resetHtml).toContain("user.name");
      expect(resetHtml).not.toContain("user.nom");
      expect(resetHtml).toContain('id="warning"');
    });
  });
});
