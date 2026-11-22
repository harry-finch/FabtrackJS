#!/usr/bin/env node
/**
 * GDPR retention anonymization CLI for FabtrackJS.
 *
 * Usage:
 *   npm run rgpd:anonymize -- --dry-run
 *   npm run rgpd:anonymize -- --months=36 --dry-run
 *   npm run rgpd:anonymize -- --months=36
 */

require("dotenv").config();
const { prisma, closePool } = require("../utilities/db.js");
const rgpdService = require("../services/rgpdService.js");

function parseArgs(argv = process.argv.slice(2)) {
  let retentionMonths = rgpdService.DEFAULT_RETENTION_MONTHS;
  let dryRun = false;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg.startsWith("--months=")) {
      retentionMonths = parseInt(arg.slice("--months=".length), 10);
    }
  }

  return { retentionMonths, dryRun };
}

async function main() {
  const { retentionMonths, dryRun } = parseArgs();
  console.log(
    `[RGPD] Anonymisation des comptes inactifs depuis plus de ${retentionMonths} mois (${dryRun ? "SIMULATION --dry-run" : "EXÉCUTION"})...`,
  );

  try {
    const result = await rgpdService.anonymizeInactiveUsers({ retentionMonths, dryRun, prisma });
    console.log(`[RGPD] Date seuil : ${result.cutoffDate}`);
    console.log(`[RGPD] Comptes éligibles : ${result.eligibleCount}`);
    if (dryRun) {
      console.log(`[RGPD] Aucun compte modifié (--dry-run). IDs éligibles : ${result.eligibleUserIds.join(", ") || "aucun"}`);
    } else {
      console.log(`[RGPD] Comptes anonymisés avec succès : ${result.anonymizedCount}`);
    }
  } finally {
    await prisma.$disconnect();
    await closePool();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[RGPD] Échec :", err.message);
    process.exit(1);
  });
}

module.exports = { parseArgs, main };
