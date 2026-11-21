/**
 * Détecte si la requête attend une réponse JSON (API ou AJAX).
 *
 * @param {import("express").Request} req
 * @returns {boolean}
 */
function isApiOrAjaxRequest(req) {
  const accept = req.headers && typeof req.headers.accept === "string" ? req.headers.accept : "";
  return Boolean(
    (req.baseUrl && req.baseUrl.startsWith("/api")) ||
      (req.originalUrl && req.originalUrl.startsWith("/api")) ||
      req.xhr ||
      accept.includes("application/json"),
  );
}

/**
 * Factory de middleware RBAC vérifiant la session et les rôles autorisés.
 * Accepte `requireRoles("admin", "user")`, `requireRoles(["admin", "user"])`,
 * et un objet d'options optionnel en dernier argument :
 *   `{ redirectUrl, notification, message }`
 *
 * @param {...(string|string[]|Object)} args
 * @returns {import("express").RequestHandler}
 */
function requireRoles(...args) {
  let options = {};
  const roleInputs = [...args];

  if (
    roleInputs.length > 0 &&
    typeof roleInputs[roleInputs.length - 1] === "object" &&
    roleInputs[roleInputs.length - 1] !== null &&
    !Array.isArray(roleInputs[roleInputs.length - 1])
  ) {
    options = roleInputs.pop();
  }

  const allowedRoles = roleInputs.flat().filter((role) => typeof role === "string" && role.length > 0);

  return function roleGuard(req, res, next) {
    const isJson = isApiOrAjaxRequest(req);

    if (!req.session || !req.session.loggedin) {
      if (isJson) {
        return res.status(401).json({
          success: false,
          code: "UNAUTHENTICATED",
          error: "Authentification requise.",
          message: "Authentification requise.",
        });
      }
      if (req.session) {
        req.session.notification = "Error: Please log in.";
      }
      return res.redirect("/login");
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(req.session.role)) {
      const deniedMsg = options.message || "Accès refusé : droits insuffisants pour cette action.";
      if (isJson) {
        return res.status(403).json({
          success: false,
          code: "FORBIDDEN",
          error: deniedMsg,
          message: deniedMsg,
        });
      }

      req.session.notification = options.notification || `Error: ${deniedMsg}`;
      const redirectTarget =
        typeof options.redirectUrl === "function" ? options.redirectUrl(req) : options.redirectUrl || "/fabtrack";
      return res.redirect(redirectTarget);
    }

    if (req.session.username) {
      res.locals.username = req.session.username;
    }

    return next();
  };
}

requireRoles.isApiOrAjaxRequest = isApiOrAjaxRequest;

module.exports = requireRoles;
