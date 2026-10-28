/**
 * Middleware to authenticate API requests via either:
 * 1. An active web session (req.session.loggedin === true)
 * 2. An API Key provided via header ('x-api-key' or 'Authorization: Bearer <key>') or query param (?apiKey=...)
 *
 * If FABTRACK_API_KEY or MACHINE_API_KEY is configured in .env, it is enforced for non-session API requests.
 * If neither is configured in .env, API requests in local lab networks are permitted.
 */
module.exports = function checkApiKeyOrSession(req, res, next) {
  // 1. Allow active browser session
  if (req.session && req.session.loggedin) {
    return next();
  }

  // 2. Extract potential API key
  const configuredKey = process.env.FABTRACK_API_KEY || process.env.MACHINE_API_KEY;

  const headerKey = req.headers["x-api-key"];
  const authHeader = req.headers["authorization"];
  const bearerKey = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const queryKey = req.query && req.query.apiKey ? req.query.apiKey : null;

  const providedKey = headerKey || bearerKey || queryKey;

  // If a key is configured on server, it MUST match
  if (configuredKey) {
    if (providedKey && providedKey === configuredKey) {
      return next();
    }
    return res.status(401).json({
      success: false,
      code: "UNAUTHORIZED",
      error: "Clé API invalide ou absente. Veuillez fournir un en-tête 'x-api-key' ou 'Authorization: Bearer <clé>'.",
    });
  }

  // If no server key is configured in .env, allow requests (convenient for local intranet)
  return next();
};

