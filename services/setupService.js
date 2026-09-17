const { prisma } = require("../utilities/db");
const bcrypt = require("bcryptjs");
const settingsService = require("./settingsService");

class SetupService {
  /**
   * Check whether the platform has already been initialized.
   * A platform is considered installed if:
   * 1. A setting 'platform_installed' === 'true' exists
   * 2. AND at least one staff with role 'admin' exists.
   */
  async checkIsInstalled(customPrisma = prisma) {
    try {
      const adminCount = await customPrisma.staff.count({
        where: { role: "admin" },
      });
      if (adminCount === 0) return false;

      const installedSetting = await customPrisma.systemSetting.findUnique({
        where: { key: "platform_installed" },
      });
      // If admin already exists in a legacy database, record platform_installed = true
      if (!installedSetting && adminCount > 0) {
        await customPrisma.systemSetting
          .create({
            data: { key: "platform_installed", value: "true" },
          })
          .catch(() => {});
        return true;
      }
      return installedSetting?.value === "true";
    } catch (err) {
      console.error("Error checking platform installation status:", err);
      return false;
    }
  }

  /**
   * Seeds minimal essential reference data (usertypes, projecttypes, warningtypes)
   * if they do not already exist in the database.
   */
  async seedEssentialReferenceData(tx = prisma, lang = "fr") {
    // 1. User types
    const existingUserTypes = await tx.usertype.count();
    if (existingUserTypes === 0) {
      const defaultUserTypes =
        lang === "en"
          ? ["Student", "Teacher / Researcher", "Staff", "External Visitor", "Project Lead", "Company"]
          : ["Étudiant", "Enseignant / Chercheur", "Personnel", "Visiteur externe", "Porteur de projet", "Entreprise"];

      for (const name of defaultUserTypes) {
        await tx.usertype.create({ data: { name } });
      }
    }

    // 2. Project types
    const existingProjectTypes = await tx.projecttype.count();
    if (existingProjectTypes === 0) {
      const defaultProjectTypes =
        lang === "en"
          ? ["Personal", "Academic", "Research", "Commercial", "Workshop"]
          : ["Personnel", "Académique", "Recherche", "Professionnel", "Atelier"];

      for (const name of defaultProjectTypes) {
        await tx.projecttype.create({ data: { name } });
      }
    }

    // 3. Warning types
    const existingWarningTypes = await tx.warningtype.count();
    if (existingWarningTypes === 0) {
      const defaultWarningTypes =
        lang === "en"
          ? ["Safety violation", "Damaged equipment", "Inappropriate behavior", "Other"]
          : ["Consignes de sécurité non respectées", "Dégradation de matériel", "Comportement inapproprié", "Autre"];

      for (const name of defaultWarningTypes) {
        await tx.warningtype.create({ data: { name } });
      }
    }
  }

  /**
   * Execute full platform setup with provided parameters.
   * @param {Object} data Setup configuration data
   * @param {PrismaClient} customPrisma Prisma client or transaction instance
   */
  async runSetup(data, customPrisma = prisma) {
    const {
      adminName,
      adminEmail,
      adminPassword,
      platformName = "FabtrackJS",
      platformSubtitle = "Suivi d'activité du fablab",
      defaultLanguage = "fr",
      currencySymbol = "€",
      workspaces = [],
    } = data;

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(adminPassword, saltRounds);

    // Run setup within a transaction if not already in one
    const execute = async (tx) => {
      // 1. Create or update the Administrator Staff account
      let admin = await tx.staff.findFirst({
        where: { email: adminEmail },
      });

      if (admin) {
        admin = await tx.staff.update({
          where: { id: admin.id },
          data: {
            name: adminName,
            password: hashedPassword,
            role: "admin",
            approved: true,
          },
        });
      } else {
        admin = await tx.staff.create({
          data: {
            name: adminName,
            email: adminEmail,
            password: hashedPassword,
            role: "admin",
            approved: true,
          },
        });
      }

      // 2. Configure System Settings
      const settingsToUpsert = [
        { key: "platform_name", value: String(platformName) },
        { key: "platform_subtitle", value: String(platformSubtitle) },
        { key: "default_language", value: String(defaultLanguage) },
        { key: "currency_symbol", value: String(currencySymbol) },
        { key: "admin_email", value: String(adminEmail) },
        { key: "mail_admin_recipient", value: String(adminEmail) },
        { key: "platform_installed", value: "true" },
      ];

      for (const s of settingsToUpsert) {
        await tx.systemSetting.upsert({
          where: { key: s.key },
          update: { value: s.value },
          create: { key: s.key, value: s.value },
        });
      }

      // 3. Create Workspaces
      const createdWorkspaces = [];
      let workspaceList = Array.isArray(workspaces)
        ? workspaces
        : typeof workspaces === "string"
        ? workspaces.split(/[\n,;]+/).map((w) => w.trim()).filter(Boolean)
        : [];

      // If no workspace provided, default to a sensible primary workspace
      if (workspaceList.length === 0) {
        workspaceList = [defaultLanguage === "en" ? "Main Workshop" : "Atelier principal"];
      }

      for (const wsName of workspaceList) {
        const trimmed = String(wsName).trim();
        if (!trimmed) continue;
        const existing = await tx.workspace.findFirst({ where: { name: trimmed } });
        if (!existing) {
          const ws = await tx.workspace.create({ data: { name: trimmed } });
          createdWorkspaces.push(ws);
        } else {
          createdWorkspaces.push(existing);
        }
      }

      // Link admin to first workspace
      if (createdWorkspaces.length > 0) {
        await tx.staff.update({
          where: { id: admin.id },
          data: { lastWorkspaceId: createdWorkspaces[0].id },
        });
      }

      // 4. Seed essential reference types
      await this.seedEssentialReferenceData(tx, defaultLanguage);

      return {
        admin,
        workspaces: createdWorkspaces,
        settings: {
          platformName,
          platformSubtitle,
          defaultLanguage,
          currencySymbol,
        },
      };
    };

    let result;
    if (customPrisma.$transaction) {
      result = await customPrisma.$transaction(execute);
    } else {
      result = await execute(customPrisma);
    }

    // Invalidate settingsService cached in memory
    settingsService.invalidateCache();

    return result;
  }
}

module.exports = new SetupService();
