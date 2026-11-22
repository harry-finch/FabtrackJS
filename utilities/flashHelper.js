/**
 * Structured & Legacy Flash Notification Helper (R-029)
 * Supports both:
 *   - Structured i18n payloads: { type: "success"|"error"|"warning"|"info", key: "alerts.settings_saved", params?: [...] }
 *   - Legacy strings: "Success: ...", "Error: ...", "Warning: ...", "Info: ..."
 */

const PREFIX_BY_TYPE = {
  success: "Success",
  error: "Error",
  warning: "Warning",
  info: "Info",
};

function normalizeType(type) {
  const key = String(type || "info").trim().toLowerCase();
  return PREFIX_BY_TYPE[key] ? key : "info";
}

function setFlash(req, type, key, params = []) {
  if (!req || !req.session) return;
  req.session.notification = {
    type: normalizeType(type),
    key: String(key || ""),
    params: Array.isArray(params) ? params : [params],
  };
}

function formatFlash(notification, translateFn) {
  if (!notification) return "";

  if (typeof notification === "string") {
    return notification;
  }

  if (typeof notification === "object" && notification.key) {
    const type = normalizeType(notification.type);
    const prefix = PREFIX_BY_TYPE[type];
    const params = Array.isArray(notification.params) ? notification.params : [];
    let translated = notification.key;
    if (typeof translateFn === "function") {
      try {
        translated = translateFn(notification.key, ...params);
      } catch (_err) {
        translated = notification.key;
      }
    }
    return `${prefix}: ${translated}`;
  }

  return String(notification);
}

module.exports = {
  setFlash,
  formatFlash,
  PREFIX_BY_TYPE,
};
