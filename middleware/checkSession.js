module.exports = function isAuthenticated(req, res, next) {
  if (req.session.loggedin) return next();
  req.session.notification = "Error: Please log in.";
  res.redirect("/login");
};
