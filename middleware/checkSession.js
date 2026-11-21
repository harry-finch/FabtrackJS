const staffSessionService = require("../services/staffSessionService.js");
const { isApiOrAjaxRequest, clearRevokedSessionState } = require("./requireRoles.js");

module.exports = async function isAuthenticated(req, res, next) {
  if (!req.session || !req.session.loggedin) {
    if (isApiOrAjaxRequest(req)) {
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

  let verification;
  try {
    verification = await staffSessionService.verifyActiveStaffSession(req.session);
  } catch (err) {
    return next(err);
  }

  if (!verification.valid) {
    clearRevokedSessionState(req);
    const revokedMsg = "Votre session a expiré ou votre compte staff n'est plus actif.";
    if (isApiOrAjaxRequest(req)) {
      return res.status(401).json({
        success: false,
        code: "SESSION_REVOKED",
        error: revokedMsg,
        message: revokedMsg,
      });
    }
    if (req.session) {
      req.session.notification = `Error: ${revokedMsg}`;
    }
    return res.redirect("/login");
  }

  if (res.locals) {
    res.locals.role = req.session.role;
    res.locals.username = req.session.username;
  }

  return next();
};
