// ******************************************************************************
// This router handles the administration of staff accounts
// ******************************************************************************

var express = require("express");
var router = express.Router();

const isAdmin = require("../middleware/checkAdmin.js");
router.use(isAdmin);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ******************************************************************************
// Route returning a list of all staff members
// ******************************************************************************

router.get("/", async (req, res) => {
  const allStaff = await prisma.staff.findMany({});
  res.status(200).json(allStaff);
});

// ******************************************************************************
// Route handling the admin page managing staff accounts
//
// >>> Rendering route
// ******************************************************************************

router.get("/manage", async (req, res) => {
  const notification = req.session.notification;
  req.session.notification = "";

  const allStaff = await prisma.staff.findMany({
    orderBy: {
      id: "desc",
    },
  });
  res.render("admin/manage-staff", {
    notification: notification,
    users: allStaff,
  });
});

// ******************************************************************************
// Route handling the enabling of a staff account
//
// >>> Rendering route
// ******************************************************************************

router.get("/edit/:id", async (req, res) => {
  const notification = req.session.notification;
  req.session.notification = "";

  const { id } = req.params;
  const user = await prisma.staff.findUnique({
    where: {
      id: Number(id),
    },
  });

  res.render("admin/edit-staff", {
    notification: notification,
    user: user,
  });
});

// ******************************************************************************
// Route handling the enabling of a staff account
// ******************************************************************************

router.put("/enable/:id", async (req, res) => {
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
