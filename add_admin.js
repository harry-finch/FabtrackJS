var crypto = require("crypto");

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const dotenv = require("dotenv");
dotenv.config();

async function main() {
  var username = "root";
  var password = "root";
  var mail = "muller.stephane@gmail.com";

  // Hash password
  var salt = process.env.SALT;
  var hash = crypto
    .pbkdf2Sync(password, salt, 1000, 64, `sha512`)
    .toString(`base64`);

  const result = await prisma.staff
    .create({
      data: {
        name: username,
        pwd: hash,
        mail: mail,
        role: "admin",
        approved: true,
      },
    })
    .catch(async (e) => {
      console.log(e);

      if (e.code === "P2002") {
        req.session.error = "User already exists";
        res.redirect("../register");
      }
      await prisma.$disconnect();
    });

  console.log(result);
}

async function updateUser() {
  const result = await prisma.staff.update({
    where: { id: 1 },
    data: { role: "admin" },
  });

  console.log(result);
}

async function showUsers() {
  const result = await prisma.staff.findMany();
  console.log(result);
}

main();
showUsers();
// updateUser();
