const fs = require("fs");
const path = require("path");
const {
  parseMigrationFilename,
  computeChecksum,
  discoverMigrations,
  splitSqlStatements,
  executeStatementCompatible,
  runMigrations,
} = require("../../scripts/migrate.js");

const ROOT = path.join(__dirname, "../..");

describe("R-023: NetBSD-compatible SQL migrations & strict Prisma schema typing", () => {
  describe("1. Migration discovery, filename parsing & SQL statement splitter", () => {
    test("discovers all incremental SQL migrations in strict numeric order", () => {
      const migrations = discoverMigrations();
      expect(migrations.length).toBeGreaterThanOrEqual(4);
      const versions = migrations.map((m) => m.version);
      expect(versions).toEqual(["000", "001", "002", "003", "004"]);
      for (const m of migrations) {
        expect(m.checksum).toMatch(/^[a-f0-9]{64}$/);
        expect(splitSqlStatements(m.sql).length).toBeGreaterThan(0);
      }
    });

    test("parseMigrationFilename accepts NNN_description.sql and rejects unrelated files", () => {
      expect(parseMigrationFilename("004_r023_strict_enums.sql")).toEqual({
        version: "004",
        numericOrder: 4,
        description: "r023 strict enums",
        filename: "004_r023_strict_enums.sql",
      });
      expect(parseMigrationFilename("README.md")).toBeNull();
      expect(parseMigrationFilename("bad.sql")).toBeNull();
    });

    test("splitSqlStatements ignores comments and semicolons inside string literals", () => {
      const sql = `
        -- leading comment; with semicolon
        /* block comment; inside */
        UPDATE \`Log\` SET description = 'ok; kept' WHERE id = 1;
        ALTER TABLE \`Activity\` ADD COLUMN IF NOT EXISTS \`machineId\` INTEGER NULL;
      `;
      const stmts = splitSqlStatements(sql);
      expect(stmts).toHaveLength(2);
      expect(stmts[0]).toContain("'ok; kept'");
      expect(stmts[1]).toContain("ADD COLUMN IF NOT EXISTS");
    });

    test("executeStatementCompatible falls back to MySQL 8.x syntax on errno 1064 and ignores duplicate key/column errors", async () => {
      const queries = [];
      const mockConn = {
        query: jest.fn(async (sql) => {
          queries.push(sql);
          if (sql.includes("IF NOT EXISTS")) {
            const err = new Error("syntax error");
            err.errno = 1064;
            throw err;
          }
          const dupErr = new Error("Duplicate key name");
          dupErr.errno = 1061;
          throw dupErr;
        }),
      };

      await expect(
        executeStatementCompatible(mockConn, "CREATE INDEX IF NOT EXISTS `idx_test` ON `Session`(`expiresAt`)"),
      ).resolves.toBeUndefined();
      expect(queries).toEqual([
        "CREATE INDEX IF NOT EXISTS `idx_test` ON `Session`(`expiresAt`)",
        "CREATE INDEX `idx_test` ON `Session`(`expiresAt`)",
      ]);
    });
  });

  describe("2. runMigrations lifecycle (apply, idempotency, dry-run, baseline, checksum drift)", () => {
    function createMockConnection(appliedRows = []) {
      const applied = [...appliedRows];
      const executedSql = [];
      const connection = {
        executedSql,
        applied,
        query: jest.fn(async (sql, params) => {
          executedSql.push({ sql, params });
          if (sql.startsWith("SELECT `version`")) {
            return applied;
          }
          if (sql.startsWith("INSERT INTO `_schema_version`")) {
            applied.push({
              version: params[0],
              description: params[1],
              checksum: params[2],
              appliedAt: new Date(),
            });
          }
          return [];
        }),
      };
      return connection;
    }

    test("applies all pending migrations in order and records _schema_version, then skips on re-run", async () => {
      const conn = createMockConnection();
      const first = await runMigrations({ connection: conn, mode: "apply", log: () => {} });
      expect(first.appliedNow).toEqual(["000", "001", "002", "003", "004"]);
      expect(conn.applied).toHaveLength(5);

      const second = await runMigrations({ connection: conn, mode: "apply", log: () => {} });
      expect(second.appliedNow).toEqual([]);
      expect(second.alreadyApplied).toEqual(["000", "001", "002", "003", "004"]);
    });

    test("dry-run and status never execute migration DDL or insert _schema_version rows", async () => {
      const conn = createMockConnection();
      const dry = await runMigrations({ connection: conn, mode: "dry-run", log: () => {} });
      expect(dry.pending).toHaveLength(5);
      expect(conn.applied).toHaveLength(0);

      const status = await runMigrations({ connection: conn, mode: "status", log: () => {} });
      expect(status.pending).toHaveLength(5);
      expect(conn.applied).toHaveLength(0);
    });

    test("baseline records existing migrations without executing DDL statements", async () => {
      const conn = createMockConnection();
      const res = await runMigrations({ connection: conn, mode: "baseline", log: () => {} });
      expect(res.appliedNow).toEqual(["000", "001", "002", "003", "004"]);
      expect(conn.executedSql.some((q) => /ALTER TABLE/i.test(q.sql))).toBe(false);
    });

    test("fails fast if an already-applied migration checksum drifts", async () => {
      const conn = createMockConnection([
        { version: "001", description: "r004", checksum: computeChecksum("tampered"), appliedAt: new Date() },
      ]);
      await expect(runMigrations({ connection: conn, mode: "apply", log: () => {} })).rejects.toThrow(
        /Checksum mismatch/i,
      );
    });
  });

  describe("3. Strict Prisma schema & synchronized schema.sql", () => {
    test("prisma/schema.prisma and prisma/schema.sql define strict enums, decimals, Log Text and Activity FKs", () => {
      const schemaPrisma = fs.readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
      const schemaSql = fs.readFileSync(path.join(ROOT, "prisma/schema.sql"), "utf8");

      for (const enumName of ["enum StaffRole", "enum EquipmentStatus", "enum MachineIssueStatus", "enum RepairStatus"]) {
        expect(schemaPrisma).toContain(enumName);
      }

      expect(schemaPrisma).toMatch(/description\s+String\s+@db\.Text/);
      expect(schemaPrisma).toMatch(/balance\s+Decimal\s+@default\(0\.0\)\s+@db\.Decimal\(10,\s*2\)/);
      expect(schemaPrisma).toMatch(/cost\s+Decimal\s+@db\.Decimal\(10,\s*2\)/);
      expect(schemaPrisma).toContain("machineId    Int?");
      expect(schemaPrisma).toContain("consumableId Int?");
      expect(schemaPrisma).toContain("equipmentId  Int?");

      // Synchronized SQL schema reflects all strict types and FKs
      expect(schemaSql).toContain("ENUM('admin', 'user', 'staff')");
      expect(schemaSql).toContain("ENUM('AVAILABLE', 'OUT_OF_SERVICE', 'DECOMMISSIONED')");
      expect(schemaSql).toContain("ENUM('OPEN', 'RESOLVED')");
      expect(schemaSql).toContain("ENUM('PENDING', 'REPAIRED', 'PARTIALLY_REPAIRED', 'NOT_REPAIRED', 'NEEDS_RETURN')");
      expect(schemaSql).toContain("`machineId` INTEGER NULL");
      expect(schemaSql).toContain("`consumableId` INTEGER NULL");
      expect(schemaSql).toContain("`equipmentId` INTEGER NULL");
    });
  });
});
