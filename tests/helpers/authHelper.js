const request = require("supertest");
const { ensureTestStaff, TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD } = require("./testDb");

/**
 * Creates an authenticated Supertest agent logged in as Admin.
 * @param {Express.Application} app
 * @returns {Promise<Supertest.Agent>}
 */
async function getAdminAgent(app) {
  await ensureTestStaff();
  const agent = request.agent(app);

  const loginRes = await agent
    .post("/auth")
    .type("form")
    .send({
      username: TEST_ADMIN_USERNAME,
      password: TEST_ADMIN_PASSWORD,
    });

  // /auth redirects on success (302)
  if (loginRes.status !== 302) {
    throw new Error(`Failed to log in as admin: HTTP ${loginRes.status}`);
  }

  return agent;
}

module.exports = {
  getAdminAgent,
};
