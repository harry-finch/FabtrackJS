module.exports = function isAdmin(req, res, next) {
  if (req.session.role === "admin") {
    res.locals.username = req.session.username;
    next();
  } else {
    req.session.notification = "Error: Unauthorized access!";
    res.redirect("/login");
  }
};
