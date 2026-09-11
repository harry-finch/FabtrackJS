var express = require("express");
var router = express.Router();

const asyncHandler = require("../../middleware/asyncHandler.js");
const clearNotification = require("../../middleware/clearNotification.js");
const isAdmin = require("../../middleware/checkAdmin.js");
const { invalidateCache } = require("../../middleware/cacheHelper.js");

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

    const allTypes = await prisma.usertype.findMany({
      orderBy: { id: "asc" },
    });

    res.render("admin/manage-usertypes", {
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

    try {
      const result = await prisma.usertype.delete({
        where: { id: Number(id) },
      });

      invalidateCache(req);
      logger.logThat("Usertype " + result.name + " deleted by " + req.session.username);
      req.session.notification = "Success: Usertype " + result.name + " deleted";
    } catch (error) {
      console.error("Error deleting usertype:", error);
      req.session.notification = "Error: Failed to delete usertype (check linked users)";
    }

    res.redirect(req.session.lastPage || "/admin/usertypes/manage");
  }),
);

// ******************************************************************************
// Route to create a usertype
// ******************************************************************************

router.post(
  "/create",
  asyncHandler(async (req, res) => {
    const { name } = req.body;

    try {
      const usertype = await prisma.usertype.create({
        data: { name: name.trim() },
      });

      invalidateCache(req);
      logger.logThat("Usertype " + name + " created by " + req.session.username);
      req.session.notification = "Success: Usertype " + name + " created";
    } catch (error) {
      console.error("Error creating usertype:", error);
      req.session.notification = "Error: Failed to create usertype";
    }

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

    try {
      const usertype = await prisma.usertype.update({
        where: { id: Number(usertypeid) },
        data: { name: name.trim() },
      });

      invalidateCache(req);
      logger.logThat("Usertype " + name + " updated by " + req.session.username);
      req.session.notification = "Success: Usertype " + name + " updated";
    } catch (error) {
      console.error("Error updating usertype:", error);
      req.session.notification = "Error: Failed to update usertype";
    }

    res.redirect("/admin/usertypes/manage");
  }),
);

module.exports = router;
