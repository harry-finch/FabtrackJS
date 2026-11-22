const crypto = require("crypto");

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function getMinLevel() {
  const raw = (process.env.LOG_LEVEL || (process.env.NODE_ENV === "test" ? "error" : "info")).toLowerCase();
  return LEVELS[raw] ?? LEVELS.info;
}

/**
 * Masks an RFID badge UID for GDPR-compliant logging (never persists raw badge UIDs in Log).
 *
 * @param {string} uid
 * @returns {string}
 */
function maskRfidUid(uid) {
  if (typeof uid !== "string") return "****";
  const clean = uid.trim();
  if (!clean) return "****";
  if (clean.length <= 4) return "****";
  if (clean.length <= 6) return `${"*".repeat(clean.length - 2)}${clean.slice(-2)}`;
  return `****${clean.slice(-4)}`;
}

/**
 * Emits a structured JSON log record (NDJSON) to stdout/stderr.
 *
 * @param {"debug"|"info"|"warn"|"error"} level
 * @param {string} msg
 * @param {Record<string, unknown>} [fields={}]
 * @param {NodeJS.WriteStream} [stream]
 */
function writeLog(level, msg, fields = {}, stream = null) {
  if ((LEVELS[level] ?? LEVELS.info) < getMinLevel()) {
    return null;
  }

  const record = {
    timestamp: new Date().toISOString(),
    level,
    msg,
    ...fields,
  };
  const line = JSON.stringify(record);
  const targetStream = stream || (level === "error" || level === "warn" ? process.stderr : process.stdout);
  if (targetStream && typeof targetStream.write === "function") {
    targetStream.write(`${line}\n`);
  }
  return record;
}

function info(msg, fields = {}) {
  return writeLog("info", msg, fields);
}

function warn(msg, fields = {}) {
  return writeLog("warn", msg, fields);
}

function error(msg, fields = {}) {
  return writeLog("error", msg, fields);
}

function debug(msg, fields = {}) {
  return writeLog("debug", msg, fields);
}

/**
 * Express structured HTTP logging middleware (NDJSON).
 * Attaches a per-request `req.requestId` and `X-Request-Id` header, and emits a
 * single JSON line on response finish without logging cookies, bodies, or query secrets.
 */
function httpLoggerMiddleware(options = {}) {
  const outputStream = options.stream || process.stdout;
  return (req, res, next) => {
    const startNs = process.hrtime.bigint();
    const incomingId =
      req.headers && typeof req.headers["x-request-id"] === "string"
        ? req.headers["x-request-id"].trim().slice(0, 64)
        : "";
    const requestId = incomingId && /^[a-zA-Z0-9._-]+$/.test(incomingId) ? incomingId : crypto.randomUUID();

    req.requestId = requestId;
    if (typeof res.setHeader === "function") {
      res.setHeader("X-Request-Id", requestId);
    }

    res.on("finish", () => {
      const durationMs = Number(((process.hrtime.bigint() - startNs) / 1000000n).toString());
      const pathOnly = (req.originalUrl || req.url || req.path || "/").split("?")[0];
      const statusCode = res.statusCode || 200;
      const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";
      writeLog(
        level,
        "http_request",
        {
          requestId,
          method: req.method,
          path: pathOnly,
          statusCode,
          durationMs,
          ip: req.ip || undefined,
        },
        outputStream,
      );
    });

    return next();
  };
}

module.exports = {
  maskRfidUid,
  writeLog,
  info,
  warn,
  error,
  debug,
  httpLoggerMiddleware,
};
