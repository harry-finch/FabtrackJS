const express = require("express");
const moment = require("moment");
const dotenv = require("dotenv");

const { PrismaClient } = require("@prisma/client");

const isAdmin = require("../middleware/checkAdmin.js");
const clearNotification = require("../middleware/clearNotification.js");
const asyncHandler = require("../middleware/asyncHandler.js");

dotenv.config();
const prisma = new PrismaClient();
const router = express.Router();

// Admin access check middleware
router.use(isAdmin);

// Helper functions for date formatting
function formatDateTime(date) {
  return moment(date).format("L HH:mm");
}

function formatTime(time) {
  return time ? moment(time).format("HH:mm") : "-";
}

// Route: Admin main page
router.get(
  "/",
  clearNotification,
  asyncHandler(async (req, res) => {
    res.render("admin/main", { workspaces: true });
  }),
);

// Route: View history page
router.get(
  "/view-history",
  clearNotification,
  asyncHandler(async (req, res) => {
    try {
      const history = await prisma.history.findMany({
        orderBy: { arrival: "desc" },
        include: {
          user: true,
          userproject: { include: { project: true } },
          workspace: true,
        },
      });

      history.forEach((entry) => {
        entry.arrival = formatDateTime(entry.arrival);
        entry.departure = formatTime(entry.departure);
      });

      res.render("admin/view-history", { history });
    } catch (error) {
      console.error("Error fetching history data:", error);
      res
        .status(500)
        .render("error", { errorMessage: "Unable to retrieve history data." });
    }
  }),
);

module.exports = router;
