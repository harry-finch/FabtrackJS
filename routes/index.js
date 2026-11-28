const express = require("express");
const bcrypt = require("bcryptjs");
const { prisma } = require("../utilities/db");
const dotenv = require("dotenv");

const clearNotification = require("../middleware/clearNotification.js");
const isAuthenticated = require("../middleware/checkSession.js");
const asyncHandler = require("../middleware/asyncHandler.js");
const { validateBody } = require("../middleware/validate.js");
const { createRateLimiter } = require("../middleware/rateLimit.js");
const { ensureCsrfToken } = require("../middleware/csrf.js");
const requireRoles = require("../middleware/requireRoles.js");
const { isApiOrAjaxRequest } = requireRoles;
const { safeHttpUrl } = require("../utilities/xssHelpers.js");
const { getSafeRedirectPath } = require("../utilities/securityHelpers.js");
const {
  loginSchema,
  registerStaffSchema,
  completeStaffProfileSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
} = require("../schemas/auth.schema.js");
const { reportBugSchema } = require("../schemas/bug.schema.js");
const i18nService = require("../services/i18nService.js");
const passwordResetService = require("../services/passwordResetService.js");
const staffContributorService = require("../services/staffContributorService.js");

dotenv.config();

const router = express.Router();
const mailService = require("../services/mailService.js");
const settingsService = require("../services/settingsService.js");
const logger = require("../utilities/simpleLogger.js");

const saltRounds = 12;
// Precomputed valid cost-12 bcrypt hash to prevent username timing oracle on POST /auth
const DUMMY_PASSWORD_HASH = "$2b$12$MlyZRhS/NQ/tDatTw.OBle8YSGD72fM0LxyL5YdDx7itwTNGQ6Rwq";
const AGREEMENT_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  backUrl: "/login",
  message: "Trop de tentatives de connexion. Veuillez patienter avant de réessayer.",
});

const resetRequestLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  backUrl: "/forgot",
  message: "Trop de demandes de réinitialisation. Veuillez patienter avant de réessayer.",
});

const resetPasswordLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  backUrl: "/forgot",
  message: "Trop de tentatives de réinitialisation du mot de passe. Veuillez patienter avant de réessayer.",
});

const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  backUrl: "/register",
  message: "Trop de tentatives de création de compte. Veuillez patienter avant de réessayer.",
});

const reportBugLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  backUrl: "/fabtrack",
  message: "Trop de signalements envoyés. Veuillez patienter avant de réessayer.",
});

router.rateLimiters = {
  authLimiter,
  resetRequestLimiter,
  resetPasswordLimiter,
  registerLimiter,
  reportBugLimiter,
};

async function isSelfRegistrationAllowed() {
  const settings = await settingsService.getSettings();
  return !settings || settings.allow_self_registration !== "false";
}

const requireSelfRegistration = asyncHandler(async (req, res, next) => {
  const allowSelfRegistration = await isSelfRegistrationAllowed();
  if (!allowSelfRegistration) {
    const message = "L'auto-inscription est désactivée par l'administrateur.";
    if (isApiOrAjaxRequest(req)) {
      return res.status(403).json({
        success: false,
        code: "REGISTRATION_DISABLED",
        error: message,
        message,
      });
    }
    if (req.session) {
      req.session.notification = `Error: ${message}`;
    }
    return res.status(403).render("index/login", {
      notification: `Error: ${message}`,
      allowSelfRegistration: false,
    });
  }
  return next();
});

function resolveSafeRedirectPath(req, fallback = "/") {
  return getSafeRedirectPath(req, fallback);
}

async function findUserByAgreementToken(token) {
  if (typeof prisma.user.findFirst === "function") {
    return prisma.user.findFirst({ where: { token } });
  }
  return prisma.user.findUnique({ where: { token } });
}

function isAgreementTokenExpired(user) {
  if (!user || user.termsAccepted) {
    return false;
  }
  const rawDate = user.dateAdded || user.createdAt;
  if (!rawDate) {
    return false;
  }
  const timestamp = new Date(rawDate).getTime();
  if (Number.isNaN(timestamp)) {
    return false;
  }
  return Date.now() - timestamp > AGREEMENT_TOKEN_MAX_AGE_MS;
}

