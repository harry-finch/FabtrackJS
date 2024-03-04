var express = require("express");
var crypto = require("crypto");
var router = express.Router();

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ******************************************************************************
// Route returning a list of all staff members
// ******************************************************************************

router.get("/", async (req, res) => {
  if (!req.session.role === "admin") {
    req.session.error = "Unauthorized access!";
    return res.redirect("/");
  }

  const allStaff = await prisma.staff.findMany({});
  res.status(200).json(allStaff);
});

// ******************************************************************************
// Route handling the creation of a new user
// ******************************************************************************

router.post("/create", async (req, res) => {
  const { username, password, mail } = req.body;

  // Hash password
  var salt = process.env.SALT;
  var hash = crypto.pbkdf2Sync(password, salt, 1000, 64, `sha512`).toString(`base64`);

  const result = await prisma.staff
    .create({
      data: {
        name: username,
        pwd: hash,
        mail: mail,
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

  req.session.message = "Your account needs to be approved by an administrator before you can log in.";
  res.redirect("../login");
});

// ******************************************************************************
// Route handling the deletion of a staff (admin only)
// ******************************************************************************

router.delete("/delete/:id", async (req, res) => {
  if (!req.session.role === "admin") {
    req.session.error = "Unauthorized access!";
    return res.redirect("/");
  }

  const { id } = req.params;
  const staff = await prisma.staff.delete({
    where: { id: Number(id) },
  });
  res.json(staff);
});

module.exports = router;
