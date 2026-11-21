const { cleanupRequestFiles } = require("../services/uploadSecurityService.js");
const { resolveSafeRedirectUrl } = require("../utilities/securityHelpers.js");

/**
 * Helper to extract human-readable error messages from ZodError
 */
function formatZodErrors(error) {
  return error.issues.map((issue) => {
    const field = issue.path.join(".");
    return {
      field: field || "global",
      message: issue.message,
    };
  });
}

function isJsonValidationRequest(req, options = {}) {
  return (
    options.isApi === true ||
    (req.baseUrl && req.baseUrl.startsWith("/api")) ||
    (req.originalUrl && req.originalUrl.startsWith("/api")) ||
    req.xhr ||
    (req.headers && req.headers.accept && req.headers.accept.includes("application/json"))
  );
}

function handleValidationFailure(req, res, error, defaultMessage, options = {}) {
  cleanupRequestFiles(req);
  const formattedErrors = formatZodErrors(error);
  const firstError = formattedErrors[0]?.message || defaultMessage;

  if (isJsonValidationRequest(req, options)) {
    return res.status(400).json({
      success: false,
      error: firstError,
      message: firstError,
      errors: formattedErrors,
    });
  }

  if (req.session) {
    req.session.notification = `Error: ${firstError}`;
  }

  const rawTarget =
    typeof options.redirectUrl === "function" ? options.redirectUrl(req) : options.redirectUrl;
  const redirectTarget = resolveSafeRedirectUrl(rawTarget, req, "/fabtrack");

  return res.redirect(redirectTarget);
}

/**
 * Middleware factory to validate request body using a Zod schema.
 * Strips unknown properties (mass-assignment protection): req.body = result.data.
 * @param {import("zod").ZodSchema} schema Zod schema to validate against
 * @param {Object} options Configuration options
 * @param {string|Function} [options.redirectUrl] Fallback URL to redirect on validation error for HTML forms
 * @param {boolean} [options.isApi] Explicitly treat as API request (returns JSON 400)
 */
function validateBody(schema, options = {}) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});

    if (!result.success) {
      return handleValidationFailure(
        req,
        res,
        result.error,
        "Données de formulaire invalides.",
        options,
      );
    }

    // Strict stripping against mass-assignment: only schema-declared fields survive
    req.body = result.data;
    req.validatedBody = result.data;
    return next();
  };
}

/**
 * Middleware factory to validate request params (e.g. :id).
 */
function validateParams(schema, options = {}) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params ?? {});

    if (!result.success) {
      return handleValidationFailure(
        req,
        res,
        result.error,
        "Paramètres d'URL invalides.",
        options,
      );
    }

    req.params = result.data;
    req.validatedParams = result.data;
    return next();
  };
}

/**
 * Middleware factory to validate query parameters.
 */
function validateQuery(schema, options = {}) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query ?? {});

    if (!result.success) {
      return handleValidationFailure(
        req,
        res,
        result.error,
        "Paramètres de requête invalides.",
        options,
      );
    }

    req.query = result.data;
    req.validatedQuery = result.data;
    return next();
  };
}

module.exports = {
  validateBody,
  validateParams,
  validateQuery,
  formatZodErrors,
};