function buildAgreementSuccessViewModel(user, settings, { alreadyAccepted = false } = {}) {
  const safeSettings = settings || {};
  const labName = safeSettings.platform_name || "Fabtrack";
  const defaultTitle = alreadyAccepted
    ? "Charte déjà validée"
    : "Merci d'avoir signé la charte !";
  const title = alreadyAccepted
    ? "Charte déjà validée"
    : safeSettings.mail_user_agreement_success_title || defaultTitle;

  const rawMessage = alreadyAccepted
    ? "Votre acceptation de la charte d'utilisation a déjà été enregistrée. Vous pouvez accéder au laboratoire lors de vos visites."
    : safeSettings.mail_user_agreement_success_message ||
      "Votre acceptation de la charte d'utilisation a bien été enregistrée. Vous pouvez désormais vous enregistrer et accéder au laboratoire lors de vos visites.\n\nVous allez être redirigé vers notre site...";

  const message = rawMessage
    .replace(/\{name\}|\{\{name\}\}/gi, user.name || "")
    .replace(/\{surname\}|\{\{surname\}\}/gi, user.surname || "")
    .replace(/\{fullname\}|\{\{fullname\}\}/gi, `${user.name || ""} ${user.surname || ""}`.trim())
    .replace(/\{lab_name\}|\{\{lab_name\}\}/gi, labName);

  const rawRedirectUrl =
    (safeSettings.mail_user_agreement_redirect_url && safeSettings.mail_user_agreement_redirect_url.trim()) ||
    safeSettings.bookstack_url ||
    "https://wiki.fablab.sorbonne-universite.fr/BookStack/";
  const redirectUrl = safeHttpUrl(rawRedirectUrl);

  const delayNum = parseInt(safeSettings.mail_user_agreement_redirect_delay || "5", 10);
  const redirectDelay = Number.isNaN(delayNum) ? 5 : delayNum;

  return {
    success: true,
    status: alreadyAccepted ? "already_accepted" : "success",
    user,
    title,
    message,
    redirectUrl,
    redirectDelay,
    userName: `${user.name || ""} ${user.surname || ""}`.trim(),
  };
}

// ******************************************************************************
// Root route to check authentication
// ******************************************************************************

router.get("/", (req, res) => {
  if (req.session.loggedin) {
    req.session.role === "admin" ? res.redirect("/admin/") : res.redirect("/fabtrack/");
  } else res.redirect("/login");
});

// ******************************************************************************
// Login and registration routes
// ******************************************************************************

router.get(
  "/login",
  clearNotification,
  asyncHandler(async (req, res) => {
    const allowSelfRegistration = await isSelfRegistrationAllowed();
    return res.render("index/login", { allowSelfRegistration });
  }),
);

router.get(
  "/register",
  clearNotification,
  asyncHandler(async (req, res) => {
    const allowSelfRegistration = await isSelfRegistrationAllowed();
    if (!allowSelfRegistration) {
      req.session.notification = "Error: L'auto-inscription est désactivée par l'administrateur.";
      return res.redirect("/login");
    }
    const usertypes =
      prisma.usertype && typeof prisma.usertype.findMany === "function"
        ? await prisma.usertype.findMany({ orderBy: { name: "asc" } })
        : [];
    return res.render("index/register", { usertypes });
  }),
);

// ******************************************************************************
// Account creation for staff members
// ******************************************************************************

router.post(
  "/create-account",
  registerLimiter,
  requireSelfRegistration,
  validateBody(registerStaffSchema, { redirectUrl: "/register" }),
  asyncHandler(async (req, res) => {
    const { username, firstName, lastName, usertypeId, password, mail, honeypot } = req.body;

    // Check if a bot might have registered
    if (honeypot) {
      return res.status(400).send("Bot detected");
    }

    // Hash the password with bcrypt
    const hash = await bcrypt.hash(password, saltRounds);

    const createData = {
      name: username,
      password: hash,
      email: mail,
    };
    if (typeof firstName === "string" && firstName.trim()) {
      createData.firstName = firstName.trim();
    }
    if (typeof lastName === "string" && lastName.trim()) {
      createData.lastName = lastName.trim();
    }
    if (usertypeId && Number.isInteger(Number(usertypeId)) && Number(usertypeId) > 0) {
      createData.usertypeId = Number(usertypeId);
    }

    try {
      await prisma.staff.create({
        data: createData,
      });

      // Notify user about admin approval requirement
      req.session.notification = "Warning: Your account needs to be approved by an administrator before you can log in.";

      // Send notification email to admin asynchronously
      const hostUrl = `${req.protocol}://${req.get("host")}${res.locals.basePath || ""}`;
      mailService
        .sendStaffRegisteredAlert({ username, email: mail, hostUrl })
        .catch((err) => console.error("[routes/index/create-account] Failed to send staff alert email:", err));

      res.redirect("/login");
    } catch (e) {
      console.error("Error creating account:", e);
      if (e.code === "P2002") {
        req.session.notification = "Error: User already exists";
        res.redirect("/");
      } else {
        req.session.notification = "Error: Unexpected database error. Unable to create account. Please try again.";
        res.redirect("/register");
      }
    }
  }),
);

