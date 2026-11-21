const { isApiOrAjaxRequest } = require("./requireRoles.js");

module.exports = function isAuthenticated(req, res, next) {
  if (req.session && req.session.loggedin) {
    return next();
  }

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
};
