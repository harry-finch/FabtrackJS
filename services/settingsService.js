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
  currency_symbol: "€",
  admin_email: "admin@example.com",
  allow_self_registration: "true",
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
};

let cache = null;

class SettingsService {
  getDefaults() {
    return { ...DEFAULT_SETTINGS };
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
