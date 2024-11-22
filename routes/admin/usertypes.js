var express = require("express");
var router = express.Router();

const asyncHandler = require("../../middleware/asyncHandler.js");
const clearNotification = require("../../middleware/clearNotification.js");
const isAdmin = require("../../middleware/checkAdmin.js");
router.use(isAdmin);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const logger = require("../../utilities/simpleLogger.js");

// ******************************************************************************
// Route to manage user types (student, teacher...)
// ******************************************************************************

router.get(
  "/manage",
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/usertypes/manage";

    const allTypes = await prisma.usertype.findMany({});
    res.render("admin/manage-usertypes", {
      notification: notification,
      role: req.session.role,
      usertypes: allTypes,
    });
  }),
);

// ******************************************************************************
// Route to delete a usertype
// ******************************************************************************

router.get(
  "/delete/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await prisma.usertype.delete({
      where: { id: Number(id) },
    });

    logger.logThat("Usertype " + result.name + " deleted by " + req.session.username);

    req.session.notification = "Success: Usertype " + result.name + " deleted";
    res.redirect(req.session.lastPage);
  }),
);

// ******************************************************************************
// Route to create a usertype
// ******************************************************************************

router.post(
  "/create",
  asyncHandler(async (req, res) => {
    const { name } = req.body;

    const usertype = await prisma.usertype.create({
      data: { name: name },
    });

    logger.logThat("Usertype " + name + " created by " + req.session.username);

    req.session.notification = "Success: Usertype " + name + " created";
    res.redirect("/admin/usertypes/manage");
  }),
);

// ******************************************************************************
// Route to update a usertype
// ******************************************************************************

router.post(
  "/update",
  asyncHandler(async (req, res) => {
    const { usertypeid, name } = req.body;

    const usertype = await prisma.usertype.update({
      where: { id: Number(usertypeid) },
      data: { name: name },
    });

    logger.logThat("Usertype " + name + " update by " + req.session.username);

    req.session.notification = "Success: Usertype " + name + " updated";
    res.redirect("/admin/usertypes/manage");
  }),
);

module.exports = router;