// ******************************************************************************
// Route to the form requesting a password reset
// ******************************************************************************

router.get("/forgot", clearNotification, function (req, res) {
  res.render("index/forgot");
});

// ******************************************************************************
// Route sending the email with the link to reset the password
// ******************************************************************************

router.post(
  "/reset",
  resetRequestLimiter,
  validateBody(requestPasswordResetSchema, { redirectUrl: "/forgot" }),
  asyncHandler(async (req, res) => {
    const hostUrl =
      process.env.NODE_ENV === "production"
        ? undefined
        : `${req.protocol}://${req.get("host")}${res.locals.basePath || ""}`;

    await passwordResetService.requestReset(req.validatedBody.mail, { hostUrl });

    req.session.notification =
      "Success: Si un compte correspond à cette adresse e-mail, un lien de réinitialisation vient d'être envoyé.";
    res.redirect("/login");
  }),
);

// ******************************************************************************
// Reset form for staff to reset their password
// ******************************************************************************

router.get(
  "/reset/:token",
  clearNotification,
  asyncHandler(async (req, res) => {
    const staff = await passwordResetService.verifyToken(req.params.token);
    if (!staff) {
      req.session.notification =
        "Warning: Ce lien de réinitialisation est invalide ou expiré. Veuillez en demander un nouveau.";
      return res.redirect("/forgot");
    }

    return res.render("index/reset", {
      user: { name: staff.name },
      token: req.params.token.trim(),
    });
  }),
);

// ******************************************************************************
// Route resetting the staff password in the database
// ******************************************************************************

router.post(
  "/reset_password",
  resetPasswordLimiter,
  validateBody(resetPasswordSchema, {
    redirectUrl: (req) =>
      passwordResetService.isValidTokenFormat(req.body?.token)
        ? `/reset/${req.body.token.trim()}`
        : "/forgot",
  }),
  asyncHandler(async (req, res) => {
    const result = await passwordResetService.completeReset(
      req.validatedBody.token,
      req.validatedBody.password,
    );

    if (!result.ok) {
      req.session.notification =
        "Error: Ce lien de réinitialisation est invalide, expiré ou déjà utilisé.";
      return res.redirect("/forgot");
    }

    req.session.notification = "Success: Votre mot de passe a été réinitialisé avec succès.";
    return res.redirect("/login");
  }),
);

// ******************************************************************************
// Authentication route
// ******************************************************************************

router.post(
  "/auth",
  authLimiter,
  validateBody(loginSchema, { redirectUrl: "/login" }),
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const user = await prisma.staff.findUnique({ where: { name: username } });

    const hashToCompare = user && user.password ? user.password : DUMMY_PASSWORD_HASH;
    const passwordMatches = await bcrypt.compare(password, hashToCompare);

    if (user && passwordMatches) {
      if (!user.approved) {
        req.session.notification = "Warning: Your account needs to be approved by an administrator before you can log in.";
        return res.redirect("/login");
      }

      const savedLang = req.session && req.session.lang;
      if (req.session && typeof req.session.regenerate === "function") {
        await new Promise((resolve, reject) => {
          req.session.regenerate((err) => (err ? reject(err) : resolve()));
        });
      }
      if (savedLang) {
        req.session.lang = savedLang;
      }

      req.session.loggedin = true;
      req.session.staffId = user.id;
      req.session.role = user.role;
      req.session.username = user.name;
      if (user.email) {
        req.session.email = user.email;
      }
      if (user.lastWorkspaceId) {
        req.session.lastWorkspaceId = user.lastWorkspaceId;
      }
      ensureCsrfToken(req);

      // R-037: Ensure approved admin/user has a linked contributor profile (or prompt self-completion)
      if (staffContributorService.isEligibleForContributorLink(user) && !user.userId) {
        try {
          const linkOutcome = await staffContributorService.ensureStaffContributorLink({
            prisma,
            staffRecord: user,
            actorUsername: user.name,
            logger,
          });
          if (linkOutcome && linkOutcome.status === "missing_info") {
            return res.redirect("/staff/complete-profile");
          }
          if (linkOutcome && linkOutcome.status === "archived_match") {
            req.session.notification = `Warning: ${linkOutcome.message}`;
          }
        } catch (linkErr) {
          console.error("[routes/index/auth] Non-blocking contributor link error:", linkErr);
        }
      }

      return res.redirect("/");
    } else {
      req.session.notification = "Error: Incorrect username or password.";
      return res.redirect("/login");
    }
  }),
);

