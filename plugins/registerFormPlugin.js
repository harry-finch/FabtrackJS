module.exports = {
  name: "Plugin UE",
  version: "1.0.0",
  description: "Adds UE support",
  register(hookManager) {
    hookManager.addHook("registerForm", async () => {
      const { PrismaClient } = require("@prisma/client");
      const prisma = new PrismaClient();

      // const value = await prisma.access.findMany();
      return 1;
    });
  },
};
