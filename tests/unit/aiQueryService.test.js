const aiQueryService = require("../../services/aiQueryService");

describe("Unit: AiQueryService - SQL Firewall & Visualization Logic", () => {
  describe("validateAndSanitizeSql()", () => {
    test("allows standard SELECT query", () => {
      const sql = "SELECT id, name FROM User WHERE active = 1";
      const sanitized = aiQueryService.validateAndSanitizeSql(sql);
      expect(sanitized).toMatch(/^SELECT id, name FROM User WHERE active = 1 LIMIT 200$/i);
    });

    test("allows WITH ... SELECT (CTE)", () => {
      const sql = "WITH single_visits AS (SELECT userId FROM History GROUP BY userId HAVING COUNT(*) = 1) SELECT COUNT(*) FROM single_visits";
      const sanitized = aiQueryService.validateAndSanitizeSql(sql);
      expect(sanitized).toContain("WITH single_visits AS");
    });

    test("rejects mutation commands: INSERT, UPDATE, DELETE, DROP, ALTER", () => {
      expect(() => aiQueryService.validateAndSanitizeSql("DELETE FROM User")).toThrow(/Seules les requêtes de lecture/i);
      expect(() => aiQueryService.validateAndSanitizeSql("DROP TABLE History")).toThrow(/Seules les requêtes de lecture/i);
      expect(() => aiQueryService.validateAndSanitizeSql("UPDATE User SET balance = 100")).toThrow(/Seules les requêtes de lecture/i);
      expect(() => aiQueryService.validateAndSanitizeSql("INSERT INTO User (name) VALUES ('Test')")).toThrow(/Seules les requêtes de lecture/i);
      expect(() => aiQueryService.validateAndSanitizeSql("ALTER TABLE User ADD COLUMN hack INT")).toThrow(/Seules les requêtes de lecture/i);
    });

    test("rejects chained / multiple queries with semicolons", () => {
      const sql = "SELECT * FROM User; DROP TABLE Machine;";
      expect(() => aiQueryService.validateAndSanitizeSql(sql)).toThrow(/requêtes multiples/i);
    });

    test("rejects queries accessing Staff table", () => {
      const sql = "SELECT * FROM Staff WHERE role = 'admin'";
      expect(() => aiQueryService.validateAndSanitizeSql(sql)).toThrow(/tables d'administration et de sécurité est bloqué/i);
    });

    test("rejects queries accessing SystemSetting table", () => {
      const sql = "SELECT * FROM SystemSetting";
      expect(() => aiQueryService.validateAndSanitizeSql(sql)).toThrow(/tables d'administration et de sécurité est bloqué/i);
    });

    test("rejects queries selecting password or tokens", () => {
      const sql = "SELECT id, password FROM User";
      expect(() => aiQueryService.validateAndSanitizeSql(sql)).toThrow(/champs de sécurité ou jetons/i);
    });

    test("does NOT append LIMIT 200 to single-row global COUNT(*) queries", () => {
      const sql = "SELECT COUNT(*) as count FROM User";
      const sanitized = aiQueryService.validateAndSanitizeSql(sql);
      expect(sanitized).toBe("SELECT COUNT(*) as count FROM User");
    });
  });

  describe("parseJsonResponse()", () => {
    test("parses plain JSON text", () => {
      const json = '{"sql": "SELECT 1", "explanation": "Test"}';
      const parsed = aiQueryService.parseJsonResponse(json);
      expect(parsed.sql).toBe("SELECT 1");
    });

    test("cleans and parses markdown code blocks ```json ... ```", () => {
      const json = '```json\n{"sql": "SELECT 1", "explanation": "Test"}\n```';
      const parsed = aiQueryService.parseJsonResponse(json);
      expect(parsed.sql).toBe("SELECT 1");
    });

    test("extracts JSON embedded in explanatory text", () => {
      const text = 'Voici la réponse demandée :\n{"sql": "SELECT 1", "explanation": "Test"}\nEn espérant que cela vous aide.';
      const parsed = aiQueryService.parseJsonResponse(text);
      expect(parsed.sql).toBe("SELECT 1");
    });
  });

  describe("buildVisualization()", () => {
    test("detects single scalar numerical value as KPI", () => {
      const rows = [{ single_visitor_count: 42 }];
      const viz = aiQueryService.buildVisualization(rows, { title: "Visiteurs uniques" });
      expect(viz.isKpi).toBe(true);
      expect(viz.kpiValue).toBe(42);
      expect(viz.chartType).toBe("kpi");
    });

    test("builds Chart.js bar config for label + numerical value pairs", () => {
      const rows = [
        { machine: "Découpeuse Laser", sessions: 85 },
        { machine: "Imprimante 3D Prusa", sessions: 120 },
      ];
      const viz = aiQueryService.buildVisualization(rows, {
        chartType: "bar",
        title: "Top Machines",
        xKey: "machine",
        yKey: "sessions",
      });
      expect(viz.isKpi).toBe(false);
      expect(viz.chartType).toBe("bar");
      expect(viz.chartConfig).toBeDefined();
      expect(viz.chartConfig.data.labels).toEqual(["Découpeuse Laser", "Imprimante 3D Prusa"]);
      expect(viz.chartConfig.data.datasets[0].data).toEqual([85, 120]);
    });

    test("falls back to table for empty rows", () => {
      const viz = aiQueryService.buildVisualization([]);
      expect(viz.chartType).toBe("table");
      expect(viz.isKpi).toBe(false);
    });
  });
});
