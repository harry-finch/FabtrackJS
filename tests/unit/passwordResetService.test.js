const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { PasswordResetService } = require("../../services/passwordResetService");

describe("Unit: PasswordResetService", () => {
  function createMockService() {
    const mockPrisma = {
      staff: {
        updateMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    const mockMailService = {
      sendPasswordResetEmail: jest.fn().mockResolvedValue({ success: true }),
    };
    const mockLogger = {
      logThat: jest.fn(),
    };
    const service = new PasswordResetService({
      prisma: mockPrisma,
      mailService: mockMailService,
      logger: mockLogger,
    });
    return { service, mockPrisma, mockMailService, mockLogger };
  }

  describe("requestReset", () => {
    test("stores SHA-256 token hash (64 hex chars) and sends raw token when account exists", async () => {
      const { service, mockPrisma, mockMailService } = createMockService();
      mockPrisma.staff.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.requestReset("  Admin@Fablab.FR ", {
        hostUrl: "https://fablab.example.org",
      });

      expect(result).toEqual({ ok: true, emailSent: true });
      expect(mockPrisma.staff.updateMany).toHaveBeenCalledTimes(1);

      const updateArgs = mockPrisma.staff.updateMany.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ email: "admin@fablab.fr" });
      expect(updateArgs.data.pwdToken).toMatch(/^[a-f0-9]{64}$/);
      expect(updateArgs.data.tokenExpiry).toBeInstanceOf(Date);
      expect(updateArgs.data.tokenExpiry.getTime()).toBeGreaterThan(Date.now() + 9 * 60 * 1000);

      expect(mockMailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
      const emailArgs = mockMailService.sendPasswordResetEmail.mock.calls[0][0];
      expect(emailArgs.email).toBe("admin@fablab.fr");
      expect(emailArgs.hostUrl).toBe("https://fablab.example.org");
      expect(emailArgs.token).toMatch(/^[a-f0-9]{64}$/);
      // Raw token sent by email MUST NOT match the stored hash
      expect(emailArgs.token).not.toBe(updateArgs.data.pwdToken);
      const expectedHash = crypto.createHash("sha256").update(emailArgs.token).digest("hex");
      expect(updateArgs.data.pwdToken).toBe(expectedHash);
    });

    test("returns identical ok result without sending email when email is unknown", async () => {
      const { service, mockPrisma, mockMailService } = createMockService();
      mockPrisma.staff.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.requestReset("inconnu@fablab.fr");

      expect(result).toEqual({ ok: true, emailSent: false });
      expect(mockMailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe("verifyToken", () => {
    test("rejects malformed tokens without querying database", async () => {
      const { service, mockPrisma } = createMockService();

      expect(await service.verifyToken("")).toBeNull();
      expect(await service.verifyToken("not-a-valid-token")).toBeNull();
      expect(await service.verifyToken("123")).toBeNull();
      expect(mockPrisma.staff.findFirst).not.toHaveBeenCalled();
    });

    test("queries by SHA-256 hash and expiry and exposes only staff name", async () => {
      const { service, mockPrisma } = createMockService();
      const rawToken = "a".repeat(64);
      const expectedHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      mockPrisma.staff.findFirst.mockResolvedValue({ name: "alice" });

      const staff = await service.verifyToken(rawToken);

      expect(staff).toEqual({ name: "alice" });
      expect(mockPrisma.staff.findFirst).toHaveBeenCalledWith({
        where: {
          pwdToken: expectedHash,
          tokenExpiry: { gte: expect.any(Date) },
        },
        select: { name: true },
      });
    });

    test("returns null when token is unknown or expired", async () => {
      const { service, mockPrisma } = createMockService();
      mockPrisma.staff.findFirst.mockResolvedValue(null);

      expect(await service.verifyToken("b".repeat(64))).toBeNull();
    });
  });

  describe("completeReset", () => {
    test("rejects malformed token immediately", async () => {
      const { service, mockPrisma } = createMockService();

      const res = await service.completeReset("1234", "MotDePasseValide1");
      expect(res).toEqual({ ok: false, reason: "INVALID_OR_EXPIRED" });
      expect(mockPrisma.staff.updateMany).not.toHaveBeenCalled();
    });

    test("atomically updates bcrypt hash, clears pwdToken/tokenExpiry, and refuses replay", async () => {
      const { service, mockPrisma, mockLogger } = createMockService();
      const rawToken = "c".repeat(64);
      const expectedHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      mockPrisma.staff.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      const firstAttempt = await service.completeReset(rawToken, "NouveauMotDePasse8");
      expect(firstAttempt).toEqual({ ok: true });
      expect(mockLogger.logThat).toHaveBeenCalledTimes(1);

      const updateArgs = mockPrisma.staff.updateMany.mock.calls[0][0];
      expect(updateArgs.where).toEqual({
        pwdToken: expectedHash,
        tokenExpiry: { gte: expect.any(Date) },
      });
      expect(updateArgs.data.pwdToken).toBeNull();
      expect(updateArgs.data.tokenExpiry).toBeNull();
      expect(await bcrypt.compare("NouveauMotDePasse8", updateArgs.data.password)).toBe(true);

      // Replay / concurrent second request with same token must fail
      const replayAttempt = await service.completeReset(rawToken, "AutreMotDePasse8");
      expect(replayAttempt).toEqual({ ok: false, reason: "INVALID_OR_EXPIRED" });
    });
  });
});
