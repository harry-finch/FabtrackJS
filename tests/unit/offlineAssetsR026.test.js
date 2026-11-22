const fs = require("fs");
const path = require("path");
const request = require("supertest");
const app = require("../../app.js");

const ROOT = path.join(__dirname, "../..");

function walkFiles(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) out = out.concat(walkFiles(full));
    else if (full.endsWith(".ejs") || full.endsWith(".html")) out.push(full);
  }
  return out;
}

describe("R-026: Offline-first self-hosted front assets & lightweight 404 illustration", () => {
  test("zero CDN URLs, @docsearch or animate__ dead classes remain in views/", () => {
    const files = walkFiles(path.join(ROOT, "views"));
    const offenders = [];
    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      if (/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|@docsearch|animate__animated/i.test(content)) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  test("app.js CSP allows only self-hosted scripts, styles, fonts and connections (no external CDNs)", () => {
    const appSrc = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    expect(appSrc).not.toContain("cdn.jsdelivr.net");
    expect(appSrc).not.toContain("cdnjs.cloudflare.com");
    expect(appSrc).not.toContain("fonts.googleapis.com");
    expect(appSrc).not.toContain("fonts.gstatic.com");
  });

  test("local vendor endpoints serve Bootstrap CSS/JS, Chart.js UMD and FontAwesome CSS with HTTP 200", async () => {
    const urls = [
      "/vendor/bootstrap/css/bootstrap.min.css",
      "/vendor/bootstrap/js/bootstrap.bundle.min.js",
      "/vendor/chartjs/chart.umd.min.js",
      "/vendor/fontawesome/css/all.min.css",
      "/images/404-fablab.svg",
    ];
    for (const url of urls) {
      const res = await request(app).get(url);
      expect(res.status).toBe(200);
    }
  });

  test("4.6 MB 404.gif and duplicate unused public/images assets are removed and 404-fablab.svg is < 10 KB", () => {
    for (const rel of [
      "public/images/404.gif",
      "public/images/bootstrap-logo.svg",
      "public/images/favicon.ico",
      "public/images/favicon.png",
      "public/images/favicon.svg",
      "public/images/logo_fablab.svg",
      "public/images/logo_fabtrack.svg",
    ]) {
      expect(fs.existsSync(path.join(ROOT, rel))).toBe(false);
    }
    const stat = fs.statSync(path.join(ROOT, "public/images/404-fablab.svg"));
    expect(stat.size).toBeLessThan(10 * 1024);
  });
});
