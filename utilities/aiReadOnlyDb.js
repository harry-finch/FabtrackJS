const mariadb = require("mariadb");

const DEFAULT_MAX_STATEMENT_TIME_SEC = 5;

let aiRoPool = null;
let aiRoPoolUrl = null;

/**
 * Returns (or lazily creates) the dedicated read-only MariaDB connection pool
 * configured via `DATABASE_URL_AI_RO` (`multipleStatements: false`, bounded pool size).
 *
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {import("mariadb").Pool | null}
 */
function getAiReadOnlyPool(env = process.env) {
  const rawUrl = env && typeof env.DATABASE_URL_AI_RO === "string" ? env.DATABASE_URL_AI_RO.trim() : "";
  if (!rawUrl) {
    return null;
  }

  if (aiRoPool && aiRoPoolUrl === rawUrl) {
    return aiRoPool;
  }

  const normalized = new URL(rawUrl.replace(/^mysql:\/\//, "mariadb://"));
  normalized.searchParams.set("multipleStatements", "false");
  if (!normalized.searchParams.has("connectionLimit")) {
    normalized.searchParams.set("connectionLimit", "5");
  }
  if (!normalized.searchParams.has("acquireTimeout")) {
    normalized.searchParams.set("acquireTimeout", "10000");
  }

  aiRoPool = mariadb.createPool(normalized.toString());
  aiRoPoolUrl = rawUrl;
  return aiRoPool;
}

/**
 * Wraps a validated SELECT/WITH query with MariaDB statement timeout guard.
 *
 * @param {string} sql
 * @param {number} [timeoutSec=5]
 * @returns {string}
 */
function wrapWithStatementTimeout(sql, timeoutSec = DEFAULT_MAX_STATEMENT_TIME_SEC) {
  const sec = Number.isInteger(timeoutSec) && timeoutSec > 0 ? timeoutSec : DEFAULT_MAX_STATEMENT_TIME_SEC;
  return `SET STATEMENT max_statement_time=${sec} FOR ${sql}`;
}

/**
 * Executes a validated read-only SQL query using the dedicated `DATABASE_URL_AI_RO` pool.
 * Fail-closed in `NODE_ENV=production` when `DATABASE_URL_AI_RO` is not configured (R-016 / 1A).
 *
 * @param {string} sql
 * @param {Object} [options]
 * @param {NodeJS.ProcessEnv} [options.env=process.env]
 * @param {Object} [options.fallbackPrisma]
 * @param {Object} [options.poolOverride]
 * @returns {Promise<Array>}
 */
async function executeReadOnlyQuery(sql, { env = process.env, fallbackPrisma = null, poolOverride = null } = {}) {
  const timedSql = wrapWithStatementTimeout(sql, DEFAULT_MAX_STATEMENT_TIME_SEC);
  const pool = poolOverride || getAiReadOnlyPool(env);

  if (pool) {
    return await pool.query(timedSql);
  }

  if (env.NODE_ENV === "production") {
    throw new Error(
      "L'assistant IA NL2SQL est désactivé en production tant que le compte MariaDB lecture seule (DATABASE_URL_AI_RO) n'est pas configuré.",
    );
  }

  if (!fallbackPrisma || typeof fallbackPrisma.$queryRawUnsafe !== "function") {
    throw new Error("Aucun connecteur MariaDB lecture seule disponible pour exécuter la requête IA.");
  }

  console.warn("[AI RO DB] DATABASE_URL_AI_RO non configuré (hors production) : repli contrôlé sur le pool principal.");
  return await fallbackPrisma.$queryRawUnsafe(timedSql);
}

/**
 * Gracefully closes the dedicated AI read-only pool during process shutdown.
 */
async function closeAiReadOnlyPool() {
  if (!aiRoPool) return;
  const poolToClose = aiRoPool;
  aiRoPool = null;
  aiRoPoolUrl = null;
  await poolToClose.end();
}

module.exports = {
  DEFAULT_MAX_STATEMENT_TIME_SEC,
  getAiReadOnlyPool,
  wrapWithStatementTimeout,
  executeReadOnlyQuery,
  closeAiReadOnlyPool,
};
