const request = require("supertest");
const { ensureTestStaff, TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD } = require("./testDb");

/**
 * Extracts a CSRF token from rendered HTML (`<meta name="csrf-token" content="...">`
 * or `<input type="hidden" name="_csrf" value="...">`).
 *
 * @param {string} html
 * @returns {string}
 */
function extractCsrfTokenFromHtml(html) {
  if (typeof html !== "string" || !html) {
    return "";
  }

  const metaMatch =
    html.match(/<meta\s+[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*name=["']csrf-token["']/i);
  if (metaMatch && metaMatch[1]) {
    return metaMatch[1].trim();
  }

  const inputMatch =
    html.match(/<input\s+[^>]*name=["']_csrf["'][^>]*value=["']([^"']+)["']/i) ||
    html.match(/<input\s+[^>]*value=["']([^"']+)["'][^>]*name=["']_csrf["']/i);
  if (inputMatch && inputMatch[1]) {
    return inputMatch[1].trim();
  }

  return "";
}

/**
 * Fetches an HTML page using the provided Supertest agent and extracts its session CSRF token.
 *
 * @param {Supertest.Agent} agent
 * @param {string} [pagePath="/fabtrack"]
 * @returns {Promise<string>}
 */
async function getCsrfToken(agent, pagePath = "/fabtrack") {
  const res = await agent.get(pagePath);
  const token = extractCsrfTokenFromHtml(res.text);
  if (token) {
    agent.csrfToken = token;
  }
  return token;
}

/**
 * Creates an authenticated Supertest agent logged in as Admin, with `agent.csrfToken`
 * populated for state-changing requests.
 *
 * @param {Express.Application} app
 * @returns {Promise<Supertest.Agent & { csrfToken: string }>}
 */
async function getAdminAgent(app) {
  await ensureTestStaff();
  const agent = request.agent(app);

  const loginPageRes = await agent.get("/login");
  const preAuthCsrfToken = extractCsrfTokenFromHtml(loginPageRes.text);
  if (!preAuthCsrfToken) {
    throw new Error(`Failed to extract CSRF token from GET /login (HTTP ${loginPageRes.status})`);
  }

  const loginRes = await agent
    .post("/auth")
    .set("X-CSRF-Token", preAuthCsrfToken)
    .type("form")
    .send({
      username: TEST_ADMIN_USERNAME,
      password: TEST_ADMIN_PASSWORD,
      _csrf: preAuthCsrfToken,
    });

  // /auth redirects on success (302) and regenerates the session + CSRF token
  if (loginRes.status !== 302) {
    throw new Error(`Failed to log in as admin: HTTP ${loginRes.status}`);
  }

  // Fetch an authenticated page to obtain the post-regeneration CSRF token
  const postAuthToken = await getCsrfToken(agent, "/fabtrack");
  if (!postAuthToken) {
    throw new Error("Failed to extract post-login CSRF token from GET /fabtrack");
  }
  agent.csrfToken = postAuthToken;

  return agent;
}

module.exports = {
  getAdminAgent,
  extractCsrfTokenFromHtml,
  getCsrfToken,
};
