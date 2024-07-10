// ******************************************************************************
// This router handles the main admin routes
// ******************************************************************************

var express = require("express");
var router = express.Router();

const isAdmin = require("../middleware/checkAdmin.js");
router.use(isAdmin);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ******************************************************************************
// Route handling the admin page managing user types (student, teacher...)
//
// >>> Rendering route
// ******************************************************************************

router.get("/manage", async (req, res) => {
  const notification = req.session.notification;
  req.session.notification = "";

  const allTypes = await prisma.usertype.findMany({});
  res.render("admin/admin-usertypes", {
    notification: notification,
    usertypes: allTypes,
  });
});

// ******************************************************************************
// Route handling the deletion of a usertype
// ******************************************************************************

router.delete("/usertype/delete/:id", async (req, res) => {
  const { id } = req.params;
  const result = await prisma.usertype.delete({
    where: { id: Number(id) },
  });
  res.status(200).json(result);
});

// ******************************************************************************
// Route handling the creation of a usertype
// ******************************************************************************

router.post("/usertype/create", async (req, res) => {
  const { name } = req.body;
  const usertype = await prisma.usertype.create({
    data: { name: name },
  });
  res.redirect("/admin/usertypes/manage");
});

module.exports = router;
