const express = require("express");
const isLoggedIn = require("../middleware/checkSession.js");
const realtimeService = require("../services/realtimeService.js");

const router = express.Router();

// Authenticated Server-Sent Events stream (R-032)
router.get("/stream", isLoggedIn, (req, res) => {
  const role = req.session ? req.session.role : null;
  const rawChannels = typeof req.query.channels === "string" ? req.query.channels.split(",") : ["kiosk", "admin"];

  // Non-admin kiosk stations can only subscribe to kiosk invalidation channel
  const permittedChannels = rawChannels
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c === "kiosk" || (c === "admin" && (role === "admin" || role === "user")));

  const workspaceId =
    req.session && req.session.selectedWorkspace && req.session.selectedWorkspace.id
      ? Number(req.session.selectedWorkspace.id)
      : null;

  realtimeService.subscribe(req, res, {
    workspaceId,
    channels: permittedChannels.length > 0 ? permittedChannels : ["kiosk"],
  });
});

module.exports = router;
