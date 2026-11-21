const express = require("express");
const router = express.Router();
const asyncHandler = require("../middleware/asyncHandler");
const { validateBody } = require("../middleware/validate");
const { setupSchema } = require("../schemas/setup.schema");
const setupService = require("../services/setupService");
const { invalidateCache } = require("../middleware/cacheHelper");

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
          code: "ALREADY_INSTALLED",
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
    const payload = req.validatedBody || req.body;
    let result;

    try {
      result = await setupService.runSetup(payload);
    } catch (err) {
      if (err && err.code === "ALREADY_INSTALLED") {
        if (req.isApiRequest || req.xhr || req.headers.accept?.includes("application/json")) {
          return res.status(403).json({
            success: false,
            code: "ALREADY_INSTALLED",
            message: "La plateforme est déjà installée.",
          });
        }
        req.session.notification = "Error: La plateforme est déjà initialisée.";
        return res.redirect("/login");
      }
      throw err;
    }

    // Regenerate session before populating authenticated admin state
    if (req.session && typeof req.session.regenerate === "function") {
      await new Promise((resolve, reject) =>
        req.session.regenerate((err) => (err ? reject(err) : resolve()))
      );
    }

    // Auto-login newly created administrator
    req.session.loggedin = true;
    req.session.role = "admin";
    req.session.username = result.admin.name;
    req.session.staffId = result.admin.id;
    req.session.email = result.admin.email;
    if (result.workspaces && result.workspaces.length > 0) {
      req.session.lastWorkspaceId = result.workspaces[0].id;
    }
    invalidateCache(req);

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