// ******************************************************************************
// Self-completion of contributor profile for approved admin/user staff (R-037)
// ******************************************************************************

router.get(
  "/staff/complete-profile",
  isAuthenticated,
  requireRoles("admin", "user"),
  clearNotification,
  asyncHandler(async (req, res) => {
    const staff = req.session.staffId
      ? await prisma.staff.findUnique({ where: { id: Number(req.session.staffId) } })
      : null;

    if (!staff) {
      return res.redirect("/");
    }
    if (staff.userId) {
      return res.redirect("/");
    }

    const usertypes =
      prisma.usertype && typeof prisma.usertype.findMany === "function"
        ? await prisma.usertype.findMany({ orderBy: { name: "asc" } })
        : [];

    return res.render("index/complete-staff-profile", {
      staff,
      usertypes,
    });
  }),
);

router.post(
  "/staff/complete-profile",
  isAuthenticated,
  requireRoles("admin", "user"),
  validateBody(completeStaffProfileSchema, { redirectUrl: "/staff/complete-profile" }),
  asyncHandler(async (req, res) => {
    const { firstName, lastName, usertypeId } = req.validatedBody || req.body;
    const outcome = await staffContributorService.completeSelfProfileAndLink({
      prisma,
      staffId: req.session.staffId,
      firstName,
      lastName,
      usertypeId,
      logger,
    });

    if (outcome.status === "archived_match") {
      req.session.notification = `Warning: ${outcome.message}`;
      return res.redirect("/");
    }
    if (!outcome.linked) {
      req.session.notification = `Error: ${outcome.message || "Impossible de créer la fiche contributeur."}`;
      return res.redirect("/staff/complete-profile");
    }

    req.session.notification = `Success: ${outcome.message || "Votre fiche contributeur a bien été associée."}`;
    return res.redirect("/");
  }),
);

// ******************************************************************************
// Logout route (POST only to protect against logout CSRF)
// ******************************************************************************

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    if (req.session && req.session.username && req.session.selectedWorkspace) {
      try {
        await prisma.staff.update({
          where: { name: req.session.username },
          data: { lastWorkspaceId: req.session.selectedWorkspace.id },
        });
      } catch (e) {
        console.error("Could not save last workspace on logout:", e);
      }
    }
    if (req.session && req.session.selectedWorkspace) {
      res.cookie("fabtrack_last_workspace_id", req.session.selectedWorkspace.id, {
        maxAge: 365 * 24 * 60 * 60 * 1000,
        sameSite: "lax",
      });
    }
    const clearCookieOptions = {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" && process.env.ENABLE_HTTPS === "true",
    };
    if (req.session && typeof req.session.destroy === "function") {
      await new Promise((resolve, reject) => {
        req.session.destroy((err) => (err ? reject(err) : resolve()));
      });
    }
    if (typeof res.clearCookie === "function") {
      res.clearCookie("fabtrack.sid", clearCookieOptions);
    }
    return res.redirect("/login");
  }),
);

// ******************************************************************************
// Routes for users to confirm and validate the agreement to the terms
// GET is strictly read-only (protects against mail-scanner prefetching)
// POST commits termsAccepted=true with CSRF protection
// ******************************************************************************

router.get(
  "/agreement/:token",
  asyncHandler(async (req, res) => {
    const { token } = req.params;

    try {
      const user = await findUserByAgreementToken(token);

      if (!user) {
        return res.status(404).render("index/agreement-success", {
          success: false,
          status: "invalid",
          title: "Lien invalide ou expiré",
          message:
            "Ce lien de validation de la charte est introuvable ou n'est plus actif. Si vous avez besoin d'un nouveau lien, veuillez vous adresser aux facilitateurs du Fablab.",
          redirectUrl: null,
          redirectDelay: 0,
          userName: null,
        });
      }

      const settings = await settingsService.getSettings();

      if (user.termsAccepted) {
        return res.render(
          "index/agreement-success",
          buildAgreementSuccessViewModel(user, settings, { alreadyAccepted: true }),
        );
      }

      if (isAgreementTokenExpired(user)) {
        return res.status(410).render("index/agreement-success", {
          success: false,
          status: "expired",
          title: "Lien expiré",
          message:
            "Ce lien de validation de la charte a expiré (validité 30 jours). Veuillez demander un nouveau lien aux facilitateurs du Fablab.",
          redirectUrl: null,
          redirectDelay: 0,
          userName: `${user.name || ""} ${user.surname || ""}`.trim() || null,
        });
      }

      return res.render("index/agreement-confirm", {
        user,
        token,
        settings,
        userName: `${user.name || ""} ${user.surname || ""}`.trim(),
      });
    } catch (e) {
      console.error("Error loading agreement confirmation:", e);
      return res.status(500).render("index/agreement-success", {
        success: false,
        status: "invalid",
        title: "Erreur lors de la validation",
        message:
          "Une erreur est survenue lors du chargement de la page de validation. Veuillez réessayer ou contacter un membre de l'équipe du Fablab.",
        redirectUrl: null,
        redirectDelay: 0,
        userName: null,
      });
    }
  }),
);

