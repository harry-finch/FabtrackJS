module.exports = {
  verbose: true,
  projects: [
    {
      displayName: "unit",
      testEnvironment: "node",
      testTimeout: 15000,
      testMatch: ["<rootDir>/tests/unit/**/*.test.js"],
      setupFiles: ["<rootDir>/tests/jest.unit.setup.js"],
      clearMocks: true,
    },
    {
      displayName: "integration",
      testEnvironment: "node",
      testTimeout: 15000,
      testMatch: ["<rootDir>/tests/integration/**/*.test.js"],
      setupFiles: ["<rootDir>/tests/jest.setup.js", "<rootDir>/utilities/db.js"],
      clearMocks: true,
    },
  ],
};
