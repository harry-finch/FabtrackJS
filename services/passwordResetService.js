const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { prisma: defaultPrisma } = require("../utilities/db");
const defaultMailService = require("./mailService");
const defaultLogger = require("../utilities/simpleLogger");

const TOKEN_TTL_MS = 10 * 60 * 1000;
const SALT_ROUNDS = 10;
const TOKEN_HEX_REGEX = /^[a-f0-9]{64}$/i;

/**
 * Service handling staff password reset tokens and atomic one-time password updates.
 */
class PasswordResetService {
  /**
   * @param {Object} [deps] Optional dependency overrides for unit testing
   */
  constructor({ prisma, mailService, logger } = {}) {
    this.prisma = prisma || defaultPrisma;
    this.mailService = mailService || defaultMailService;
    this.logger = logger || defaultLogger;
  }

  /**
   * Generates a cryptographically strong 256-bit hex reset token.
   * @returns {string}
   */
  generateRawToken() {
    return crypto.randomBytes(32).toString("hex");
  }

  /**
   * Returns the SHA-256 hex digest of a raw reset token (64 characters).
   * @param {string} rawToken
   * @returns {string}
   */
  hashToken(rawToken) {
    return crypto.createHash("sha256").update(String(rawToken)).digest("hex");
  }

  /**
   * Checks whether a token matches the expected 64-character hex format.
   * @param {unknown} rawToken
   * @returns {boolean}
   */
  isValidTokenFormat(rawToken) {
    return typeof rawToken === "string" && TOKEN_HEX_REGEX.test(rawToken.trim());
  }

  /**
   * Generates and stores a hashed reset token if the email exists, and sends the reset link.
   * Never reveals whether an account exists for the given email.
   * @param {string} email
   * @param {{ hostUrl?: string }} [options]
   * @returns {Promise<{ ok: boolean, emailSent: boolean }>}
   */
  async requestReset(email, { hostUrl } = {}) {
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!normalizedEmail) {
      return { ok: true, emailSent: false };
    }

    const rawToken = this.generateRawToken();
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    const result = await this.prisma.staff.updateMany({
      where: { email: normalizedEmail },
      data: {
        pwdToken: tokenHash,
        tokenExpiry: expiresAt,
      },
    });

    if (result.count > 0) {
      try {
        await this.mailService.sendPasswordResetEmail({
          email: normalizedEmail,
          token: rawToken,
          hostUrl,
        });
      } catch (err) {
        console.error("[PasswordResetService] Failed to send password reset email:", err);
      }
      return { ok: true, emailSent: true };
    }

    return { ok: true, emailSent: false };
  }

  /**
   * Verifies that a reset token exists, is unexpired, and returns non-sensitive staff display info.
   * @param {string} rawToken
   * @returns {Promise<{ name: string } | null>}
   */
  async verifyToken(rawToken) {
    if (!this.isValidTokenFormat(rawToken)) {
      return null;
    }

    const tokenHash = this.hashToken(rawToken.trim());
    const staff = await this.prisma.staff.findFirst({
      where: {
        pwdToken: tokenHash,
        tokenExpiry: { gte: new Date() },
      },
      select: { name: true },
    });

    return staff ? { name: staff.name } : null;
  }

  /**
   * Atomically updates the staff password and invalidates the token in a single query.
   * @param {string} rawToken
   * @param {string} newPassword
   * @returns {Promise<{ ok: boolean, reason?: string }>}
   */
  async completeReset(rawToken, newPassword) {
    if (!this.isValidTokenFormat(rawToken)) {
      return { ok: false, reason: "INVALID_OR_EXPIRED" };
    }

    const tokenHash = this.hashToken(rawToken.trim());
    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    const updated = await this.prisma.staff.updateMany({
      where: {
        pwdToken: tokenHash,
        tokenExpiry: { gte: new Date() },
      },
      data: {
        password: hash,
        pwdToken: null,
        tokenExpiry: null,
      },
    });

    if (updated.count !== 1) {
      return { ok: false, reason: "INVALID_OR_EXPIRED" };
    }

    this.logger.logThat("Mot de passe staff réinitialisé via jeton à usage unique.");
    return { ok: true };
  }
}

const passwordResetService = new PasswordResetService();
passwordResetService.PasswordResetService = PasswordResetService;

module.exports = passwordResetService;
