const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  UPLOAD_PROFILES,
  detectImageFormatFromBuffer,
  detectImageFormatFromFile,
  matchesExtensionAndMime,
  createImageFileFilter,
  verifyAndFinalizeUploadedFile,
  safeUnlinkInDir,
  validatePictureField,
  applyUploadStaticHeaders,
} = require("../../services/uploadSecurityService");
const { createRateLimiter } = require("../../middleware/rateLimit");

describe("Unit: UploadSecurityService & RateLimiter", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fabtrack-upload-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("detectImageFormatFromBuffer & detectImageFormatFromFile", () => {
    test("recognizes PNG, JPEG, GIF, WEBP and ICO magic bytes", () => {
      const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
      const jpgBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
      const gifBuf = Buffer.from("GIF89a\x01\x00");
      const webpBuf = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]);
      const icoBuf = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);

      expect(detectImageFormatFromBuffer(pngBuf)).toBe("png");
      expect(detectImageFormatFromBuffer(jpgBuf)).toBe("jpg");
      expect(detectImageFormatFromBuffer(gifBuf)).toBe("gif");
      expect(detectImageFormatFromBuffer(webpBuf)).toBe("webp");
      expect(detectImageFormatFromBuffer(icoBuf)).toBe("ico");
    });

    test("rejects HTML, SVG and plain text payloads disguised as images", () => {
      expect(detectImageFormatFromBuffer(Buffer.from("<script>alert(1)</script>"))).toBeNull();
      expect(detectImageFormatFromBuffer(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();

      const fakePath = path.join(tmpDir, "fake.jpg");
      fs.writeFileSync(fakePath, "<html><body>XSS</body></html>");
      expect(detectImageFormatFromFile(fakePath)).toBeNull();
    });
  });

  describe("strict AND extension + MIME pre-filter", () => {
    test("requires BOTH extension and MIME type to match the same allowed raster format", () => {
      expect(
        matchesExtensionAndMime(
          { originalname: "photo.jpg", mimetype: "image/jpeg" },
          UPLOAD_PROFILES.ISSUE_PHOTO,
        ),
      ).toBe(true);

      // HTML extension with spoofed image MIME -> rejected
      expect(
        matchesExtensionAndMime(
          { originalname: "xss.html", mimetype: "image/png" },
          UPLOAD_PROFILES.ISSUE_PHOTO,
        ),
      ).toBe(false);

      // Image extension with HTML MIME -> rejected
      expect(
        matchesExtensionAndMime(
          { originalname: "photo.jpg", mimetype: "text/html" },
          UPLOAD_PROFILES.ISSUE_PHOTO,
        ),
      ).toBe(false);

      // SVG rejected for branding logos (Option A)
      expect(
        matchesExtensionAndMime(
          { originalname: "logo.svg", mimetype: "image/svg+xml" },
          UPLOAD_PROFILES.BRANDING_LOGO,
        ),
      ).toBe(false);
    });

    test("createImageFileFilter calls cb with INVALID_FILE_TYPE error on mismatch", () => {
      const filter = createImageFileFilter(UPLOAD_PROFILES.ISSUE_PHOTO, "Rejeté");
      const cb = jest.fn();
      filter({}, { originalname: "payload.svg", mimetype: "image/png" }, cb);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(cb.mock.calls[0][0].code).toBe("INVALID_FILE_TYPE");
    });
  });

  describe("verifyAndFinalizeUploadedFile", () => {
    test("renames valid image file canonically according to detected magic bytes", () => {
      const uploadPath = path.join(tmpDir, "temp-123.upload");
      fs.writeFileSync(uploadPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]));
      const file = { path: uploadPath, filename: "temp-123.upload" };

      const result = verifyAndFinalizeUploadedFile(file, {
        allowedFormats: UPLOAD_PROFILES.ISSUE_PHOTO,
        targetDir: tmpDir,
        prefix: "issue-",
      });

      expect(result.format).toBe("png");
      expect(result.filename).toMatch(/^issue-\d+-[a-f0-9]{12}\.png$/);
      expect(fs.existsSync(uploadPath)).toBe(false);
      expect(fs.existsSync(result.filePath)).toBe(true);
    });

    test("deletes spoofed file immediately and throws when magic bytes fail", () => {
      const spoofedPath = path.join(tmpDir, "spoofed.upload");
      fs.writeFileSync(spoofedPath, "<!DOCTYPE html><script>alert(1)</script>");
      const file = { path: spoofedPath, filename: "spoofed.upload" };

      expect(() =>
        verifyAndFinalizeUploadedFile(file, {
          allowedFormats: UPLOAD_PROFILES.ISSUE_PHOTO,
          targetDir: tmpDir,
          prefix: "issue-",
        }),
      ).toThrow();

      expect(fs.existsSync(spoofedPath)).toBe(false);
      expect(fs.readdirSync(tmpDir)).toHaveLength(0);
    });
  });

  describe("safeUnlinkInDir", () => {
    test("deletes a regular file strictly inside baseDir", () => {
      const issuesDir = path.join(tmpDir, "issues");
      fs.mkdirSync(issuesDir);
      const target = path.join(issuesDir, "issue-1.png");
      fs.writeFileSync(target, "img");

      expect(safeUnlinkInDir(issuesDir, "/uploads/issues/issue-1.png", { expectedPrefix: "/uploads/issues/" })).toBe(true);
      expect(fs.existsSync(target)).toBe(false);
    });

    test("blocks path traversal, external paths, wrong prefix and symlinks", () => {
      const subDir = path.join(tmpDir, "uploads");
      fs.mkdirSync(subDir);
      const secretFile = path.join(tmpDir, "secret.txt");
      fs.writeFileSync(secretFile, "keep-me");

      expect(safeUnlinkInDir(subDir, "/uploads/../secret.txt", { expectedPrefix: "/uploads/" })).toBe(false);
      expect(safeUnlinkInDir(subDir, "/etc/passwd", { expectedPrefix: "/uploads/" })).toBe(false);
      expect(safeUnlinkInDir(subDir, "https://evil.tld/a.png", { expectedPrefix: "/uploads/" })).toBe(false);

      const linkPath = path.join(subDir, "escape.png");
      fs.symlinkSync(secretFile, linkPath);
      expect(safeUnlinkInDir(subDir, "/uploads/escape.png", { expectedPrefix: "/uploads/" })).toBe(false);
      expect(fs.existsSync(secretFile)).toBe(true);
    });
  });

  describe("validatePictureField & applyUploadStaticHeaders", () => {
    test("validates machine picture fields safely", () => {
      expect(validatePictureField("/uploads/machine-1.png")).toBe("/uploads/machine-1.png");
      expect(validatePictureField("https://example.org/printer.webp")).toBe("https://example.org/printer.webp");
      expect(validatePictureField("javascript:alert(1)")).toBeNull();
      expect(validatePictureField("/uploads/../secret.png")).toBeNull();
      expect(validatePictureField("/uploads/xss.html")).toBeNull();
    });

    test("sets nosniff, sandbox CSP, and forces attachment outside safe raster extensions", () => {
      const headersRaster = {};
      applyUploadStaticHeaders({ setHeader: (k, v) => { headersRaster[k] = v; } }, "/tmp/pic.png");
      expect(headersRaster["X-Content-Type-Options"]).toBe("nosniff");
      expect(headersRaster["Content-Security-Policy"]).toBe("default-src 'none'; sandbox");
      expect(headersRaster["Content-Disposition"]).toBeUndefined();

      const headersHtml = {};
      applyUploadStaticHeaders({ setHeader: (k, v) => { headersHtml[k] = v; } }, "/tmp/old.html");
      expect(headersHtml["X-Content-Type-Options"]).toBe("nosniff");
      expect(headersHtml["Content-Disposition"]).toBe("attachment");
    });
  });

  describe("createRateLimiter", () => {
    test("allows requests up to max and blocks subsequent requests with 429 or flash redirect", () => {
      const limiter = createRateLimiter({ windowMs: 60000, max: 2, redirectUrl: "/report-issue" });
      const next = jest.fn();

      const reqHtml = { ip: "127.0.0.1", originalUrl: "/report-issue", headers: {}, session: {} };
      const resHtml = { setHeader: jest.fn(), redirect: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };

      limiter(reqHtml, resHtml, next);
      limiter(reqHtml, resHtml, next);
      expect(next).toHaveBeenCalledTimes(2);

      limiter(reqHtml, resHtml, next);
      expect(next).toHaveBeenCalledTimes(2);
      expect(resHtml.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
      expect(reqHtml.session.notification).toMatch(/^Warning:/);
      expect(resHtml.redirect).toHaveBeenCalledWith("/report-issue");

      const reqJson = { ip: "10.0.0.2", originalUrl: "/api/test", headers: { accept: "application/json" } };
      limiter(reqJson, resHtml, jest.fn());
      limiter(reqJson, resHtml, jest.fn());
      limiter(reqJson, resHtml, jest.fn());
      expect(resHtml.status).toHaveBeenCalledWith(429);
    });
  });
});
