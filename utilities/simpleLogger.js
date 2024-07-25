const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient({
  log: ["query", "info", "warn", "error"],
});

module.exports = {
  logThat: async function (message) {
    const result = await prisma.log.create({
      data: {
        description: message,
      },
    });

    console.log(message);
  },
};
