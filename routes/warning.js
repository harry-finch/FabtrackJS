const express = require("express");
const router = express.Router();

const asyncHandler = require("../middleware/asyncHandler.js");
const isLoggedIn = require("../middleware/checkSession.js");
const logger = require("../utilities/simpleLogger.js");

router.use(isLoggedIn);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ******************************************************************************
// Route to deactivate a warning
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

    req.session.notification = "Success: Warning deactivated";
    res.redirect(req.session.lastPage || "/fabtrack");
  }),
);

// ******************************************************************************
// Route to create a warning
// ******************************************************************************

router.post(
  "/create",
  asyncHandler(async (req, res) => {
    const { userid, warningtype, comments } = req.body;

    const warning = await prisma.warning.create({
      data: {
        comments: comments || null,
        user: { connect: { id: Number(userid) } },
        warningtype: { connect: { id: Number(warningtype) } },
      },
    });

    logger.logThat("Warning #" + warning.id + " created by " + req.session.username);

    req.session.notification = "Success: Warning created";
    res.redirect(req.session.lastPage || "/fabtrack");
  }),
);

module.exports = router;
