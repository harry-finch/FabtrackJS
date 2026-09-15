const express = require("express");
const router = express.Router();
const asyncHandler = require("../middleware/asyncHandler");
const { validateBody } = require("../middleware/validate");
const { setupSchema } = require("../schemas/setup.schema");
const setupService = require("../services/setupService");

/**
 * GET /setup - Installation wizard form
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const isInstalled = await setupService.checkIsInstalled();
    if (isInstalled) {
      req.session.notification = "Info: La plateforme est déjà installée.";
      return res.redirect("/login");
    }

    res.render("setup/index", {
      title: "Installation de FabtrackJS",
      notification: req.session.notification || null,
      error: req.session.error || null,
    });
  })
);

/**
 * POST /setup - Process installation form
 */
router.post(
  "/",
  asyncHandler(async (req, res, next) => {
    const isInstalled = await setupService.checkIsInstalled();
    if (isInstalled) {
      if (req.isApiRequest || req.xhr || req.headers.accept?.includes("application/json")) {
        return res.status(403).json({
          success: false,
          message: "La plateforme est déjà installée.",
        });
      }
      req.session.notification = "Error: La plateforme est déjà initialisée.";
      return res.redirect("/login");
    }
    next();
  }),
  validateBody(setupSchema, {
    redirectUrl: "/setup",
    defaultMessage: "Erreur dans le formulaire d'installation.",
  }),
  asyncHandler(async (req, res) => {
    const result = await setupService.runSetup(req.body);

    // Auto-login newly created administrator
    req.session.loggedin = true;
    req.session.role = "admin";
    req.session.name = result.admin.name;
    req.session.email = result.admin.email;
    req.session.userid = result.admin.id;
    req.session.invalidateCache = true;

    if (req.isApiRequest || req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({
        success: true,
        message: "Installation réussie !",
        admin: {
          id: result.admin.id,
          name: result.admin.name,
          email: result.admin.email,
        },
      });
    }

    req.session.notification =
      "Success: Félicitations ! Votre plateforme est configurée et prête à l'emploi.";
    res.redirect("/fabtrack");
  })
);

module.exports = router;
