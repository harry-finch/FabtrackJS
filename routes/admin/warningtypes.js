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
// Route to manage warning types
// ******************************************************************************

router.get(
  "/manage",
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/warningtypes/manage";

    const warningtypes = await prisma.warningtype.findMany({});

    res.render("admin/manage-warningtypes", {
      warningtypes,
    });
  }),
);

// ******************************************************************************
// Route to delete a warning type
// ******************************************************************************

router.get(
  "/delete/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await prisma.warningtype.delete({
      where: { id: Number(id) },
    });

    logger.logThat("Warning type " + result.name + " deleted by " + req.session.username);

    req.session.notification = "Success: Warning type " + result.name + " deleted";
    res.redirect(req.session.lastPage);
  }),
);

// ******************************************************************************
// Route to create a warning type
// ******************************************************************************

router.post(
  "/create",
  asyncHandler(async (req, res) => {
    const { name, icon } = req.body;

    const warningtype = await prisma.warningtype.create({
      data: { name: name, icon: icon },
    });

    logger.logThat("Warning type " + name + " created by " + req.session.username);

    req.session.notification = "Success: Warning type " + name + " created";
    res.redirect("/admin/warningtypes/manage");
  }),
);

// ******************************************************************************
// Route to update a warning type
// ******************************************************************************

router.post(
  "/update",
  asyncHandler(async (req, res) => {
    const { warningtypeid, name, icon } = req.body;

    const warningtype = await prisma.warningtype.update({
      where: { id: Number(warningtypeid) },
      data: { name: name, icon: icon },
    });

    logger.logThat("Warning type " + name + " update by " + req.session.username);

    req.session.notification = "Success: Warning type " + name + " updated";
    res.redirect("/admin/warningtypes/manage");
  }),
);

module.exports = router;
