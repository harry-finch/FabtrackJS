module.exports = function isLoggedIn(req, res, next) {
  if (req.session.loggedin) {
    next();
  } else {
    req.session.error = "You are not logged in.";
    res.redirect("/login");
  }
};
