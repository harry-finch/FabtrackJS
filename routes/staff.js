// ******************************************************************************
// This router handles the administration of staff accounts
// ******************************************************************************

var express = require("express");
var crypto = require("crypto");
var router = express.Router();

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ******************************************************************************
// Route returning a list of all staff members
// ******************************************************************************

router.get("/", async (req, res) => {
  if (req.session.role != "admin") {
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
// Route handling the enabling of a staff account
// ******************************************************************************

router.get("/edit/:id", async (req, res) => {
  if (req.session.role != "admin") {
    req.session.error = "Unauthorized access!";
    return res.redirect("/");
  }

  const { id } = req.params;
  const user = await prisma.staff.findUnique({
    where: {
      id: Number(id),
    },
  });

  res.render("admin/staff-edit", { error: req.session.error, message: req.session.message, user: user });
});

// ******************************************************************************
// Route handling the enabling of a staff account
// ******************************************************************************

router.put("/enable/:id", async (req, res) => {
  if (req.session.role != "admin") {
    req.session.error = "Unauthorized access!";
    return res.redirect("/");
  }

  const { id } = req.params;
  const result = await prisma.staff.update({
    where: {
      id: Number(id),
    },
    data: {
      approved: true,
    },
  });
  res.status(200).json(result);
});

// ******************************************************************************
// Route handling the disabling of a staff account
// ******************************************************************************

router.put("/disable/:id", async (req, res) => {
  if (req.session.role != "admin") {
    req.session.error = "Unauthorized access!";
    return res.redirect("/");
  }

  const { id } = req.params;
  const result = await prisma.staff.update({
    where: {
      id: Number(id),
    },
    data: {
      approved: false,
    },
  });
  res.status(200).json(result);
});

// ******************************************************************************
// Route making a staff admin
// ******************************************************************************

router.put("/promote/:id", async (req, res) => {
  if (req.session.role != "admin") {
    req.session.error = "Unauthorized access!";
    return res.redirect("/");
  }

  const { id } = req.params;
  const result = await prisma.staff.update({
    where: {
      id: Number(id),
    },
    data: {
      role: "admin",
    },
  });
  res.status(200).json(result);
});

// ******************************************************************************
// Route making a staff a regular user
// ******************************************************************************

router.put("/demote/:id", async (req, res) => {
  if (req.session.role != "admin") {
    req.session.error = "Unauthorized access!";
    return res.redirect("/");
  }

  const { id } = req.params;
  const result = await prisma.staff.update({
    where: {
      id: Number(id),
    },
    data: {
      role: "user",
    },
  });
  res.status(200).json(result);
});

// ******************************************************************************
// Route handling the deletion of a staff (admin only)
// ******************************************************************************

router.delete("/delete/:id", async (req, res) => {
  if (req.session.role != "admin") {
    req.session.error = "Unauthorized access!";
    return res.redirect("/");
  }

  const { id } = req.params;
  const staff = await prisma.staff.delete({
    where: { id: Number(id) },
  });
  res.status(200).json(result);
});

// ******************************************************************************
// Route handling the modification of a staff (admin only)
// ******************************************************************************

router.post("/update", async (req, res) => {
  if (req.session.role != "admin") {
    req.session.error = "Unauthorized access!";
    return res.redirect("/");
  }

  const user = req.body;
  let approval = false;
  console.log(user);

  if (user.approved == "on") {
    approval = true;
  }

  const result = await prisma.staff.update({
    where: { id: Number(user.id) },
    data: {
      name: user.username,
      mail: user.email,
      role: user.role,
      approved: approval,
    },
  });
  res.redirect("/admin/manage-staff");
});

module.exports = router;
