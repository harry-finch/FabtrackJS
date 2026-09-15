const { z } = require("zod");

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

/**
 * Middleware factory to validate request body using a Zod schema
 * @param {z.ZodSchema} schema Zod schema to validate against
 * @param {Object} options Configuration options
 * @param {string|Function} [options.redirectUrl] Fallback URL to redirect on validation error for HTML forms
 * @param {boolean} [options.isApi] Explicitly treat as API request (returns JSON 400)
 */
function validateBody(schema, options = {}) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const formattedErrors = formatZodErrors(result.error);
      const firstError = formattedErrors[0]?.message || "Données de formulaire invalides.";

      const isApi =
        options.isApi === true ||
        (req.baseUrl && req.baseUrl.startsWith("/api")) ||
        (req.originalUrl && req.originalUrl.startsWith("/api")) ||
        req.xhr ||
        (req.headers.accept && req.headers.accept.includes("application/json"));

      if (isApi) {
        return res.status(400).json({
          success: false,
          error: firstError,
          errors: formattedErrors,
        });
      }

      if (req.session) {
        req.session.notification = `Error: ${firstError}`;
      }

      const redirectTarget =
        typeof options.redirectUrl === "function"
          ? options.redirectUrl(req)
          : options.redirectUrl || req.headers.referer || "/fabtrack";

      return res.redirect(redirectTarget);
    }

    // Merge validated & coerced fields into req.body and expose req.validatedBody
    req.body = { ...req.body, ...result.data };
    req.validatedBody = result.data;
    return next();
  };
}

/**
 * Middleware factory to validate request params (e.g. :id)
 */
function validateParams(schema, options = {}) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      const formattedErrors = formatZodErrors(result.error);
      const firstError = formattedErrors[0]?.message || "Paramètres d'URL invalides.";

      const isApi =
        options.isApi === true ||
        (req.baseUrl && req.baseUrl.startsWith("/api")) ||
        (req.originalUrl && req.originalUrl.startsWith("/api")) ||
        req.xhr ||
        (req.headers.accept && req.headers.accept.includes("application/json"));

      if (isApi) {
        return res.status(400).json({
          success: false,
          error: firstError,
          errors: formattedErrors,
        });
      }

      if (req.session) {
        req.session.notification = `Error: ${firstError}`;
      }

      const redirectTarget =
        typeof options.redirectUrl === "function"
          ? options.redirectUrl(req)
          : options.redirectUrl || req.headers.referer || "/fabtrack";

      return res.redirect(redirectTarget);
    }

    req.params = { ...req.params, ...result.data };
    req.validatedParams = result.data;
    return next();
  };
}

/**
 * Middleware factory to validate query parameters
 */
function validateQuery(schema, options = {}) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const formattedErrors = formatZodErrors(result.error);
      const firstError = formattedErrors[0]?.message || "Paramètres de requête invalides.";

      const isApi =
        options.isApi === true ||
        (req.baseUrl && req.baseUrl.startsWith("/api")) ||
        (req.originalUrl && req.originalUrl.startsWith("/api")) ||
        req.xhr ||
        (req.headers.accept && req.headers.accept.includes("application/json"));

      if (isApi) {
        return res.status(400).json({
          success: false,
          error: firstError,
          errors: formattedErrors,
        });
      }

      if (req.session) {
        req.session.notification = `Error: ${firstError}`;
      }

      const redirectTarget =
        typeof options.redirectUrl === "function"
          ? options.redirectUrl(req)
          : options.redirectUrl || req.headers.referer || "/fabtrack";

      return res.redirect(redirectTarget);
    }

    req.query = { ...req.query, ...result.data };
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