router.post(
  "/agreement/:token",
  asyncHandler(async (req, res) => {
    const { token } = req.params;

    try {
      const user = await findUserByAgreementToken(token);

      if (!user) {
        return res.status(404).render("index/agreement-success", {
          success: false,
          status: "invalid",
          title: "Lien invalide ou expiré",
          message:
            "Ce lien de validation de la charte est introuvable ou n'est plus actif. Si vous avez besoin d'un nouveau lien, veuillez vous adresser aux facilitateurs du Fablab.",
          redirectUrl: null,
          redirectDelay: 0,
          userName: null,
        });
      }

      const settings = await settingsService.getSettings();

      if (user.termsAccepted) {
        return res.render(
          "index/agreement-success",
          buildAgreementSuccessViewModel(user, settings, { alreadyAccepted: true }),
        );
      }

      if (isAgreementTokenExpired(user)) {
        return res.status(410).render("index/agreement-success", {
          success: false,
          status: "expired",
          title: "Lien expiré",
          message:
            "Ce lien de validation de la charte a expiré (validité 30 jours). Veuillez demander un nouveau lien aux facilitateurs du Fablab.",
          redirectUrl: null,
          redirectDelay: 0,
          userName: `${user.name || ""} ${user.surname || ""}`.trim() || null,
        });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { termsAccepted: true },
      });
      logger.logThat(`Charte d'utilisation signée par ${user.name} ${user.surname} (id: ${user.id})`);

      return res.render(
        "index/agreement-success",
        buildAgreementSuccessViewModel(user, settings, { alreadyAccepted: false }),
      );
    } catch (e) {
      console.error("Error updating agreement:", e);
      return res.status(500).render("index/agreement-success", {
        success: false,
        status: "invalid",
        title: "Erreur lors de la validation",
        message:
          "Une erreur est survenue lors de l'enregistrement de votre acceptation. Veuillez réessayer ou contacter un membre de l'équipe du Fablab.",
        redirectUrl: null,
        redirectDelay: 0,
        userName: null,
      });
    }
  }),
);

// ******************************************************************************
// Route to switch language
// ******************************************************************************

router.get("/change-language/:lang", (req, res) => {
  const { lang } = req.params;
  const validLocales = i18nService.getAvailableLocales();
  if (validLocales.includes(lang.toLowerCase())) {
    const target = lang.toLowerCase();
    if (req.session) {
      req.session.lang = target;
    }
    res.cookie("fabtrack_lang", target, {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
    });
    if (req.setLocale) {
      req.setLocale(target);
    }
  }
  const safeRedirect = resolveSafeRedirectPath(req, "/");
  res.redirect(safeRedirect);
});

// ******************************************************************************
// Route to report a bug or suggest a platform fix
// ******************************************************************************

router.post(
  "/report-bug",
  isAuthenticated,
  reportBugLimiter,
  validateBody(reportBugSchema, {
    redirectUrl: (req) => resolveSafeRedirectPath(req, "/fabtrack"),
  }),
  asyncHandler(async (req, res) => {
    const payload = req.validatedBody || req.body;
    const { title, category, description, pageUrl, severity, reporterName, reporterEmail } = payload;
    const finalReporterName = reporterName || (req.session && req.session.username) || null;
    const hostUrl =
      process.env.NODE_ENV === "production"
        ? undefined
        : `${req.protocol}://${req.get("host")}${res.locals.basePath || ""}`;

    try {
      await mailService.sendBugReportAlert({
        title,
        category,
        description,
        pageUrl,
        severity,
        reporterName: finalReporterName,
        reporterEmail,
        hostUrl,
      });
      req.session.notification = "Success: Merci ! Votre signalement a bien été transmis à l'administrateur.";
    } catch (err) {
      console.error("[POST /report-bug] Erreur lors de l'envoi du signalement:", err);
      req.session.notification = "Error: Impossible d'envoyer le signalement par e-mail.";
    }

    res.redirect(resolveSafeRedirectPath(req, "/fabtrack"));
  }),
);

module.exports = router;
