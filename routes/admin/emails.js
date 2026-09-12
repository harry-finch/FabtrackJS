const express = require("express");
const isAdmin = require("../../middleware/checkAdmin.js");
const clearNotification = require("../../middleware/clearNotification.js");
const asyncHandler = require("../../middleware/asyncHandler.js");
const settingsService = require("../../services/settingsService.js");
const mailService = require("../../services/mailService.js");

const router = express.Router();
router.use(isAdmin);

// ******************************************************************************
// GET /admin/emails: Email configuration dashboard
// ******************************************************************************
router.get(
  "/",
  clearNotification,
  asyncHandler(async (req, res) => {
    const settings = await settingsService.getSettings();

    // Mask password for display
    const hasSmtpPass = Boolean(settings.smtp_pass && settings.smtp_pass.trim());

    res.render("admin/manage-emails", {
      settings,
      hasSmtpPass,
      adminEmail: settings.mail_admin_recipient || settings.admin_email || process.env.ADMIN || "",
    });
  }),
);

// ******************************************************************************
// POST /admin/emails/settings: Save email & notification preferences
// ******************************************************************************
router.post(
  "/settings",
  asyncHandler(async (req, res) => {
    const current = await settingsService.getSettings();
    const updates = {};

    // General & Recipient
    if (req.body.mail_admin_recipient !== undefined) {
      updates.mail_admin_recipient = req.body.mail_admin_recipient.trim() || current.admin_email || "admin@example.com";
    }
    if (req.body.mail_from !== undefined) {
      updates.mail_from = req.body.mail_from.trim() || "Fabtrack <noreply@fabtrack.local>";
    }

    // SMTP Server
    if (req.body.smtp_host !== undefined) {
      updates.smtp_host = req.body.smtp_host.trim();
    }
    if (req.body.smtp_port !== undefined) {
      const portNum = parseInt(req.body.smtp_port, 10);
      updates.smtp_port = !isNaN(portNum) && portNum > 0 ? String(portNum) : "587";
    }
    if (req.body.smtp_user !== undefined) {
      updates.smtp_user = req.body.smtp_user.trim();
    }
    // Only update password if a new one was provided
    if (req.body.smtp_pass !== undefined && req.body.smtp_pass.trim() !== "") {
      updates.smtp_pass = req.body.smtp_pass.trim();
    }

    updates.smtp_secure = req.body.smtp_secure === "true" || req.body.smtp_secure === "on" ? "true" : "false";

    // Notification Toggles (checkboxes send "on" when checked, undefined when unchecked)
    updates.mail_notif_consumable_low_stock =
      req.body.mail_notif_consumable_low_stock === "true" || req.body.mail_notif_consumable_low_stock === "on" ? "true" : "false";

    updates.mail_notif_user_warning =
      req.body.mail_notif_user_warning === "true" || req.body.mail_notif_user_warning === "on" ? "true" : "false";

    updates.mail_notif_staff_registration =
      req.body.mail_notif_staff_registration === "true" || req.body.mail_notif_staff_registration === "on" ? "true" : "false";

    updates.mail_notif_user_agreement =
      req.body.mail_notif_user_agreement === "true" || req.body.mail_notif_user_agreement === "on" ? "true" : "false";

    await settingsService.updateSettings(updates);

    req.session.notification = "Success: Configuration des e-mails et notifications enregistrée.";
    res.redirect("/admin/emails");
  }),
);

// ******************************************************************************
// POST /admin/emails/test: Send a live test email to verify SMTP
// ******************************************************************************
router.post(
  "/test",
  asyncHandler(async (req, res) => {
    const { test_recipient } = req.body;
    const target = test_recipient && test_recipient.trim() ? test_recipient.trim() : null;

    if (!target) {
      req.session.notification = "Error: Veuillez indiquer une adresse e-mail valide pour le test.";
      return res.redirect("/admin/emails");
    }

    const result = await mailService.sendTestEmail(target);

    if (result.success) {
      req.session.notification = `Success: E-mail de test envoyé avec succès à ${target} ! Vérifiez votre boîte de réception.`;
    } else {
      req.session.notification = `Error: Échec de l'envoi du test SMTP (${result.error || "Erreur inconnue"}).`;
    }

    res.redirect("/admin/emails");
  }),
);

module.exports = router;
