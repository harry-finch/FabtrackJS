const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const isAdmin = require("../../middleware/checkAdmin.js");
const clearNotification = require("../../middleware/clearNotification.js");
const asyncHandler = require("../../middleware/asyncHandler.js");
const dateService = require("../../services/dateService.js");

router.use(isAdmin);

function formatDateTime(date) {
  return dateService.formatDate(date);
}

// ******************************************************************************
// Route to communication and mailing list generator (Admin Only)
// ******************************************************************************

router.get(
  "/",
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/communication";

    const selectedWorkshopId = req.query.workshopId ? Number(req.query.workshopId) : null;
    const initialTarget = req.query.target || (selectedWorkshopId ? `workshop-${selectedWorkshopId}` : "newsletter");

    // Fetch newsletter subscribers
    const newsletterUsers = await prisma.user.findMany({
      where: { newsletter: true, deletedAt: null },
      include: { usertype: true },
      orderBy: [{ surname: "asc" }, { name: "asc" }],
    });

    // Fetch workshops with their interested users
    const workshops = await prisma.workshop.findMany({
      include: {
        access: true,
        interests: {
          include: {
            user: {
              include: { usertype: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { name: "asc" },
    });

    // Format dates for display
    newsletterUsers.forEach((u) => {
      u.formattedCreatedAt = formatDateTime(u.createdAt);
    });

    workshops.forEach((ws) => {
      ws.interests.forEach((item) => {
        item.formattedDate = formatDateTime(item.createdAt);
      });
    });

    res.render("admin/manage-communication", {
      newsletterUsers,
      workshops,
      initialTarget,
      selectedWorkshopId,
    });
  }),
);

module.exports = router;
