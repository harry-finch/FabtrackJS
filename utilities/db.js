require("dotenv").config();
const { PrismaClient: BasePrismaClient, ResourceType, ConsumableStatus } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");
const mariadb = require("mariadb");

let sharedPool = global.__fabtrack_mariadb_pool__;

/**
 * Returns the singleton MariaDB connection pool.
 */
function getSharedPool() {
  if (!sharedPool) {
    const url = new URL((process.env.DATABASE_URL || "").replace(/^mysql:\/\//, "mariadb://"));
    if (!url.searchParams.has("connectionLimit")) {
      url.searchParams.set("connectionLimit", "20");
    }
    if (!url.searchParams.has("idleTimeout")) {
      url.searchParams.set("idleTimeout", "5");
    }
    sharedPool = mariadb.createPool(url.toString());
    if (process.env.NODE_ENV !== "production") {
      global.__fabtrack_mariadb_pool__ = sharedPool;
    }
  }
  return sharedPool;
}

/**
 * Creates a PrismaMariaDb adapter referencing the shared pool.
 */
function createMariaDbAdapter() {
  return new PrismaMariaDb(getSharedPool());
}

let globalPrisma = global.__fabtrack_prisma__;

/**
 * AutoPrismaClient injects the MariaDB driver adapter and returns the singleton instance,
 * avoiding connection pool exhaustion when multiple files call new PrismaClient().
 */
class AutoPrismaClient extends BasePrismaClient {
  constructor(options = {}) {
    if (!options.adapter && !options.accelerateUrl) {
      if (globalPrisma) {
        return globalPrisma;
      }
      super({ adapter: createMariaDbAdapter(), ...options });
      globalPrisma = this;
      if (process.env.NODE_ENV !== "production") {
        global.__fabtrack_prisma__ = globalPrisma;
      }
      return this;
    }
    super(options);
  }
}

// Intercept require("@prisma/client") so any code calling
// `const { PrismaClient } = require("@prisma/client")` receives AutoPrismaClient.
try {
  const prismaClientPath = require.resolve("@prisma/client");
  const defaultExport = require(prismaClientPath);
  require.cache[prismaClientPath].exports = {
    ...defaultExport,
    PrismaClient: AutoPrismaClient,
  };
} catch (e) {
  // Ignored if not yet resolved
}

if (!globalPrisma) {
  globalPrisma = new AutoPrismaClient();
}

if (process.env.NODE_ENV === "test") {
  // Prevent individual test suites from disconnecting the shared instance between sequential test files in runInBand mode
  globalPrisma.$disconnect = async () => {};
}

module.exports = {
  prisma: globalPrisma,
  PrismaClient: AutoPrismaClient,
  ResourceType,
  ConsumableStatus,
  createMariaDbAdapter,
};
