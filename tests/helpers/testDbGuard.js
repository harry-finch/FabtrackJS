/**
 * Garde pure de validation et d'isolation de la base de données de test.
 * Aucun effet de bord à l'importation.
 */

/**
 * Valide que l'URL de base de données de test est présente, syntaxiquement valide,
 * pointe vers une base se terminant par "_test" et n'est pas exécutée en production.
 * @param {Object} params
 * @param {string} [params.nodeEnv]
 * @param {string} [params.databaseUrlTest]
 * @returns {{ url: string, dbName: string }}
 */
function validateTestDatabaseUrl({ nodeEnv, databaseUrlTest } = {}) {
  if (nodeEnv === "production") {
    throw new Error("Refus d'exécuter les tests d'intégration lorsque NODE_ENV=production.");
  }

  if (!databaseUrlTest || !String(databaseUrlTest).trim()) {
    throw new Error(
      "DATABASE_URL_TEST est obligatoire pour exécuter les tests d'intégration (doit pointer vers une base se terminant par '_test')."
    );
  }

  const trimmedUrl = String(databaseUrlTest).trim();

  let parsed;
  try {
    parsed = new URL(trimmedUrl);
  } catch {
    throw new Error("DATABASE_URL_TEST n'est pas une URL de connexion valide.");
  }

  const dbName = parsed.pathname.replace(/^\/+/, "").split("/")[0];
  if (!dbName || !dbName.endsWith("_test")) {
    throw new Error(
      `Base de test refusée ("${dbName || "inconnue"}") : le nom de la base DATABASE_URL_TEST doit se terminer par "_test".`
    );
  }

  return { url: trimmedUrl, dbName };
}

/**
 * Charge .env (si env === process.env), valide DATABASE_URL_TEST et force env.DATABASE_URL.
 * @param {NodeJS.ProcessEnv|Object} [env=process.env]
 * @returns {{ url: string, dbName: string }}
 */
function enforceTestDatabase(env = process.env) {
  if (env === process.env) {
    require("dotenv").config({ quiet: true });
  }

  const validated = validateTestDatabaseUrl({
    nodeEnv: env.NODE_ENV,
    databaseUrlTest: env.DATABASE_URL_TEST,
  });

  env.DATABASE_URL = validated.url;
  return validated;
}

module.exports = {
  validateTestDatabaseUrl,
  enforceTestDatabase,
};
