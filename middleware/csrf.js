const crypto = require("crypto");
const { isApiOrAjaxRequest } = require("./requireRoles.js");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_HEADER_NAMES = ["x-csrf-token", "csrf-token", "x-xsrf-token"];

/**
 * Ensures the current session holds a cryptographically strong CSRF token
 * and returns it. Mutates `req.session` ONLY when invoked (lazy token issuance).
 *
 * @param {import("express").Request} req
 * @returns {string}
 */
function ensureCsrfToken(req) {
  if (!req || !req.session) {
    return "";
  }
  if (typeof req.session.csrfToken !== "string" || req.session.csrfToken.length < 32) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  }
  return req.session.csrfToken;
}

/**
 * Extracts a submitted CSRF token from request headers, parsed body, or query string.
 * Query fallback supports `multipart/form-data` forms validated prior to `multer`.
 *
 * @param {import("express").Request} req
 * @returns {string}
 */
function extractCsrfToken(req) {
  if (!req) return "";

  if (req.headers) {
    for (const headerName of CSRF_HEADER_NAMES) {
      const value = req.headers[headerName];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
  }

  if (req.body && typeof req.body._csrf === "string" && req.body._csrf.trim().length > 0) {
    return req.body._csrf.trim();
  }

  if (req.query && typeof req.query._csrf === "string" && req.query._csrf.trim().length > 0) {
    return req.query._csrf.trim();
  }

  return "";
}

/**
 * Constant-time comparison between expected session token and provided token.
 *
 * @param {string} expected
 * @param {string} provided
 * @returns {boolean}
 */
function isTokenValid(expected, provided) {
  if (typeof expected !== "string" || typeof provided !== "string") {
    return false;
  }
  if (expected.length < 32 || provided.length !== expected.length) {
    return false;
  }

  const expectedBuf = Buffer.from(expected, "utf8");
  const providedBuf = Buffer.from(provided, "utf8");
  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Determines whether a request is exempted from browser CSRF validation.
 * Stateless machine endpoints (`/api/machines/*`) are exempted when authenticating
 * via API key headers or without an authenticated browser session.
 *
 * @param {import("express").Request} req
 * @returns {boolean}
 */
function isCsrfExemptRequest(req) {
  const rawPath = (req.path || req.originalUrl || "").split("?")[0];
  const isMachineApi = rawPath === "/api/machines" || rawPath.startsWith("/api/machines/");

  if (!isMachineApi) {
    return false;
  }

  const headers = req.headers || {};
  const hasApiKeyHeader =
    (typeof headers["x-api-key"] === "string" && headers["x-api-key"].trim().length > 0) ||
    (typeof headers.authorization === "string" && headers.authorization.trim().toLowerCase().startsWith("bearer "));

  if (hasApiKeyHeader) {
    return true;
  }

  // Unauthenticated machine/API callers do not carry a browser session;
  // checkApiKeyOrSession will enforce Fail-Closed 401 on them.
  return !(req.session && req.session.loggedin);
}

/**
 * Exposes `req.csrfToken()` and a lazy `res.locals.csrfToken` getter so
 * anonymous non-HTML requests do not initialize sessions when `saveUninitialized: false`.
 */
function csrfTokenMiddleware(req, res, next) {
  req.csrfToken = () => ensureCsrfToken(req);

  if (res && res.locals) {
    Object.defineProperty(res.locals, "csrfToken", {
      enumerable: true,
      configurable: true,
      get() {
        return ensureCsrfToken(req);
      },
    });
  }

  return next();
}

/**
 * Enforces session-synchronized CSRF validation on all state-changing HTTP methods.
 */
function csrfProtection(req, res, next) {
  const method = (req.method || "GET").toUpperCase();
  if (SAFE_METHODS.has(method) || isCsrfExemptRequest(req)) {
    return next();
  }

  const expected = req.session && typeof req.session.csrfToken === "string" ? req.session.csrfToken : "";
  const provided = extractCsrfToken(req);

  if (isTokenValid(expected, provided)) {
    return next();
  }

  const message = "Jeton CSRF manquant ou invalide. Veuillez recharger la page et réessayer.";
  const isJson =
    isApiOrAjaxRequest(req) ||
    Boolean(req.headers && typeof req.headers["content-type"] === "string" && req.headers["content-type"].includes("application/json"));

  if (isJson) {
    return res.status(403).json({
      success: false,
      code: "EBADCSRFTOKEN",
      error: message,
      message,
    });
  }

  res.status(403);
  if (req.app && req.app.get && req.app.get("view engine") && typeof res.render === "function") {
    res.locals.error = { message, status: 403 };
    res.locals.message = message;
    res.locals.role = req.session ? req.session.role : null;
    res.locals.loggedin = req.session ? req.session.loggedin : false;
    res.locals.requestedPath = req.originalUrl || req.path;
    res.locals.notification = "";
    return res.render("error");
  }

  return res.send(message);
}

module.exports = {
  SAFE_METHODS,
  CSRF_HEADER_NAMES,
  ensureCsrfToken,
  extractCsrfToken,
  isTokenValid,
  isCsrfExemptRequest,
  csrfTokenMiddleware,
  csrfProtection,
};
