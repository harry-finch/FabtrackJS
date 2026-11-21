/**
 * Creates a lightweight in-memory sliding-window rate limiter middleware.
 * Bounds memory usage by periodically pruning expired IP entries.
 * @param {Object} [options]
 * @param {number} [options.windowMs=900000] Window duration in milliseconds (default 15 minutes)
 * @param {number} [options.max=10] Maximum requests allowed per key in the window
 * @param {string} [options.message] Error message displayed when blocked
 * @param {string | Function} [options.redirectUrl] Redirect URL for HTML form submissions
 * @param {Function} [options.keyGenerator] Custom key extractor
 * @returns {Function & { reset: Function }}
 */
function createRateLimiter(options = {}) {
  const windowMs = Number(options.windowMs) > 0 ? Number(options.windowMs) : 15 * 60 * 1000;
  const max = Number(options.max) > 0 ? Number(options.max) : 10;
  const message =
    options.message || "Trop de requêtes envoyées. Veuillez patienter avant de réessayer.";
  const keyGenerator =
    typeof options.keyGenerator === "function"
      ? options.keyGenerator
      : (req) => req.ip || (req.socket && req.socket.remoteAddress) || "unknown";

  const buckets = new Map();
  let checkCounter = 0;

  function prune(now) {
    for (const [key, timestamps] of buckets.entries()) {
      const fresh = timestamps.filter((ts) => now - ts < windowMs);
      if (fresh.length === 0) {
        buckets.delete(key);
      } else {
        buckets.set(key, fresh);
      }
    }
  }

  function middleware(req, res, next) {
    const now = Date.now();
    checkCounter += 1;
    if (checkCounter % 100 === 0 || buckets.size > 1000) {
      prune(now);
    }

    const key = String(keyGenerator(req) || "unknown");
    const existing = buckets.get(key) || [];
    const recent = existing.filter((ts) => now - ts < windowMs);

    if (recent.length >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));

      const isApi = Boolean(
        (req.baseUrl && req.baseUrl.startsWith("/api")) ||
          (req.originalUrl && req.originalUrl.startsWith("/api")) ||
          req.xhr ||
          (req.headers.accept && req.headers.accept.includes("application/json")),
      );

      if (isApi || !options.redirectUrl) {
        const wantsHtml =
          !isApi &&
          req.headers &&
          typeof req.headers.accept === "string" &&
          req.headers.accept.includes("text/html") &&
          typeof res.send === "function";

        if (wantsHtml) {
          const escapedMsg = String(message).replace(/[&<>"']/g, (ch) => {
            const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
            return map[ch] || ch;
          });
          const basePath = (res.locals && res.locals.basePath) || "";
          const backHref = `${basePath}${typeof options.backUrl === "string" ? options.backUrl : "/login"}`;
          return res
            .status(429)
            .send(
              `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>429 - Trop de requêtes</title></head><body style="font-family:system-ui,sans-serif;max-width:520px;margin:4rem auto;padding:1.5rem;line-height:1.5;"><h1>Trop de tentatives (429)</h1><p>${escapedMsg}</p><p><a href="${backHref}">Retour</a></p></body></html>`,
            );
        }

        return res.status(429).json({
          success: false,
          code: "RATE_LIMITED",
          error: message,
          message,
        });
      }

      if (req.session) {
        req.session.notification = `Warning: ${message}`;
      }

      const target =
        typeof options.redirectUrl === "function" ? options.redirectUrl(req) : options.redirectUrl;
      return res.redirect(target);
    }

    recent.push(now);
    buckets.set(key, recent);
    return next();
  }

  middleware.reset = () => buckets.clear();

  return middleware;
}

module.exports = {
  createRateLimiter,
};
