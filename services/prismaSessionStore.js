const session = require("express-session");
const { prisma: defaultPrisma } = require("../utilities/db");

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Native MariaDB session store backed by Prisma (`Session` model),
 * avoiding an extra `mysql2` pool or external npm dependency.
 */
class PrismaSessionStore extends session.Store {
  /**
   * @param {Object} [options]
   * @param {Object} [options.prisma]
   * @param {number} [options.ttlMs=86400000]
   * @param {number} [options.cleanupIntervalMs=900000]
   * @param {boolean} [options.autoStartCleanup=false]
   */
  constructor({
    prisma,
    ttlMs = DEFAULT_TTL_MS,
    cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL_MS,
    autoStartCleanup = false,
  } = {}) {
    super();
    this.prisma = prisma || defaultPrisma;
    this.ttlMs = Number(ttlMs) > 0 ? Number(ttlMs) : DEFAULT_TTL_MS;
    this.cleanupIntervalMs =
      Number(cleanupIntervalMs) > 0 ? Number(cleanupIntervalMs) : DEFAULT_CLEANUP_INTERVAL_MS;
    this.cleanupTimer = null;

    if (autoStartCleanup) {
      this.startCleanupTimer();
    }
  }

  /**
   * Computes the expiration timestamp for a session payload.
   *
   * @param {Object} sess
   * @returns {Date}
   */
  _computeExpiresAt(sess) {
    if (sess && sess.cookie) {
      if (sess.cookie.expires) {
        const parsed = new Date(sess.cookie.expires);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed;
        }
      }
      const maxAge = Number(sess.cookie.maxAge || sess.cookie.originalMaxAge);
      if (Number.isFinite(maxAge) && maxAge > 0) {
        return new Date(Date.now() + maxAge);
      }
    }
    return new Date(Date.now() + this.ttlMs);
  }

  get(sid, callback) {
    const cb = typeof callback === "function" ? callback : () => {};
    if (!sid || typeof sid !== "string") {
      return cb(null, null);
    }

    this.prisma.session
      .findUnique({ where: { sid } })
      .then((record) => {
        if (!record) {
          return cb(null, null);
        }
        if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
          this.prisma.session.deleteMany({ where: { sid } }).catch(() => {});
          return cb(null, null);
        }
        try {
          const parsed = JSON.parse(record.data);
          return cb(null, parsed);
        } catch (parseErr) {
          return cb(parseErr);
        }
      })
      .catch((err) => cb(err));
  }

  set(sid, sess, callback) {
    const cb = typeof callback === "function" ? callback : () => {};
    if (!sid || typeof sid !== "string") {
      return cb(null);
    }

    let serialized;
    try {
      serialized = JSON.stringify(sess);
    } catch (err) {
      return cb(err);
    }

    const expiresAt = this._computeExpiresAt(sess);

    this.prisma.session
      .upsert({
        where: { sid },
        update: {
          data: serialized,
          expiresAt,
        },
        create: {
          sid,
          data: serialized,
          expiresAt,
        },
      })
      .then(() => cb(null))
      .catch((err) => cb(err));
  }

  destroy(sid, callback) {
    const cb = typeof callback === "function" ? callback : () => {};
    if (!sid || typeof sid !== "string") {
      return cb(null);
    }

    this.prisma.session
      .deleteMany({ where: { sid } })
      .then(() => cb(null))
      .catch((err) => cb(err));
  }

  touch(sid, sess, callback) {
    const cb = typeof callback === "function" ? callback : () => {};
    if (!sid || typeof sid !== "string") {
      return cb(null);
    }

    const expiresAt = this._computeExpiresAt(sess);

    this.prisma.session
      .updateMany({
        where: { sid },
        data: { expiresAt },
      })
      .then(() => cb(null))
      .catch((err) => cb(err));
  }

  /**
   * Deletes all expired sessions from MariaDB.
   *
   * @param {Date} [now=new Date()]
   * @returns {Promise<number>}
   */
  async pruneExpired(now = new Date()) {
    const result = await this.prisma.session.deleteMany({
      where: {
        expiresAt: {
          lte: now,
        },
      },
    });
    return result && typeof result.count === "number" ? result.count : 0;
  }

  startCleanupTimer() {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.pruneExpired().catch((err) => {
        console.error("[PrismaSessionStore] Failed to prune expired sessions:", err.message);
      });
    }, this.cleanupIntervalMs);
    if (typeof this.cleanupTimer.unref === "function") {
      this.cleanupTimer.unref();
    }
  }

  stopCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

module.exports = {
  PrismaSessionStore,
  DEFAULT_TTL_MS,
  DEFAULT_CLEANUP_INTERVAL_MS,
};
