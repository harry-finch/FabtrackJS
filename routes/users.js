// ******************************************************************************
// This router handles the administration of user accounts
// ******************************************************************************

var express = require("express");
var router = express.Router();

const isLoggedIn = require("../middleware/checkSession.js");
router.use(isLoggedIn);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ******************************************************************************
// Route returning a list of all users
// ******************************************************************************

router.get("/", async (req, res) => {
  if (req.session.role != "admin") {
    req.session.error = "Unauthorized access!";
    return res.redirect("/");
  }

  const allUsers = await prisma.users.findMany({});
  res.status(200).json(allUsers);
});

// ******************************************************************************
// Route handling the creation of a new user
// ******************************************************************************

router.post("/create", async (req, res) => {
  const user = req.body;

  const result = await prisma.users
    .create({
      data: {
        name: user.name,
        surname: user.surname,
        mail: user.mail,
        usertypeId: user.usertypeId,
        birthYear: user.birthYear,
        comment: user.comment,
      },
    })
    .catch(async (e) => {
      console.log(e);

      if (e.code === "P2002") {
        req.session.notification = "Error: User already exists";
        res.redirect("../");
      }
      await prisma.$disconnect();
    });

  req.session.notification =
    "Message: User needs to agree to the terms and conditions before he's able to use the lab.";
  res.redirect("../");
});

// ******************************************************************************
// Route handling the deletion of a user (admin only)
// ******************************************************************************

router.delete("/delete/:id", async (req, res) => {
  if (req.session.role != "admin") {
    req.session.error = "Unauthorized access!";
    return res.redirect("/");
  }

  const { id } = req.params;
  const user = await prisma.users.delete({
    where: { id: Number(id) },
  });
  res.status(200).json(user);
});

// ******************************************************************************
// Route handling the modification of a user
// ******************************************************************************

router.post("/update", async (req, res) => {
  const user = req.body;
  var prevPage = req.originalUrl;
  console.log(user);

  const result = await prisma.users.update({
    where: { id: Number(user.id) },
    data: {
      name: user.username,
      mail: user.email,
      role: user.role,
      approved: approval,
    },
  });
  req.session.notification = "Success: User profile updated!";
  res.redirect(`${prevPage}`);
});

// ******************************************************************************
// Route handling the user signing the agreement
// ******************************************************************************

router.put("/agreement/:token", async (req, res) => {
  const { token } = req.params;

  const result = await prisma.users.update({
    where: { token: token },
    data: {
      termsAndConditions: true,
    },
  });
  req.session.notification =
    "Thank you for agreeing to our terms and conditions";
  res.redirect("../");
});

module.exports = router;
