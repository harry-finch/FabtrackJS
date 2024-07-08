const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const dotenv = require("dotenv");
dotenv.config();

async function main() {
  const result = await prisma.users.create({
    data: {
      name: "Phivos",
      surname: "Pham",
      mail: "phivos.pham@gmail.com",
      usertypeId: 1,
      birthYear: 2002,
      comment: "Emploi étudiant",
      termsAndConditions: true,
      token: "0",
    },
  });

  console.log(result);
}

async function showUsers() {
  const result = await prisma.users.findMany();
  console.log(result);
}

async function showUserTypes() {
  const result = await prisma.usertype.findMany();
  console.log(result);
}

main();
showUsers();
showUserTypes();
