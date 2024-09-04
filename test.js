const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const dotenv = require("dotenv");
dotenv.config();

async function main() {
  await prisma.user.updateMany({
    where: {
      // Optional filtering conditions, leave empty to delete all records
    },
    data: { balance: 0.0 },
  });

  // console.log(result);
}

async function showHistory() {
  const result = await prisma.history.findMany();
  console.log(result);
}

main();
// showHistory();
