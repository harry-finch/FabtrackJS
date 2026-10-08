const mailService = require("../../services/mailService");
const settingsService = require("../../services/settingsService");

describe("Unit: MailService URL Resolution and Sanitization", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("resolveBaseUrl", () => {
    test("prioritizes HOSTURL from environment when present", () => {
      process.env.HOSTURL = "https://fablab.sorbonne-universite.fr/fabtrack/";
      const result = mailService.resolveBaseUrl("https://fablab.sorbonne-universite.fr");
      expect(result).toBe("https://fablab.sorbonne-universite.fr/fabtrack");
    });

    test("prioritizes APP_URL if HOSTURL is not set", () => {
      delete process.env.HOSTURL;
      process.env.APP_URL = "https://fablab.sorbonne-universite.fr/fabtrack";
      const result = mailService.resolveBaseUrl("https://fablab.sorbonne-universite.fr");
      expect(result).toBe("https://fablab.sorbonne-universite.fr/fabtrack");
    });

    test("falls back to customHostUrl if no environment variable is set", () => {
      delete process.env.HOSTURL;
      delete process.env.APP_URL;
      const result = mailService.resolveBaseUrl("https://fablab.sorbonne-universite.fr/custom/");
      expect(result).toBe("https://fablab.sorbonne-universite.fr/custom");
    });

    test("falls back to default localhost:3000 if nothing is provided", () => {
      delete process.env.HOSTURL;
      delete process.env.APP_URL;
      const result = mailService.resolveBaseUrl();
      expect(result).toBe("http://localhost:3000");
    });
  });

  describe("sanitizeLineEndings", () => {
    test("normalizes standalone CR and CRLF to LF", () => {
      const input = "Line1\rLine2\r\nLine3\nLine4";
      const result = mailService.sanitizeLineEndings(input);
      expect(result).toBe("Line1\nLine2\nLine3\nLine4");
    });

    test("handles non-string values gracefully", () => {
      expect(mailService.sanitizeLineEndings(null)).toBe("");
      expect(mailService.sanitizeLineEndings(undefined)).toBe("");
    });
  });

  describe("sendStaffApprovedNotification", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test("skips when staff has no email", async () => {
      const res = await mailService.sendStaffApprovedNotification({
        staff: { name: "Bob", email: "" },
      });
      expect(res).toEqual({ skipped: true, reason: "No staff email" });
    });

    test("skips when mail_notif_staff_approved is false", async () => {
      jest.spyOn(settingsService, "getSettings").mockResolvedValue({
        mail_notif_staff_approved: "false",
      });
      const res = await mailService.sendStaffApprovedNotification({
        staff: { name: "Bob", email: "bob@example.com" },
      });
      expect(res).toEqual({ skipped: true, reason: "Staff approved notification disabled in settings" });
    });

    test("sends email when enabled and email is present", async () => {
      jest.spyOn(settingsService, "getSettings").mockResolvedValue({
        mail_notif_staff_approved: "true",
        platform_name: "Fablab Sorbonne",
      });
      const sendMailSpy = jest.spyOn(mailService, "sendMail").mockResolvedValue({ messageId: "123" });

      const res = await mailService.sendStaffApprovedNotification({
        staff: { name: "Alice", email: "alice@fablab.fr", role: "user" },
        adminUsername: "SuperAdmin",
        hostUrl: "https://fablab.sorbonne.fr",
      });

      expect(sendMailSpy).toHaveBeenCalledTimes(1);
      const mailArgs = sendMailSpy.mock.calls[0][0];
      expect(mailArgs.to).toBe("alice@fablab.fr");
      expect(mailArgs.subject).toBe("[Fablab Sorbonne] Votre compte staff a été validé");
      expect(mailArgs.html).toContain("Alice");
      expect(mailArgs.html).toContain("SuperAdmin");
      expect(mailArgs.html).toContain("Médiateur / Animateur");
      expect(mailArgs.html).toContain("https://fablab.sorbonne.fr/login");
      expect(res).toEqual({ messageId: "123" });
    });
  });
});

