#!/usr/bin/env node
/**
 * Pure-JS incremental SQL migration runner compatible with NetBSD, macOS and Linux.
 * Uses only the `mariadb` Node driver (no native Prisma schema-engine binary required).
 *
 * Usage:
 *   node scripts/migrate.js              # Apply all pending migrations
 *   node scripts/migrate.js --status     # Show applied and pending migrations
 *   node scripts/migrate.js --dry-run    # Print pending migrations without executing
 *   node scripts/migrate.js --baseline   # Record all existing migrations as applied (fresh schema.sql install)
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mariadb = require("mariadb");

const DEFAULT_MIGRATIONS_DIR = path.join(__dirname, "../prisma/migrations_sql");
const MIGRATION_FILENAME_RE = /^(\d{3,})_([a-z0-9_-]+)\.sql$/i;

const CREATE_SCHEMA_VERSION_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS \`_schema_version\` (
  \`version\` VARCHAR(64) NOT NULL PRIMARY KEY,
  \`description\` VARCHAR(255) NOT NULL,
  \`checksum\` VARCHAR(64) NOT NULL,
  \`appliedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`.trim();

function parseMigrationFilename(filename) {
  const match = MIGRATION_FILENAME_RE.exec(filename);
  if (!match) return null;
  return {
    version: match[1],
    numericOrder: parseInt(match[1], 10),
    description: match[2].replace(/[_-]+/g, " "),
    filename,
  };
}

function computeChecksum(sqlContent) {
  return crypto.createHash("sha256").update(sqlContent, "utf8").digest("hex");
}

function discoverMigrations(migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const entries = fs.readdirSync(migrationsDir);
  const migrations = [];

  for (const filename of entries) {
    const parsed = parseMigrationFilename(filename);
    if (!parsed) continue;
    const fullPath = path.join(migrationsDir, filename);
    if (!fs.statSync(fullPath).isFile()) continue;
    const sql = fs.readFileSync(fullPath, "utf8");
    migrations.push({
      ...parsed,
      fullPath,
      sql,
      checksum: computeChecksum(sql),
    });
  }

  migrations.sort((a, b) => a.numericOrder - b.numericOrder || a.filename.localeCompare(b.filename));
  return migrations;
}

/**
 * Splits a SQL migration script into executable statements, ignoring `--` line comments,
 * `/* ... *\/` block comments, and semicolons inside single/double/backtick quoted strings.
 *
 * @param {string} sql
 * @returns {string[]}
 */
function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        current += "\n";
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (!inSingle && !inDouble && !inBacktick) {
      if (ch === "-" && next === "-") {
        inLineComment = true;
        i++;
        continue;
      }
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        i++;
        continue;
      }
    }

    if (ch === "'" && !inDouble && !inBacktick) {
      if (inSingle && next === "'") {
        current += "''";
        i++;
        continue;
      }
      if (inSingle && sql[i - 1] === "\\") {
        current += ch;
        continue;
      }
      inSingle = !inSingle;
      current += ch;
      continue;
    }

    if (ch === '"' && !inSingle && !inBacktick) {
      if (inDouble && sql[i - 1] === "\\") {
        current += ch;
        continue;
      }
      inDouble = !inDouble;
      current += ch;
      continue;
    }

    if (ch === "`" && !inSingle && !inDouble) {
      inBacktick = !inBacktick;
      current += ch;
      continue;
    }

    if (ch === ";" && !inSingle && !inDouble && !inBacktick) {
      const trimmed = current.trim();
      if (trimmed) {
        statements.push(trimmed);
      }
      current = "";
      continue;
    }

    current += ch;
  }

  const tail = current.trim();
  if (tail) {
    statements.push(tail);
  }

  return statements;
}

/**
 * Executes pending migrations against an already-connected MariaDB connection.
 * Designed for direct unit testing with mock connections as well as CLI execution.
 */
