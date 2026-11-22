require("dotenv").config();
const {
  PrismaClient,
  ResourceType,
  ConsumableStatus,
  StaffRole,
  EquipmentStatus,
  MachineIssueStatus,
  RepairStatus,
  Prisma,
} = require("@prisma/client");
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
    if (!url.searchParams.has("acquireTimeout")) {
      url.searchParams.set("acquireTimeout", "30000");
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

if (!globalPrisma) {
  globalPrisma = new PrismaClient({ adapter: createMariaDbAdapter() });
  if (process.env.NODE_ENV !== "production") {
    global.__fabtrack_prisma__ = globalPrisma;
  }
}

if (process.env.NODE_ENV === "test") {
  // Prevent individual test suites from disconnecting the shared instance between sequential test files in runInBand mode
  globalPrisma.$disconnect = async () => {};
}

/**
 * Gracefully closes the shared MariaDB connection pool if initialized.
 */
async function closePool() {
  if (!sharedPool) {
    return;
  }
  const poolToClose = sharedPool;
  sharedPool = null;
  if (global.__fabtrack_mariadb_pool__ === poolToClose) {
    delete global.__fabtrack_mariadb_pool__;
  }
  await poolToClose.end();
}

module.exports = {
  prisma: globalPrisma,
  Prisma,
  ResourceType,
  ConsumableStatus,
  StaffRole,
  EquipmentStatus,
  MachineIssueStatus,
  RepairStatus,
  createMariaDbAdapter,
  closePool,
};
