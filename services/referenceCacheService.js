const { prisma: defaultPrisma } = require("../utilities/db");

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Global in-memory cache for application reference data (workspaces, usertypes,
 * projecttypes, machinetypes, warningtypes, categories, locations, access, available equipment).
 * Replaces per-session caching so admin changes are immediately visible to all sessions
 * (kiosks, mediators, admins) upon `invalidate()`.
 */
class ReferenceCacheService {
  /**
   * @param {Object} [options]
   * @param {Object} [options.prisma]
   * @param {number} [options.ttlMs=300000]
   */
  constructor({ prisma, ttlMs = DEFAULT_CACHE_TTL_MS } = {}) {
    this.prisma = prisma || defaultPrisma;
    this.ttlMs = Number(ttlMs) > 0 ? Number(ttlMs) : DEFAULT_CACHE_TTL_MS;
    this.snapshot = null;
    this.expiresAt = 0;
    this.pendingLoad = null;
  }

  /**
   * Loads all reference tables in parallel from MariaDB.
   *
   * @returns {Promise<Object>}
   */
  async _fetchAll() {
    const [
      workspaces,
      usertypes,
      projecttypes,
      machinetypes,
      warningtypes,
      categories,
      locations,
      access,
      equipment,
    ] = await Promise.all([
      this.prisma.workspace.findMany({ orderBy: { id: "asc" } }),
      this.prisma.usertype.findMany(),
      this.prisma.projecttype.findMany(),
      this.prisma.machineType.findMany(),
      this.prisma.warningtype.findMany(),
      this.prisma.category.findMany({ include: { workspace: true } }),
      this.prisma.location.findMany(),
      this.prisma.access.findMany(),
      this.prisma.equipment.findMany({
        where: { status: "AVAILABLE" },
        include: { workspace: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return {
      workspaces: workspaces || [],
      usertypes: usertypes || [],
      projecttypes: projecttypes || [],
      machinetypes: machinetypes || [],
      warningtypes: warningtypes || [],
      categories: categories || [],
      locations: locations || [],
      access: access || [],
      equipment: equipment || [],
    };
  }

  /**
   * Returns the current reference data snapshot, reloading on cache miss or expiration.
   * Deduplicates concurrent reloads via `pendingLoad`.
   *
   * @returns {Promise<Object>}
   */
  async getReferenceData() {
    const now = Date.now();
    if (this.snapshot && this.expiresAt > now) {
      return this.snapshot;
    }

    if (!this.pendingLoad) {
      this.pendingLoad = this._fetchAll()
        .then((data) => {
          this.snapshot = data;
          this.expiresAt = Date.now() + this.ttlMs;
          return data;
        })
        .finally(() => {
          this.pendingLoad = null;
        });
    }

    return this.pendingLoad;
  }

  /**
   * Convenience helper returning the cached workspaces list.
   *
   * @returns {Promise<Array>}
   */
  async getWorkspaces() {
    const data = await this.getReferenceData();
    return data.workspaces;
  }

  /**
   * Immediately invalidates the global reference cache across all sessions.
   */
  invalidate() {
    this.snapshot = null;
    this.expiresAt = 0;
  }
}

const referenceCacheService = new ReferenceCacheService();
referenceCacheService.ReferenceCacheService = ReferenceCacheService;
referenceCacheService.DEFAULT_CACHE_TTL_MS = DEFAULT_CACHE_TTL_MS;

module.exports = referenceCacheService;
