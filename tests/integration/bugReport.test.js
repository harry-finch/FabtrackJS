const app = require("../../app");
const { getAdminAgent } = require("../helpers/authHelper");
const { cleanTestData, prisma } = require("../helpers/testDb");
const mailService = require("../../services/mailService");

describe("Integration: Bug & Improvement Reporting (POST /report-bug)", () => {
  let adminAgent;

  beforeAll(async () => {
    adminAgent = await getAdminAgent(app);
  });

  afterAll(async () => {
    await cleanTestData();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    mailService.sendBugReportAlert.mockClear();
  });

  test("1. Successfully submits a bug report and dispatches email alert to admin", async () => {
    const res = await adminAgent
      .post("/report-bug")
      .type("form")
      .send({
        title: "Bouton de validation inactif sur mobile",
        category: "Bug / Dysfonctionnement",
        description: "Lorsqu'on clique sur le bouton en vue mobile, rien ne se passe et aucune erreur n'apparaît dans la console.",
        pageUrl: "http://localhost:8080/fabtrack",
        severity: "Élevée",
        reporterEmail: "test.reporter@sorbonne-universite.fr",
      });

    expect(res.status).toBe(302);

    // Verify email service was called with proper payload
    expect(mailService.sendBugReportAlert).toHaveBeenCalledTimes(1);
    const callArgs = mailService.sendBugReportAlert.mock.calls[0][0];
    expect(callArgs.title).toBe("Bouton de validation inactif sur mobile");
    expect(callArgs.category).toBe("Bug / Dysfonctionnement");
    expect(callArgs.severity).toBe("Élevée");
    expect(callArgs.reporterEmail).toBe("test.reporter@sorbonne-universite.fr");

    // Follow redirect and check notification
    const followRes = await adminAgent.get("/fabtrack");
    expect(followRes.status).toBe(200);
    expect(followRes.text).toContain("Success:");
    expect(followRes.text).toContain("Votre signalement a bien été transmis");
  });

  test("2. Rejects submission when title is missing or description is too short", async () => {
    const res = await adminAgent
      .post("/report-bug")
      .type("form")
      .send({
        title: "",
        description: "hs",
      });

    expect(res.status).toBe(302);
    expect(mailService.sendBugReportAlert).not.toHaveBeenCalled();

    const followRes = await adminAgent.get("/fabtrack");
    expect(followRes.status).toBe(200);
    expect(followRes.text).toContain("Error:");
  });

  test("3. Header displays both the top bug button and the modal trigger in dropdown", async () => {
    const res = await adminAgent.get("/fabtrack");
    expect(res.status).toBe(200);
    expect(res.text).toContain("data-bs-target=\"#modalReportBug\"");
    expect(res.text).toContain("Signaler un bug ou une amélioration");
    expect(res.text).toContain("id=\"modalReportBug\"");
  });
});
