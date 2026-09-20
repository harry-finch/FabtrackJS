require("dotenv").config();
const fs = require("node:fs");
const { defineConfig, env } = require("prisma/config");

// On unsupported platforms like NetBSD where Prisma does not publish precompiled binaries,
// setting PRISMA_SCHEMA_ENGINE_BINARY to /dev/null bypasses the 404 download error
// during `prisma generate` since the JS client generator does not actually execute the binary.
if (process.platform === "netbsd" && !process.env.PRISMA_SCHEMA_ENGINE_BINARY && fs.existsSync("/dev/null")) {
  process.env.PRISMA_SCHEMA_ENGINE_BINARY = "/dev/null";
}

module.exports = defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.js",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