async function runMigrations({
  connection,
  migrationsDir = DEFAULT_MIGRATIONS_DIR,
  mode = "apply", // "apply" | "status" | "dry-run" | "baseline"
  forceChecksum = false,
  log = console.log,
} = {}) {
  const migrations = discoverMigrations(migrationsDir);

  await connection.query(CREATE_SCHEMA_VERSION_TABLE_SQL);
  const appliedRows = await connection.query(
    "SELECT `version`, `description`, `checksum`, `appliedAt` FROM `_schema_version` ORDER BY `version` ASC",
  );
  const appliedMap = new Map(appliedRows.map((row) => [String(row.version), row]));

  const summary = {
    total: migrations.length,
    alreadyApplied: [],
    pending: [],
    appliedNow: [],
    checksumMismatches: [],
  };

  for (const mig of migrations) {
    const existing = appliedMap.get(mig.version);
    if (existing) {
      summary.alreadyApplied.push(mig.version);
      if (existing.checksum !== mig.checksum) {
        summary.checksumMismatches.push({
          version: mig.version,
          filename: mig.filename,
          expected: existing.checksum,
          actual: mig.checksum,
        });
      }
    } else {
      summary.pending.push(mig);
    }
  }

  if (summary.checksumMismatches.length > 0 && !forceChecksum && mode === "apply") {
    const list = summary.checksumMismatches.map((m) => `${m.version} (${m.filename})`).join(", ");
    throw new Error(
      `Checksum mismatch detected for already-applied migration(s): ${list}. Refusing to proceed (use --force-checksum only if intentional).`,
    );
  }

  if (mode === "status") {
    log(`Migrations directory: ${migrationsDir}`);
    log(`Applied (${summary.alreadyApplied.length}): ${summary.alreadyApplied.join(", ") || "none"}`);
    log(`Pending (${summary.pending.length}): ${summary.pending.map((m) => m.filename).join(", ") || "none"}`);
    return summary;
  }

  if (mode === "dry-run") {
    log(`[dry-run] ${summary.pending.length} pending migration(s):`);
    for (const mig of summary.pending) {
      const statements = splitSqlStatements(mig.sql);
      log(`  - ${mig.filename} (${statements.length} statement(s))`);
    }
    return summary;
  }

  if (mode === "baseline") {
    for (const mig of summary.pending) {
      await connection.query(
        "INSERT INTO `_schema_version` (`version`, `description`, `checksum`) VALUES (?, ?, ?)",
        [mig.version, mig.description, mig.checksum],
      );
      summary.appliedNow.push(mig.version);
      log(`[baseline] Marked ${mig.filename} as applied.`);
    }
    return summary;
  }

  for (const mig of summary.pending) {
    const statements = splitSqlStatements(mig.sql);
    log(`[migrate] Applying ${mig.filename} (${statements.length} statement(s))...`);
    for (const stmt of statements) {
      await connection.query(stmt);
    }
    await connection.query(
      "INSERT INTO `_schema_version` (`version`, `description`, `checksum`) VALUES (?, ?, ?)",
      [mig.version, mig.description, mig.checksum],
    );
    summary.appliedNow.push(mig.version);
    log(`[migrate] Applied ${mig.filename} successfully.`);
  }

  if (summary.appliedNow.length === 0) {
    log("[migrate] Database schema is already up to date.");
  }

  return summary;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const mode = args.has("--status")
    ? "status"
    : args.has("--dry-run")
      ? "dry-run"
      : args.has("--baseline")
        ? "baseline"
        : "apply";
  const forceChecksum = args.has("--force-checksum");

  const dbUrl = (process.env.DATABASE_URL || "").trim();
  if (!dbUrl) {
    console.error("[migrate] ERROR: DATABASE_URL is not configured.");
    process.exit(1);
  }

  const conn = await mariadb.createConnection(dbUrl.replace(/^mysql:\/\//, "mariadb://"));
  try {
    await runMigrations({ connection: conn, mode, forceChecksum });
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[migrate] Migration failed:", err.message);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_MIGRATIONS_DIR,
  CREATE_SCHEMA_VERSION_TABLE_SQL,
  parseMigrationFilename,
  computeChecksum,
  discoverMigrations,
  splitSqlStatements,
  runMigrations,
};
