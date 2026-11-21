const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { encryptSecret, decryptSecret } = require("../utilities/secretCrypto");
const hookManager = require("../core/HookManager");

const PLUGIN_SETTING_KEYS = {
  ue: "plugin_ue_enabled",
  rfid: "plugin_rfid_enabled",
  bookstack: "plugin_bookstack_enabled",
  repaircafe: "plugin_repaircafe_enabled",
  workshop: "plugin_workshop_enabled",
  sorbonne: "plugin_sorbonne_enabled",
};

const DEFAULT_SETTINGS = {
  platform_name: "FabtrackJS",
  platform_subtitle: "Track your fablab's activity",
  platform_logo_type: "default", // 'default' (Sorbonne SVG) or 'custom'
  platform_logo_path: "",
  platform_favicon_path: "",
  session_timeout_hours: "24",
  visit_auto_close_time: "18:30",
  api_machine_token: process.env.FABTRACK_API_KEY || "",
  plugin_ue_enabled: "true",
  ue_projecttype_name: "Academic",
  currency_symbol: "€",
  admin_email: "admin@example.com",
  allow_self_registration: "true",
  default_language: "fr",
  date_format: "DD/MM/YYYY",
  // Email & Notifications settings
  mail_admin_recipient: process.env.ADMIN || "admin@example.com",
  mail_from: process.env.MAILFROM || "Fabtrack <noreply@fabtrack.local>",
  smtp_host: process.env.HOST || "",
  smtp_port: process.env.SMTP_PORT || "587",
  smtp_user: process.env.USR || "",
  smtp_pass: process.env.PASSWD || "",
  smtp_secure: "false",
  mail_notif_consumable_low_stock: "true",
  mail_notif_user_warning: "true",
  mail_notif_staff_registration: "true",
  mail_notif_staff_approved: "true",
  mail_notif_user_agreement: "true",
  mail_notif_machine_issue: "true",
  mail_notif_bug_report: "true",
  // User Agreement Email Template
  mail_user_agreement_subject: "Fablab : Signature requise de la charte d'utilisation",
  mail_user_agreement_title: "Validation de la charte d'utilisation du Fablab",
  mail_user_agreement_body: "Bonjour {name},\n\nVotre compte a bien été créé sur la plateforme {lab_name} du Fablab.\n\nPour pouvoir accéder au laboratoire et vous enregistrer lors de vos visites, vous devez obligatoirement prendre connaissance de la charte d'utilisation et la signer en ligne.\n\nCliquez sur le bouton ci-dessous pour lire et valider la charte :",
  mail_user_agreement_cta_text: "Signer la charte d'utilisation",
  mail_user_agreement_notice: "",
  // Charter Agreement Confirmation Page & Post-Signature Redirect
  mail_user_agreement_success_title: "Merci d'avoir signé la charte !",
  mail_user_agreement_success_message: "Votre acceptation de la charte d'utilisation a bien été enregistrée. Vous pouvez désormais vous enregistrer et accéder au laboratoire lors de vos visites.\n\nVous allez être redirigé vers notre site...",
  mail_user_agreement_redirect_url: "https://wiki.fablab.sorbonne-universite.fr/BookStack/",
  mail_user_agreement_redirect_delay: "5",
  // BookStack Wiki Plugin settings
  plugin_bookstack_enabled: "true",
  bookstack_url: "https://wiki.fablab.sorbonne-universite.fr/BookStack/",
  bookstack_token_id: process.env.BOOKSTACK_TOKEN_ID || "",
  bookstack_token_secret: process.env.BOOKSTACK_TOKEN_SECRET || "",
  bookstack_auto_prefill: "true",
  // Repair Café Plugin settings
  plugin_repaircafe_enabled: "true",
  repaircafe_projecttype_name: "Repair Café",
  // Workshop Plugin settings
  plugin_workshop_enabled: "true",
  workshop_projecttype_name: "Atelier",
  // Sorbonne Projects Plugin settings
  plugin_sorbonne_enabled: "true",
  sorbonne_projecttype_name: "Sorbonne",
  // Natural Language AI Query settings
  ai_provider: "none", // 'none' | 'openai' | 'gemini' | 'anthropic' | 'local'
  ai_openai_api_key: process.env.OPENAI_API_KEY || "",
  ai_openai_model: "gpt-4o-mini",
  ai_gemini_api_key: process.env.GEMINI_API_KEY || "",
  ai_gemini_model: "gemini-1.5-flash",
  ai_anthropic_api_key: process.env.ANTHROPIC_API_KEY || "",
  ai_anthropic_model: "claude-3-5-haiku-20241022",
  ai_local_url: "http://localhost:11434/v1",
  ai_local_model: "llama3.2",
  ai_local_api_key: "",
};

