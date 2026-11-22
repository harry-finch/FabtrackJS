module.exports = function clearNotification(req, res, next) {
  if (req && req.session) {
    res.locals.notification = req.session.notification || "";
    req.session.notification = "";
  } else {
    res.locals.notification = "";
  }
  next();
};
