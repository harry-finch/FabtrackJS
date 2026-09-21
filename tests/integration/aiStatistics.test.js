const request = require("supertest");
const app = require("../../app");
const { getAdminAgent } = require("../helpers/authHelper");
const aiQueryService = require("../../services/aiQueryService");
const settingsService = require("../../services/settingsService");

describe("Integration: Statistics Natural Language AI Query (NL2SQL)", () => {
  let adminAgent;

  beforeAll(async () => {
    adminAgent = await getAdminAgent(app);
  });

  afterAll(async () => {
    // Restore default AI provider to none
    await settingsService.updateSettings({ ai_provider: "none" });
  });

  test("1. Unauthenticated request to /admin/statistics/ai-query is redirected to /login", async () => {
    const res = await request(app)
      .post("/admin/statistics/ai-query")
      .send({ question: "Combien d'usagers ?" });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/login");
  });

  test("2. Admin GET /admin/statistics renders with AI configuration attributes", async () => {
    const res = await adminAgent.get("/admin/statistics");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Assistant de requêtes en langage naturel");
    expect(res.text).toContain("aiQuestionInput");
  });

  test("3. POST /admin/statistics/ai-query returns 400 on empty question", async () => {
    const res = await adminAgent
      .post("/admin/statistics/ai-query")
      .send({ question: "   " });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("4. POST /admin/statistics/ai-query informs user if no provider is configured", async () => {
    await settingsService.updateSettings({ ai_provider: "none" });
    const res = await adminAgent
      .post("/admin/statistics/ai-query")
      .send({ question: "Combien d'usagers ?" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Aucun moteur d'IA n'est configuré/i);
  });

  test("5. End-to-end simulated AI query executes SQL and returns KPI visualization", async () => {
    // Temporarily configure provider as 'local'
    await settingsService.updateSettings({
      ai_provider: "local",
      ai_local_url: "http://localhost:11434/v1",
      ai_local_model: "test-model",
    });

    // Mock callProvider to simulate LLM SQL generation
    const spy = jest.spyOn(aiQueryService, "callProvider").mockResolvedValue(
      JSON.stringify({
        sql: "SELECT COUNT(*) as total_users FROM `User`",
        explanation: "Compte le nombre total d'usagers enregistrés dans la plateforme.",
        chartType: "kpi",
        title: "Nombre total d'usagers",
      })
    );

    const res = await adminAgent
      .post("/admin/statistics/ai-query")
      .send({ question: "Combien d'usagers au total ?" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.sql).toBe("SELECT COUNT(*) as total_users FROM `User`");
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBe(1);
    expect(res.body.visualization.isKpi).toBe(true);
    expect(typeof res.body.visualization.kpiValue).toBe("number");

    spy.mockRestore();
  });

  test("6. End-to-end simulated AI query with categorical data returns Chart.js config", async () => {
    await settingsService.updateSettings({
      ai_provider: "local",
      ai_local_url: "http://localhost:11434/v1",
      ai_local_model: "test-model",
    });

    const spy = jest.spyOn(aiQueryService, "callProvider").mockResolvedValue(
      JSON.stringify({
        sql: "SELECT `name`, id as count FROM `UserType` LIMIT 5",
        explanation: "Liste les typologies d'usagers et leurs identifiants.",
        chartType: "bar",
        title: "Typologies d'usagers",
        xKey: "name",
        yKey: "count",
      })
    );

    const res = await adminAgent
      .post("/admin/statistics/ai-query")
      .send({ question: "Quelles sont les typologies d'usagers ?" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.visualization.chartType).toBe("bar");
    expect(res.body.visualization.chartConfig).toBeDefined();
    expect(res.body.visualization.chartConfig.type).toBe("bar");

    spy.mockRestore();
  });

  test("7. POST /admin/settings/ai/test-connection rejects call when provider is 'none'", async () => {
    const res = await adminAgent
      .post("/admin/settings/ai/test-connection")
      .send({ ai_provider: "none" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("8. POST /admin/settings saves AI provider and keys", async () => {
    const res = await adminAgent
      .post("/admin/settings")
      .field("ai_provider", "gemini")
      .field("ai_gemini_api_key", "AIzaSySecretTestKey")
      .field("ai_gemini_model", "gemini-1.5-flash");

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/admin/settings");

    const current = await settingsService.getSettings();
    expect(current.ai_provider).toBe("gemini");
    expect(current.ai_gemini_api_key).toBe("AIzaSySecretTestKey");
    expect(current.ai_gemini_model).toBe("gemini-1.5-flash");
  });

  test("9. POST /admin/settings/ai/test-connection works with valid mock", async () => {
    const spy = jest.spyOn(aiQueryService, "callProvider").mockResolvedValue('{"status":"OK"}');

    const res = await adminAgent
      .post("/admin/settings/ai/test-connection")
      .send({
        ai_provider: "gemini",
        ai_gemini_api_key: "AIzaSyFakeKey",
        ai_gemini_model: "gemini-1.5-flash",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain("Google Gemini");

    spy.mockRestore();
  });
});
