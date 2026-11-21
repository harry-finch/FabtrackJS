const { prisma: defaultPrisma } = require("./db");

const MAX_LOG_LENGTH = 255;

/**
 * Creates a logger instance that persists truncated log entries to the database
 * and writes the full raw message to the console without rejecting on DB errors.
 */
function createLogger({ prisma = defaultPrisma, consoleObj = console } = {}) {
  return {
    logThat: async function (message) {
      const rawMessage = message == null ? "" : String(message);
      const safeMessage =
        rawMessage.length > MAX_LOG_LENGTH
          ? rawMessage.slice(0, MAX_LOG_LENGTH - 3) + "..."
          : rawMessage;

      try {
        await prisma.log.create({
          data: {
            description: safeMessage,
          },
        });
      } catch (err) {
        consoleObj.error(
          "[simpleLogger] Failed to persist log entry:",
          err && err.message ? err.message : err
        );
      }

      consoleObj.log(rawMessage);
    },
  };
}

const defaultLogger = createLogger();

module.exports = {
  logThat: defaultLogger.logThat,
  MAX_LOG_LENGTH,
  createLogger,
};
