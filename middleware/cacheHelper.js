const referenceCacheService = require("../services/referenceCacheService.js");

/**
 * Invalidates the global reference data cache immediately across all active sessions
 * (kiosks, mediators, admins). Accepts optional `req` for backward compatibility.
 *
 * @param {import("express").Request} [req]
 */
function invalidateCache(req) {
  referenceCacheService.invalidate();
  if (req && req.session && req.session.invalidateCache) {
    req.session.invalidateCache = false;
  }
}

module.exports = { invalidateCache };
