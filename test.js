const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const dotenv = require("dotenv");
dotenv.config();

async function main() {
  const result = await prisma.userproject.create({
    data: {
      id: 1,
      userId: 1,
      projectId: 1,
    },
  });

  console.log(result);
}

async function showHistory() {
  const result = await prisma.history.findMany();
  console.log(result);
}

main();
showHistory();
