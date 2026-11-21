const crypto = require("crypto");
const settingsService = require("../services/settingsService.js");

/**
 * Compare deux secrets en temps constant via SHA-256 pour éviter
 * les fuites de timing (y compris sur la longueur de la clé).
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function timingSafeEqualStrings(a, b) {
  if (!a || !b) {
    return false;
  }
  const hashA = crypto.createHash("sha256").update(String(a), "utf8").digest();
  const hashB = crypto.createHash("sha256").update(String(b), "utf8").digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Middleware d'authentification pour les endpoints API machines/NFC.
 * Mode Fail-Closed : autorise uniquement une session admin/staff connectée
 * OU une clé API valide transmise via l'en-tête 'x-api-key' ou 'Authorization: Bearer <clé>'.
 * Toute clé passée en query string (?apiKey=) est ignorée/refusée.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
module.exports = async function checkApiKeyOrSession(req, res, next) {
  try {
    if (req.session && req.session.loggedin) {
      return next();
    }

    const envKey = (process.env.FABTRACK_API_KEY || process.env.MACHINE_API_KEY || "").trim();
    let configuredKey = envKey || null;

    if (!configuredKey) {
      const settings = await settingsService.getSettings();
      const dbToken = settings && settings.api_machine_token ? String(settings.api_machine_token).trim() : "";
      configuredKey = dbToken || null;
    }

    if (!configuredKey) {
      return res.status(401).json({
        success: false,
        code: "UNAUTHORIZED",
        error: "Aucune clé API machine configurée côté serveur.",
      });
    }

    const rawHeaderKey = req.headers["x-api-key"];
    const headerKey = typeof rawHeaderKey === "string" ? rawHeaderKey.trim() : null;

    const rawAuthHeader = req.headers["authorization"];
    const authHeader = typeof rawAuthHeader === "string" ? rawAuthHeader.trim() : "";
    const bearerKey = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : null;

    const providedKey = headerKey || bearerKey || null;

    if (providedKey && timingSafeEqualStrings(providedKey, configuredKey)) {
      return next();
    }

    return res.status(401).json({
      success: false,
      code: "UNAUTHORIZED",
      error: "Clé API invalide ou absente. Veuillez fournir un en-tête 'x-api-key' ou 'Authorization: Bearer <clé>'.",
    });
  } catch (err) {
    return next(err);
  }
};
