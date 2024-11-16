module.exports = function clearNotification(req, res, next) {
  res.locals.notification = req.session.notification || "";
  req.session.notification = "";
  next();
};
