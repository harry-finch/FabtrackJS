const { prisma: defaultPrisma } = require("../utilities/db");

const DEFAULT_CACHE_TTL_MS = 30 * 1000;

/**
 * Service vérifiant dynamiquement l'état en base (existence, approbation, rôle)
 * d'un compte staff authentifié en session, avec micro-cache borné (30 s)
 * et invalidation immédiate lors des actions d'administration.
 */
class StaffSessionService {
  /**
   * @param {Object} [options]
   * @param {Object} [options.prisma]
   * @param {number} [options.ttlMs=30000]
   */
  constructor({ prisma, ttlMs = DEFAULT_CACHE_TTL_MS } = {}) {
    this.prisma = prisma || defaultPrisma;
    this.ttlMs = Number(ttlMs) > 0 ? Number(ttlMs) : DEFAULT_CACHE_TTL_MS;
    this.cacheById = new Map();
  }

  /**
   * Récupère l'état d'un compte staff par identifiant avec micro-cache.
   *
   * @param {number} staffId
   * @returns {Promise<{ id: number, name: string, role: string, approved: boolean } | null>}
   */
  async getStaffById(staffId) {
    const parsedId = Number(staffId);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return null;
    }

    const now = Date.now();
    const cached = this.cacheById.get(parsedId);
    if (cached && cached.expiresAt > now) {
      return cached.staff;
    }

    const staff = await this.prisma.staff.findUnique({
      where: { id: parsedId },
      select: {
        id: true,
        name: true,
        role: true,
        approved: true,
      },
    });

    const normalized = staff
      ? {
          id: staff.id,
          name: staff.name,
          role: staff.role,
          approved: Boolean(staff.approved),
        }
      : null;

    this.cacheById.set(parsedId, {
      staff: normalized,
      expiresAt: now + this.ttlMs,
    });

    return normalized;
  }

  /**
   * Vérifie que la session correspond toujours à un compte staff actif et approuvé,
   * et synchronise `session.role`, `session.staffId` et `session.username`.
   *
   * @param {Object} session
   * @returns {Promise<{ valid: boolean, reason?: string, staff?: Object }>}
   */
  async verifyActiveStaffSession(session) {
    if (!session || !session.loggedin) {
      return { valid: false, reason: "UNAUTHENTICATED" };
    }

    let staff = null;
    if (session.staffId !== undefined && session.staffId !== null) {
      staff = await this.getStaffById(session.staffId);
    } else if (typeof session.username === "string" && session.username.trim().length > 0) {
      const found = await this.prisma.staff.findUnique({
        where: { name: session.username.trim() },
        select: {
          id: true,
          name: true,
          role: true,
          approved: true,
        },
      });
      if (found) {
        staff = {
          id: found.id,
          name: found.name,
          role: found.role,
          approved: Boolean(found.approved),
        };
        this.cacheById.set(staff.id, {
          staff,
          expiresAt: Date.now() + this.ttlMs,
        });
      }
    } else {
      return { valid: false, reason: "INVALID_SESSION" };
    }

    if (!staff) {
      return { valid: false, reason: "STAFF_NOT_FOUND" };
    }

    if (!staff.approved) {
      return { valid: false, reason: "STAFF_DISABLED" };
    }

    session.staffId = staff.id;
    session.username = staff.name;
    session.role = staff.role;

    return { valid: true, staff };
  }

  /**
   * Invalide immédiatement l'entrée en cache d'un compte staff donné.
   *
   * @param {number|string} staffId
   */
  invalidateStaffSessionCache(staffId) {
    const parsedId = Number(staffId);
    if (Number.isInteger(parsedId) && parsedId > 0) {
      this.cacheById.delete(parsedId);
    }
  }

  /**
   * Vide intégralement le micro-cache (utile pour les tests unitaires).
   */
  clearCache() {
    this.cacheById.clear();
  }
}

const staffSessionService = new StaffSessionService();
staffSessionService.StaffSessionService = StaffSessionService;
staffSessionService.DEFAULT_CACHE_TTL_MS = DEFAULT_CACHE_TTL_MS;

module.exports = staffSessionService;
