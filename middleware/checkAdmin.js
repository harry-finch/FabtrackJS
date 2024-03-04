module.exports = function isAdmin(req, res, next) {
  if (req.session.admin) {
    next();
  } else {
    req.session.error = "Unauthorized access!";
    res.redirect("/login");
  }
};