let cache = null;

const SECRET_SETTING_KEYS = new Set([
  "api_machine_token",
  "smtp_pass",
  "bookstack_token_id",
  "bookstack_token_secret",
  "ai_openai_api_key",
  "ai_gemini_api_key",
  "ai_anthropic_api_key",
  "ai_local_api_key",
]);

const PUBLIC_SETTING_KEYS = Object.keys(DEFAULT_SETTINGS).filter((key) => !SECRET_SETTING_KEYS.has(key));
PUBLIC_SETTING_KEYS.push("platform_installed");

/**
 * Returns a strict whitelist projection of system settings safe to expose
 * to EJS templates via `res.locals.settings` (excludes all API keys, tokens, and passwords).
 *
 * @param {Object} settings
 * @returns {Object}
 */
function filterPublicSettings(settings = {}) {
  const safe = {};
  for (const key of PUBLIC_SETTING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(settings, key)) {
      safe[key] = settings[key];
    }
  }
  return safe;
}

class SettingsService {
  filterPublicSettings(settings) {
    return filterPublicSettings(settings);
  }

  /**
   * Synchronizes HookManager plugin enabled flags from the loaded settings object.
   * Invoked only on initial load / reload and when settings change (never per HTTP request).
   *
   * @param {Object} settings
   */
  syncPluginStates(settings = {}) {
    for (const [pluginId, settingKey] of Object.entries(PLUGIN_SETTING_KEYS)) {
      const enabled = settings[settingKey] !== "false";
      hookManager.setPluginEnabled(pluginId, enabled);
    }
  }

  getDefaults() {
    return { ...DEFAULT_SETTINGS };
  }

  getCachedSettingsSync() {
    return cache ? { ...cache } : { ...DEFAULT_SETTINGS };
  }

  async getSettings() {
    if (cache !== null) {
      return { ...cache };
    }

    return await this.reloadSettings();
  }

  async reloadSettings() {
    try {
      const rows = await prisma.systemSetting.findMany();
      const settings = { ...DEFAULT_SETTINGS };

      rows.forEach((row) => {
        settings[row.key] = SECRET_SETTING_KEYS.has(row.key) ? decryptSecret(row.value) : row.value;
      });

      cache = settings;
      this.syncPluginStates(cache);
      return { ...cache };
    } catch (err) {
      console.error("Error fetching system settings from DB:", err);
      const fallback = cache ? { ...cache } : { ...DEFAULT_SETTINGS };
      this.syncPluginStates(fallback);
      return fallback;
    }
  }

  async getSetting(key) {
    const settings = await this.getSettings();
    return settings[key] !== undefined ? settings[key] : DEFAULT_SETTINGS[key];
  }

  async setSetting(key, value) {
    const plainVal = String(value);
    const storedVal = SECRET_SETTING_KEYS.has(key) ? encryptSecret(plainVal) : plainVal;
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value: storedVal },
      create: { key, value: storedVal },
    });
    if (cache) {
      cache[key] = plainVal;
    }
    for (const [pluginId, settingKey] of Object.entries(PLUGIN_SETTING_KEYS)) {
      if (settingKey === key) {
        hookManager.setPluginEnabled(pluginId, plainVal !== "false");
        break;
      }
    }
  }

  async updateSettings(newSettings) {
    const promises = Object.entries(newSettings).map(([key, val]) => {
      const plainVal = String(val);
      const storedVal = SECRET_SETTING_KEYS.has(key) ? encryptSecret(plainVal) : plainVal;
      return prisma.systemSetting.upsert({
        where: { key },
        update: { value: storedVal },
        create: { key, value: storedVal },
      });
    });

    await Promise.all(promises);
    return await this.reloadSettings();
  }

  invalidateCache() {
    cache = null;
  }
}

module.exports = new SettingsService();
module.exports.PLUGIN_SETTING_KEYS = PLUGIN_SETTING_KEYS;
