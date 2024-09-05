// ******************************************************************************
// This router handles the main admin routes
// ******************************************************************************

var express = require("express");
var router = express.Router();

const isAdmin = require("../middleware/checkAdmin.js");
router.use(isAdmin);

const moment = require("moment");

const dotenv = require("dotenv");
dotenv.config();

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ******************************************************************************
// Route handling the main admin page
//
// >>> Rendering route
// ******************************************************************************

router.get("/", async (req, res) => {
  const notification = req.session.notification;
  var workspaces = true;

  req.session.notification = "";

  res.render("admin/main", {
    notification: notification,
    role: req.session.role,
    workspaces: workspaces,
  });
});

// ******************************************************************************
// Route handling the view history page
// ******************************************************************************

router.get("/view-history", async (req, res) => {
  const notification = req.session.notification;
  req.session.notification = "";
  req.session.lastPage = "/admin/view-history";

  try {
    const history = await prisma.history.findMany({
      orderBy: {
        arrival: "desc", // Sort by arrival in descending order (newest first)
      },
      include: {
        user: true, // Include user details
        userproject: {
          include: { project: true }, // Include project details within userproject
        },
        workspace: true, // Include workspace details
      },
    });

    for (const entry of history) {
      entry.arrival = moment(entry.arrival).format("L HH:mm");
      entry.departure = entry.departure
        ? moment(entry.departure).format("HH:mm")
        : "-";
    }

    res.render("admin/view-history", {
      history: history,
      notification: notification,
      role: req.session.role,
    });
  } catch (error) {
    console.error("Error fetching history data:", error);
    // Handle the error appropriately (e.g., render an error page)
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
