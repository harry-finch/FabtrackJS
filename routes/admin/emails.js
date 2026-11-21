const express = require("express");
const isAdmin = require("../../middleware/checkAdmin.js");
const clearNotification = require("../../middleware/clearNotification.js");
const asyncHandler = require("../../middleware/asyncHandler.js");
const { validateBody } = require("../../middleware/validate.js");
const { emailSettingsSchema, emailTestSchema } = require("../../schemas/admin.schema.js");
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
  validateBody(emailSettingsSchema, { redirectUrl: "/admin/emails" }),
  asyncHandler(async (req, res) => {
    const current = await settingsService.getSettings();
    const updates = {};

    const trimString = (val) => (typeof val === "string" ? val.trim() : "");
    const normalizeMultiline = (val) =>
      typeof val === "string" ? val.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim() : "";
    const isChecked = (val) => val === true || val === "true" || val === "on";

    // General & Recipient
    if (req.body.mail_admin_recipient !== undefined) {
      updates.mail_admin_recipient =
        trimString(req.body.mail_admin_recipient) || current.admin_email || "admin@example.com";
    }
    if (req.body.mail_from !== undefined) {
      updates.mail_from = trimString(req.body.mail_from) || "Fabtrack <noreply@fabtrack.local>";
    }

    // SMTP Server
    if (req.body.smtp_host !== undefined) {
      updates.smtp_host = trimString(req.body.smtp_host);
    }
    if (req.body.smtp_port !== undefined) {
      const portNum =
        typeof req.body.smtp_port === "number" ? req.body.smtp_port : parseInt(req.body.smtp_port, 10);
      updates.smtp_port = !isNaN(portNum) && portNum > 0 ? String(portNum) : "587";
    }
    if (req.body.smtp_user !== undefined) {
      updates.smtp_user = trimString(req.body.smtp_user);
    }
    // Only update password if a new one was provided
    if (typeof req.body.smtp_pass === "string" && req.body.smtp_pass.trim() !== "") {
      updates.smtp_pass = req.body.smtp_pass.trim();
    }

    updates.smtp_secure = isChecked(req.body.smtp_secure) ? "true" : "false";

    // Notification Toggles (checkboxes send "on" when checked, undefined when unchecked)
    updates.mail_notif_consumable_low_stock = isChecked(req.body.mail_notif_consumable_low_stock) ? "true" : "false";

    updates.mail_notif_user_warning = isChecked(req.body.mail_notif_user_warning) ? "true" : "false";

    updates.mail_notif_staff_registration = isChecked(req.body.mail_notif_staff_registration) ? "true" : "false";

    updates.mail_notif_staff_approved = isChecked(req.body.mail_notif_staff_approved) ? "true" : "false";

    updates.mail_notif_user_agreement = isChecked(req.body.mail_notif_user_agreement) ? "true" : "false";

    updates.mail_notif_machine_issue = isChecked(req.body.mail_notif_machine_issue) ? "true" : "false";

    updates.mail_notif_bug_report = isChecked(req.body.mail_notif_bug_report) ? "true" : "false";

    // User Agreement Email Template Customization
    if (req.body.mail_user_agreement_subject !== undefined) {
      updates.mail_user_agreement_subject = trimString(req.body.mail_user_agreement_subject);
    }
    if (req.body.mail_user_agreement_title !== undefined) {
      updates.mail_user_agreement_title = trimString(req.body.mail_user_agreement_title);
    }
    if (req.body.mail_user_agreement_body !== undefined) {
      updates.mail_user_agreement_body = normalizeMultiline(req.body.mail_user_agreement_body);
    }
    if (req.body.mail_user_agreement_cta_text !== undefined) {
      updates.mail_user_agreement_cta_text = trimString(req.body.mail_user_agreement_cta_text);
    }
    if (req.body.mail_user_agreement_notice !== undefined) {
      updates.mail_user_agreement_notice = normalizeMultiline(req.body.mail_user_agreement_notice);
    }
    if (req.body.mail_user_agreement_success_title !== undefined) {
      updates.mail_user_agreement_success_title = trimString(req.body.mail_user_agreement_success_title);
    }
    if (req.body.mail_user_agreement_success_message !== undefined) {
      updates.mail_user_agreement_success_message = normalizeMultiline(req.body.mail_user_agreement_success_message);
    }
    if (req.body.mail_user_agreement_redirect_url !== undefined) {
      updates.mail_user_agreement_redirect_url = trimString(req.body.mail_user_agreement_redirect_url);
    }
    if (req.body.mail_user_agreement_redirect_delay !== undefined) {
      updates.mail_user_agreement_redirect_delay = trimString(req.body.mail_user_agreement_redirect_delay);
    }

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
  validateBody(emailTestSchema, { redirectUrl: "/admin/emails" }),
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
