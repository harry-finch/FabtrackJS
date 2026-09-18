const mailService = require("../../services/mailService");

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
});
