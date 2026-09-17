module.exports = {
  testEnvironment: "node",
  testTimeout: 15000,
  testMatch: ["**/tests/**/*.test.js"],
  setupFiles: ["<rootDir>/utilities/db.js"],
  verbose: true,
  clearMocks: true,
};
