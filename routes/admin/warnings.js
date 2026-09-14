const express = require("express");
const router = express.Router();

const asyncHandler = require("../../middleware/asyncHandler.js");
const clearNotification = require("../../middleware/clearNotification.js");
const isAdmin = require("../../middleware/checkAdmin.js");

router.use(isAdmin);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const logger = require("../../utilities/simpleLogger.js");
const mailService = require("../../services/mailService.js");

// ******************************************************************************
// Route to manage warnings (list and filter)
// ******************************************************************************

router.get(
  ["/", "/manage"],
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/warnings";

    const warnings = await prisma.warning.findMany({
      include: {
        user: true,
        warningtype: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const warningtypes = await prisma.warningtype.findMany({
      orderBy: { name: "asc" },
    });

    const users = await prisma.user.findMany({
      orderBy: [{ surname: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        surname: true,
        email: true,
      },
    });

    res.render("admin/manage-warnings", {
      notification: req.session.notification,
      role: req.session.role,
      warnings,
      warningtypes,
      users,
    });
  }),
);

// ******************************************************************************
// Route to deactivate / resolve a warning
// ******************************************************************************

router.get(
  "/deactivate/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await prisma.warning.update({
      where: { id: Number(id) },
      data: { active: false },
    });

    logger.logThat("Warning #" + result.id + " deactivated by " + req.session.username);

    req.session.notification = "Success: Avertissement résolu et désactivé.";
    res.redirect(req.session.lastPage || "/admin/warnings");
  }),
);

// ******************************************************************************
// Route to reactivate a warning
// ******************************************************************************

router.get(
  "/activate/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await prisma.warning.update({
      where: { id: Number(id) },
      data: { active: true },
    });

    logger.logThat("Warning #" + result.id + " reactivated by " + req.session.username);

    req.session.notification = "Success: Avertissement réactivé.";
    res.redirect(req.session.lastPage || "/admin/warnings");
  }),
);

// ******************************************************************************
// Route to delete a warning
// ******************************************************************************

router.get(
  "/delete/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await prisma.warning.delete({
      where: { id: Number(id) },
    });

    logger.logThat("Warning #" + result.id + " deleted by " + req.session.username);

    req.session.notification = "Success: Avertissement supprimé définitivement.";
    res.redirect(req.session.lastPage || "/admin/warnings");
  }),
);

// ******************************************************************************
// Route to create a warning
// ******************************************************************************

router.post(
  "/create",
  asyncHandler(async (req, res) => {
    const { userid, warningtype, comments } = req.body;

    if (!userid || !warningtype) {
      req.session.notification = "Error: Usager et motif d'avertissement obligatoires.";
      return res.redirect(req.session.lastPage || "/admin/warnings");
    }

    const warning = await prisma.warning.create({
      data: {
        comments: comments ? comments.trim() : null,
        user: { connect: { id: Number(userid) } },
        warningtype: { connect: { id: Number(warningtype) } },
      },
      include: {
        user: true,
        warningtype: true,
      },
    });

    logger.logThat("Warning #" + warning.id + " created by " + req.session.username);

    // Send automated email alert
    try {
      mailService
        .sendWarningAlert({
          user: warning.user,
          warningType: warning.warningtype?.name,
          comment: warning.comments,
        })
        .catch((e) => console.error("Mail warning alert error:", e));
    } catch (e) {
      console.error(e);
    }

    req.session.notification = "Success: Avertissement émis avec succès.";
    res.redirect(req.session.lastPage || "/admin/warnings");
  }),
);

module.exports = router;
