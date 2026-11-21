const requireRoles = require("./requireRoles.js");

module.exports = requireRoles("admin", {
  notification: "Error: Unauthorized access!",
  redirectUrl: "/fabtrack",
  message: "Accès réservé aux administrateurs.",
});
