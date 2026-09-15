const nodemailer = require("nodemailer");
const settingsService = require("./settingsService.js");
const logger = require("../utilities/simpleLogger.js");

class MailService {
  /**
   * Builds a nodemailer transporter based on platform settings and environment fallback.
   */
  async getTransporter() {
    const settings = await settingsService.getSettings();

    const host = settings.smtp_host || process.env.HOST || "localhost";
    const port = Number(settings.smtp_port || process.env.PORT || 587);
    const user = settings.smtp_user || process.env.USR || "";
    const pass = settings.smtp_pass || process.env.PASSWD || "";
    const secure = settings.smtp_secure === "true" || port === 465;

    const transportConfig = {
      host,
      port,
      secure,
    };

    if (user && pass) {
      transportConfig.auth = { user, pass };
    }

    return {
      transporter: nodemailer.createTransport(transportConfig),
      from: settings.mail_from || process.env.MAILFROM || "Fabtrack <noreply@fabtrack.local>",
      adminRecipient: settings.mail_admin_recipient || settings.admin_email || process.env.ADMIN || "admin@example.com",
      settings,
    };
  }

  /**
   * Base method to send an email with error isolation.
   */
  async sendMail({ to, subject, html, text }) {
    try {
      const { transporter, from } = await this.getTransporter();

      const mailOptions = {
        from,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>?/gm, ""),
      };

      const info = await transporter.sendMail(mailOptions);
      const previewUrl = nodemailer.getTestMessageUrl(info);

      if (previewUrl) {
        console.log(`[MailService] Email preview URL: ${previewUrl}`);
      }

      logger.logThat(`Email envoyé avec succès à ${to} : "${subject}"`);
      return { success: true, messageId: info.messageId, previewUrl };
    } catch (error) {
      console.error("[MailService] Failed to send email:", error.message);
      logger.logThat(`Échec d'envoi d'email à ${to} : ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generates a modern branded HTML email layout for platform notifications.
   */
  renderEmailLayout({ title, badgeText, badgeColor = "#EF4136", contentHtml, ctaUrl, ctaText }) {
    const primaryColor = "#112970";
    const lightBg = "#f8f9fa";

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #1e293b;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
          <!-- Header Banner -->
          <tr>
            <td style="background-color: ${primaryColor}; padding: 24px 30px; text-align: left;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">FabtrackJS</span>
                  </td>
                  ${badgeText ? `
                  <td align="right">
                    <span style="background-color: ${badgeColor}; color: #ffffff; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.05em;">${badgeText}</span>
                  </td>
                  ` : ""}
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 30px;">
              <h2 style="margin-top: 0; margin-bottom: 16px; font-size: 18px; color: #0f172a; font-weight: 700;">${title}</h2>
              
              <div style="font-size: 14px; line-height: 1.6; color: #334155;">
                ${contentHtml}
              </div>

              ${ctaUrl && ctaText ? `
              <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center;">
                <a href="${ctaUrl}" style="display: inline-block; background-color: ${primaryColor}; color: #ffffff; padding: 10px 22px; border-radius: 50px; font-size: 13px; font-weight: 600; text-decoration: none; box-shadow: 0 2px 6px rgba(17,41,112,0.25);">
                  ${ctaText} &rarr;
                </a>
              </div>
              ` : ""}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: ${lightBg}; padding: 18px 30px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
              Notification automatique générée par votre plateforme <strong>FabtrackJS</strong>.<br>
              Vous pouvez gérer vos préférences d'e-mails dans le panneau d'administration.
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  /**
   * Sends an automated alert when a consumable reaches or drops below its reorder threshold.
   */
  async sendLowStockAlert(consumable, newStock) {
    const settings = await settingsService.getSettings();

    if (settings.mail_notif_consumable_low_stock !== "true") {
      return { skipped: true, reason: "Notification disabled in settings" };
    }

    const hostUrl = process.env.HOSTURL || "http://localhost:3000";
    const adminEmail = settings.mail_admin_recipient || settings.admin_email || process.env.ADMIN;
    const unitStr = consumable.unit || "unités";
    const isOutOfStock = newStock <= 0;
    const badgeText = isOutOfStock ? "Rupture de stock" : "Stock faible";
    const badgeColor = isOutOfStock ? "#dc3545" : "#fd7e14";

    const contentHtml = `
      <p>Le consommable suivant a atteint ou franchi à la baisse son seuil d'alerte de réapprovisionnement :</p>
      
      <table style="width: 100%; border-collapse: collapse; margin: 18px 0; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
        <tr>
          <td style="padding: 10px 14px; font-weight: 600; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0; width: 40%;">Consommable</td>
          <td style="padding: 10px 14px; font-weight: 700; font-size: 14px; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${consumable.name}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; font-weight: 600; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Stock actuel restant</td>
          <td style="padding: 10px 14px; font-weight: 700; font-size: 14px; color: ${badgeColor}; border-bottom: 1px solid #e2e8f0;">
            ${newStock} ${unitStr}
          </td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; font-weight: 600; font-size: 13px; color: #64748b;">Seuil de réapprovisionnement</td>
          <td style="padding: 10px 14px; font-weight: 600; font-size: 13px; color: #334155;">
            ${consumable.reorderThreshold} ${unitStr}
          </td>
        </tr>
      </table>

      <p style="margin-bottom: 0;">Pensez à passer commande ou à réapprovisionner cet article pour éviter toute interruption d'activité dans le fablab.</p>
    `;

    const html = this.renderEmailLayout({
      title: `Alerte de stock : ${consumable.name}`,
      badgeText,
      badgeColor,
      contentHtml,
      ctaUrl: `${hostUrl}/admin/consumables/manage`,
      ctaText: "Gérer l'inventaire des consommables",
    });

    return await this.sendMail({
      to: adminEmail,
      subject: `[Alerte Stock] ${badgeText} : ${consumable.name} (${newStock} ${unitStr})`,
      html,
    });
  }

  /**
   * Sends an automated alert when a warning is issued to a user.
   */
  async sendWarningAlert({ user, warningtype, comments, staffUsername }) {
    const settings = await settingsService.getSettings();

    if (settings.mail_notif_user_warning !== "true") {
      return { skipped: true, reason: "Notification disabled in settings" };
    }

    const hostUrl = process.env.HOSTURL || "http://localhost:3000";
    const adminEmail = settings.mail_admin_recipient || settings.admin_email || process.env.ADMIN;
    const author = staffUsername || "Médiateur Fablab";
    const warningName = (warningtype && warningtype.name) ? warningtype.name : "Avertissement";
    const userFullName = `${user.name} ${user.surname}`;

    const contentHtml = `
      <p>Un nouvel avertissement a été attribué à un usager de la plateforme :</p>
      
      <table style="width: 100%; border-collapse: collapse; margin: 18px 0; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
        <tr>
          <td style="padding: 10px 14px; font-weight: 600; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0; width: 35%;">Usager concerné</td>
          <td style="padding: 10px 14px; font-weight: 700; font-size: 14px; color: #0f172a; border-bottom: 1px solid #e2e8f0;">
            ${userFullName} (${user.email || 'Email non renseigné'})
          </td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; font-weight: 600; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Motif d'avertissement</td>
          <td style="padding: 10px 14px; font-weight: 700; font-size: 13px; color: #dc3545; border-bottom: 1px solid #e2e8f0;">
            ${warningName}
          </td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; font-weight: 600; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Attribué par</td>
          <td style="padding: 10px 14px; font-weight: 600; font-size: 13px; color: #334155; border-bottom: 1px solid #e2e8f0;">
            ${author}
          </td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; font-weight: 600; font-size: 13px; color: #64748b;">Commentaires & détails</td>
          <td style="padding: 10px 14px; font-size: 13px; color: #334155; font-style: italic;">
            ${comments && comments.trim() ? comments : "Aucun commentaire saisi"}
          </td>
        </tr>
      </table>

      <p style="margin-bottom: 0;">Cet avertissement est visible par les animateurs lors du passage de l'usager au Fablab.</p>
    `;

    const html = this.renderEmailLayout({
      title: `Nouvel avertissement usager : ${userFullName}`,
      badgeText: "Avertissement",
      badgeColor: "#dc3545",
      contentHtml,
      ctaUrl: `${hostUrl}/users/edit/${user.id}`,
      ctaText: "Consulter la fiche usager",
    });

    return await this.sendMail({
      to: adminEmail,
      subject: `[Avertissement Usager] ${userFullName} - ${warningName}`,
      html,
    });
  }

  /**
   * Sends an automated alert when an issue/failure is reported on a machine.
   */
  async sendMachineIssueAlert({ machine, issue, hostUrl: customHostUrl }) {
    const settings = await settingsService.getSettings();

    if (settings.mail_notif_machine_issue !== "true") {
      return { skipped: true, reason: "Notification disabled in settings" };
    }

    const hostUrl = customHostUrl || process.env.HOSTURL || "http://localhost:3000";
    const adminEmail = settings.mail_admin_recipient || settings.admin_email || process.env.ADMIN;
    const reporter = issue.reporterName
      ? `${issue.reporterName}${issue.reporterEmail ? ` (${issue.reporterEmail})` : ""}`
      : (issue.reporterEmail || "Usager (non renseigné)");
    const dateStr = new Date(issue.createdAt || Date.now()).toLocaleString("fr-FR");

    const contentHtml = `
      <p>Un nouvel incident ou une panne a été signalé(e) sur une machine du fablab :</p>
      
      <table style="width: 100%; border-collapse: collapse; margin: 18px 0; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
        <tr>
          <td style="padding: 10px 14px; font-weight: 600; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0; width: 35%;">Machine concernée</td>
          <td style="padding: 10px 14px; font-weight: 700; font-size: 14px; color: #0f172a; border-bottom: 1px solid #e2e8f0;">
            ${machine.name} ${machine.make ? `(${machine.make} ${machine.model || ""})` : ""}
          </td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; font-weight: 600; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Signalé par</td>
          <td style="padding: 10px 14px; font-weight: 600; font-size: 13px; color: #334155; border-bottom: 1px solid #e2e8f0;">
            ${reporter}
          </td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; font-weight: 600; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Date du signalement</td>
          <td style="padding: 10px 14px; font-size: 13px; color: #334155; border-bottom: 1px solid #e2e8f0;">
            ${dateStr}
          </td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; font-weight: 600; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Description du problème</td>
          <td style="padding: 10px 14px; font-size: 13px; color: #b91c1c; font-weight: 600; white-space: pre-wrap; border-bottom: 1px solid #e2e8f0;">
            ${issue.description}
          </td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; font-weight: 600; font-size: 13px; color: #64748b;">Photo jointe</td>
          <td style="padding: 10px 14px; font-size: 13px; color: #334155;">
            ${issue.photoPath ? `&#128247; Une photo a été jointe au signalement (<a href="${hostUrl}${issue.photoPath}" target="_blank" style="color: #2563eb; text-decoration: underline;">consulter la photo</a>)` : "Aucune photo jointe"}
          </td>
        </tr>
      </table>

      <p style="margin-bottom: 0;">Ce signalement est immédiatement consultable dans l'historique et la fiche détaillée de la machine.</p>
    `;

    const html = this.renderEmailLayout({
      title: `Panne signalée sur ${machine.name}`,
      badgeText: "Panne Machine",
      badgeColor: "#dc2626",
      contentHtml,
      ctaUrl: `${hostUrl}/admin/machines/view/${machine.id}`,
      ctaText: "Voir la machine & ses incidents",
    });

    return await this.sendMail({
      to: adminEmail,
      subject: `[Panne Machine] Incident signalé sur ${machine.name}`,
      html,
    });
  }

  /**
   * Sends an immediate test email to verify SMTP configuration.
   */
  async sendTestEmail(targetEmail) {
    const hostUrl = process.env.HOSTURL || "http://localhost:3000";
    const dateStr = new Date().toLocaleString("fr-FR");

    const contentHtml = `
      <p>Ceci est un <strong>e-mail de test</strong> envoyé depuis votre instance FabtrackJS.</p>
      <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 14px; margin: 16px 0; color: #065f46;">
        <strong style="display: block; margin-bottom: 4px;">&#10004; Configuration SMTP opérationnelle !</strong>
        Votre serveur de messagerie est correctement configuré et prêt à délivrer les notifications automatiques.
      </div>
      <p style="font-size: 13px; color: #64748b;">Date et heure du test : <strong>${dateStr}</strong></p>
    `;

    const html = this.renderEmailLayout({
      title: "Test de configuration e-mail réussi",
      badgeText: "Test SMTP",
      badgeColor: "#10b981",
      contentHtml,
      ctaUrl: `${hostUrl}/admin/emails`,
      ctaText: "Retourner à la configuration",
    });

    return await this.sendMail({
      to: targetEmail,
      subject: "FabtrackJS : Test de configuration e-mail réussi",
      html,
    });
  }

  /**
   * Sends the charter agreement email to a newly registered user or when resent.
   */
  async sendAgreementEmail({ user, token, hostUrl: customHostUrl }) {
    if (!user || !user.email) {
      return { skipped: true, reason: "No user email" };
    }

    const settings = await settingsService.getSettings();

    if (settings.mail_notif_user_agreement === "false") {
      return { skipped: true, reason: "User agreement email disabled in settings" };
    }

    const hostUrl = customHostUrl || process.env.HOSTURL || "http://localhost:8080";
    const agreementToken = token || user.token;
    const agreementUrl = `${hostUrl}/agreement/${agreementToken}`;
    const labName = settings.platform_name || "FabtrackJS";

    const replaceVariables = (str) => {
      if (!str) return "";
      return str
        .replace(/\{name\}|\{\{name\}\}/gi, user.name || "")
        .replace(/\{surname\}|\{\{surname\}\}/gi, user.surname || "")
        .replace(/\{fullname\}|\{\{fullname\}\}/gi, `${user.name || ""} ${user.surname || ""}`.trim())
        .replace(/\{email\}|\{\{email\}\}/gi, user.email || "")
        .replace(/\{lab_name\}|\{\{lab_name\}\}/gi, labName)
        .replace(/\{link\}|\{\{link\}\}/gi, agreementUrl);
    };

    const subject = replaceVariables(settings.mail_user_agreement_subject || "Fablab : Signature requise de la charte d'utilisation");
    const title = replaceVariables(settings.mail_user_agreement_title || "Validation de la charte d'utilisation du Fablab");
    const rawBody = settings.mail_user_agreement_body || 
      "Bonjour {name},\n\nVotre compte a bien été créé sur la plateforme {lab_name} du Fablab.\n\nPour pouvoir accéder au laboratoire et vous enregistrer lors de vos visites, vous devez obligatoirement prendre connaissance de la charte d'utilisation et la signer en ligne.\n\nCliquez sur le bouton ci-dessous pour lire et valider la charte :";
    
    const formattedBodyHtml = replaceVariables(rawBody)
      .split("\n\n")
      .map((p) => `<p style="margin-bottom: 12px;">${p.replace(/\n/g, "<br>")}</p>`)
      .join("");

    const ctaText = replaceVariables(settings.mail_user_agreement_cta_text || "Signer la charte d'utilisation");

    const contentHtml = `
      <div style="font-size: 14px; line-height: 1.6; color: #334155;">
        ${formattedBodyHtml}
      </div>
      
      <div style="background-color: #f8fafc; border-left: 4px solid #112970; padding: 14px 18px; margin: 18px 0; border-radius: 4px; font-size: 13px; color: #334155;">
        <strong>Important :</strong> L'accès aux équipements et le pointage d'entrée au Fablab restent bloqués tant que la charte n'a pas été acceptée.
      </div>
    `;

    const html = this.renderEmailLayout({
      title,
      badgeText: "Charte Fablab",
      badgeColor: "#112970",
      contentHtml,
      ctaUrl: agreementUrl,
      ctaText,
    });

    return await this.sendMail({
      to: user.email,
      subject,
      html,
    });
  }

  /**
   * Sends an alert when a new staff member registers and awaits approval.
   */
  async sendStaffRegisteredAlert({ username, email, hostUrl: customHostUrl }) {
    const settings = await settingsService.getSettings();
    const adminEmail = settings.mail_admin_recipient || settings.admin_email || process.env.ADMIN || "admin@example.com";
    const hostUrl = customHostUrl || process.env.HOSTURL || "http://localhost:8080";

    const contentHtml = `
      <p>Un nouveau membre du staff s'est inscrit et attend votre validation pour pouvoir se connecter :</p>
      <ul>
        <li><strong>Identifiant :</strong> ${username}</li>
        <li><strong>Email :</strong> ${email}</li>
      </ul>
    `;

    const html = this.renderEmailLayout({
      title: "Nouveau compte animateur / staff à valider",
      badgeText: "Nouveau Staff",
      badgeColor: "#3b82f6",
      contentHtml,
      ctaUrl: `${hostUrl}/admin/staff/manage`,
      ctaText: "Gérer les membres du staff",
    });

    return await this.sendMail({
      to: adminEmail,
      subject: `[Staff Fablab] Nouveau compte staff créé : ${username}`,
      html,
    });
  }

  /**
   * Sends password reset email.
   */
  async sendPasswordResetEmail({ email, token, hostUrl: customHostUrl }) {
    const hostUrl = customHostUrl || process.env.HOSTURL || "http://localhost:8080";
    const resetUrl = `${hostUrl}/reset/${token}`;

    const contentHtml = `
      <p>Vous avez demandé la réinitialisation de votre mot de passe pour la plateforme FabtrackJS.</p>
      <p>Ce lien est valable pendant 10 minutes :</p>
    `;

    const html = this.renderEmailLayout({
      title: "Réinitialisation de votre mot de passe",
      badgeText: "Sécurité",
      badgeColor: "#64748b",
      contentHtml,
      ctaUrl: resetUrl,
      ctaText: "Réinitialiser mon mot de passe",
    });

    return await this.sendMail({
      to: email,
      subject: "FabtrackJS : Réinitialisation de mot de passe",
      html,
    });
  }

  /**
   * Sends an automated alert email to administrator when a bug or platform issue is reported.
   */
  async sendBugReportAlert({ title, category, description, pageUrl, reporterName, reporterEmail, severity, hostUrl: customHostUrl }) {
    const { settings, adminRecipient } = await this.getTransporter();
    const adminEmail = settings.mail_admin_recipient || settings.admin_email || adminRecipient;
    const hostUrl = customHostUrl || process.env.HOSTURL || "http://localhost:8080";

    const reporter = reporterName
      ? `${reporterName}${reporterEmail ? ` (${reporterEmail})` : ""}`
      : (reporterEmail || "Médiateur / Utilisateur");
    const dateStr = new Date().toLocaleString("fr-FR");

    const severityColors = {
      Faible: "#10b981",
      Moyenne: "#f59e0b",
      Élevée: "#ea580c",
      Critique: "#ef4444",
    };
    const badgeColor = severityColors[severity] || "#f59e0b";

    const contentHtml = `
      <p>Un nouveau problème ou une suggestion d'amélioration a été signalé sur la plateforme Fabtrack :</p>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0 0 8px 0;"><strong>&#128392; Objet :</strong> ${title}</p>
        <p style="margin: 0 0 8px 0;"><strong>&#128193; Catégorie :</strong> ${category}</p>
        <p style="margin: 0 0 8px 0;"><strong>&#9888; Gravité :</strong> <span style="display: inline-block; background-color: ${badgeColor}; color: #ffffff; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: bold;">${severity}</span></p>
        <p style="margin: 0 0 8px 0;"><strong>&#128100; Signalé par :</strong> ${reporter}</p>
        <p style="margin: 0 0 8px 0;"><strong>&#128197; Date :</strong> ${dateStr}</p>
        ${pageUrl ? `<p style="margin: 0 0 8px 0;"><strong>&#128279; Page concernée :</strong> <a href="${pageUrl}" target="_blank" style="color: #2563eb; word-break: break-all;">${pageUrl}</a></p>` : ""}
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 12px 0;" />
        <p style="margin: 0 0 4px 0;"><strong>&#128221; Description du problème :</strong></p>
        <p style="margin: 0; white-space: pre-wrap; font-family: monospace; background: #ffffff; padding: 10px; border-radius: 4px; border: 1px solid #e2e8f0;">${description}</p>
      </div>
    `;

    const html = this.renderEmailLayout({
      title: `Signalement de bug : ${title}`,
      badgeText: `Plateforme - ${category}`,
      badgeColor,
      contentHtml,
      ctaUrl: pageUrl || `${hostUrl}/fabtrack`,
      ctaText: "Accéder à la plateforme",
    });

    return await this.sendMail({
      to: adminEmail,
      subject: `[Bug Fabtrack] ${title} (${category} - ${severity})`,
      html,
    });
  }
}

module.exports = new MailService();
