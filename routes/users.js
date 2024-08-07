// ******************************************************************************
// This router handles the administration of user accounts
// ******************************************************************************

var express = require("express");
var router = express.Router();

const isLoggedIn = require("../middleware/checkSession.js");
router.use(isLoggedIn);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const logger = require("../utilities/simpleLogger.js");

const randomString = require("randomized-string");

// ******************************************************************************
// Route handling the admin page managing user accounts
//
// >>> Rendering route
// ******************************************************************************

router.get("/manage", async (req, res) => {
  if (req.session.role != "admin") {
    req.session.notification = "Error: Unauthorized access!";
    return res.redirect("/");
  }

  req.session.lastPage = "/users/manage";
  const notification = req.session.notification;
  req.session.notification = "";

  const allUsers = await prisma.user.findMany({
    orderBy: {
      id: "desc",
    },
    relationLoadStrategy: "join",
    include: {
      usertype: true,
    },
  });

  res.render("admin/manage-users", {
    notification: notification,
    role: req.session.role,
    users: allUsers,
  });
});

// ******************************************************************************
// Route handling the creation of a new user
// ******************************************************************************

router.post("/create", async (req, res) => {
  const user = req.body;
  const token = randomString.generate();

  try {
    const result = await prisma.user.create({
      data: {
        name: user.newname,
        surname: user.newsurname,
        mail: user.newemail,
        usertypeId: Number(user.newusertype),
        birthYear: Number(user.newbirthyear),
        comment: user.newcomments,
        token: token,
      },
    });

    logger.logThat(
      "User " +
        result.name +
        " " +
        result.surname +
        " created by " +
        req.session.username,
    );

    req.session.notification =
      "Warning: User needs to agree to the terms and conditions before he can access the lab.";
    res.redirect("/fabtrack");
    await prisma.$disconnect();
  } catch (e) {
    console.log(e);
    if (e.code === "P2002") {
      req.session.notification = "Error: User already exists";
      res.redirect("/");
    } else {
      // Handle other errors (optional)
    }
  }
});

// ******************************************************************************
// Route handling the deletion of a user (admin only)
// ******************************************************************************

router.get("/delete/:id", async (req, res) => {
  if (req.session.role != "admin") {
    req.session.notification = "Error: Unauthorized access!";
    return res.redirect("/");
  }

  const { id } = req.params;
  const user = await prisma.user.delete({
    where: { id: Number(id) },
  });

  logger.logThat(
    "User " +
      user.name +
      " " +
      user.surname +
      " deleted by " +
      req.session.username,
  );
  req.session.notification =
    "Success: User " + user.name + " " + user.surname + " has been deleted";
  res.redirect(req.session.lastPage);
});

// ******************************************************************************
// Route handling the modification page
//
// >>> Rendering route
// ******************************************************************************

router.get("/edit/:id", async (req, res) => {
  const notification = req.session.notification;
  req.session.notification = "";

  const { id } = req.params;

  const user = await prisma.user.findUnique({
    where: {
      id: Number(id),
    },
  });

  const allTypes = await prisma.usertype.findMany({});
  const warnings = await prisma.warning.findMany({
    where: { userId: Number(id), active: true },
    relationLoadStrategy: "join",
    include: {
      warningtype: true,
    },
  });
  const warningtypes = await prisma.warningtype.findMany({});

  res.render("fabtrack/edit-user", {
    notification: notification,
    role: req.session.role,
    user: user,
    usertypes: allTypes,
    warnings: warnings,
    warningtypes: warningtypes,
  });
});

// ******************************************************************************
// Route handling the modification of a user
// ******************************************************************************

router.post("/update/:id", async (req, res) => {
  const user = req.body;
  const { id } = req.params;

  const result = await prisma.user.update({
    where: { id: Number(id) },
    data: {
      name: user.name,
      surname: user.surname,
      mail: user.email,
      usertypeId: Number(user.usertype),
      birthYear: Number(user.birthyear),
      comment: user.comments,
    },
  });

  logger.logThat(
    "User " +
      user.name +
      " " +
      user.surname +
      " updated by " +
      req.session.username,
  );
  req.session.notification = "Success: User profile updated!";
  res.redirect(req.session.lastPage);
});

module.exports = router;
