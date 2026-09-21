const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const DEFAULT_SETTINGS = {
  platform_name: "FabtrackJS",
  platform_subtitle: "Track your fablab's activity",
  platform_logo_type: "default", // 'default' (Sorbonne SVG) or 'custom'
  platform_logo_path: "",
  platform_favicon_path: "",
  session_timeout_hours: "24",
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
  smtp_port: process.env.PORT || "587",
  smtp_user: process.env.USR || "",
  smtp_pass: process.env.PASSWD || "",
  smtp_secure: "false",
  mail_notif_consumable_low_stock: "true",
  mail_notif_user_warning: "true",
  mail_notif_staff_registration: "true",
  mail_notif_user_agreement: "true",
  mail_notif_machine_issue: "true",
  // User Agreement Email Template
  mail_user_agreement_subject: "Fablab : Signature requise de la charte d'utilisation",
  mail_user_agreement_title: "Validation de la charte d'utilisation du Fablab",
  mail_user_agreement_body: "Bonjour {name},\n\nVotre compte a bien été créé sur la plateforme {lab_name} du Fablab.\n\nPour pouvoir accéder au laboratoire et vous enregistrer lors de vos visites, vous devez obligatoirement prendre connaissance de la charte d'utilisation et la signer en ligne.\n\nCliquez sur le bouton ci-dessous pour lire et valider la charte :",
  mail_user_agreement_cta_text: "Signer la charte d'utilisation",
  mail_user_agreement_notice: "",
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

class SettingsService {
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

    try {
      const rows = await prisma.systemSetting.findMany();
      const settings = { ...DEFAULT_SETTINGS };

      rows.forEach((row) => {
        settings[row.key] = row.value;
      });

      cache = settings;
      return { ...cache };
    } catch (err) {
      console.error("Error fetching system settings from DB:", err);
      return { ...DEFAULT_SETTINGS };
    }
  }

  async getSetting(key) {
    const settings = await this.getSettings();
    return settings[key] !== undefined ? settings[key] : DEFAULT_SETTINGS[key];
  }

  async setSetting(key, value) {
    const strVal = String(value);
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value: strVal },
      create: { key, value: strVal },
    });
    if (cache) {
      cache[key] = strVal;
    }
  }

  async updateSettings(newSettings) {
    const promises = Object.entries(newSettings).map(([key, val]) => {
      const strVal = String(val);
      return prisma.systemSetting.upsert({
        where: { key },
        update: { value: strVal },
        create: { key, value: strVal },
      });
    });

    await Promise.all(promises);
    this.invalidateCache();
    return await this.getSettings();
  }

  invalidateCache() {
    cache = null;
  }
}

module.exports = new SettingsService();
