const { formatFlash } = require("../utilities/flashHelper.js");

module.exports = function clearNotification(req, res, next) {
  if (req && req.session) {
    const translateFn =
      typeof res.__ === "function"
        ? res.__.bind(res)
        : typeof req.__ === "function"
          ? req.__.bind(req)
          : null;
    res.locals.notification = formatFlash(req.session.notification, translateFn);
    req.session.notification = "";
  } else {
    res.locals.notification = "";
  }
  next();
};
