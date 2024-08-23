module.exports = function isLoggedIn(req, res, next) {
  if (req.session.loggedin) {
    res.locals.username = req.session.username;
    next();
  } else {
    req.session.notification = "Error: You are not logged in.";
    res.redirect("/login");
  }
};
