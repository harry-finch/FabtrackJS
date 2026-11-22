#!/usr/bin/env node

/**
 * FabtrackJS - Interactive Setup & Installation CLI Script
 * Usage:
 *   npm run setup
 *   node scripts/setup.js
 *   node scripts/setup.js --quick (runs with defaults for automated testing)
 */

const readline = require("readline/promises");
const { stdin: input, stdout: output } = require("process");
const { prisma } = require("../utilities/db");
const setupService = require("../services/setupService");
const { parseWorkspacesInput } = require("../schemas/setup.schema");

const BANNER = `
============================================================
      🛠️  FabtrackJS - Assistant d'Installation CLI  🛠️
============================================================
`;

async function prompt(rl, questionText, defaultValue) {
  const promptText = defaultValue
    ? `${questionText} [${defaultValue}]: `
    : `${questionText}: `;
  const answer = (await rl.question(promptText)).trim();
  return answer || defaultValue;
}

async function readMaskedLine(rl, promptText) {
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    return (await rl.question(promptText)).trim();
  }

  return await new Promise((resolve) => {
    output.write(promptText);
    const wasPaused = input.isPaused();
    if (wasPaused) input.resume();
    input.setRawMode(true);

    let value = "";
    const onData = (chunk) => {
      const str = chunk.toString("utf8");
      for (const ch of str) {
        if (ch === "\r" || ch === "\n") {
          input.setRawMode(false);
          input.removeListener("data", onData);
          output.write("\n");
          resolve(value.trim());
          return;
        }
        if (ch === "\u0003") {
          input.setRawMode(false);
          input.removeListener("data", onData);
          output.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            output.write("\b \b");
          }
          continue;
        }
        value += ch;
        output.write("*");
      }
    };

    input.on("data", onData);
  });
}

async function promptPassword(rl, questionText) {
  while (true) {
    const p1 = await readMaskedLine(rl, `${questionText}: `);
    if (!p1 || p1.length < 8) {
      console.log("❌ Le mot de passe doit comporter au moins 8 caractères.");
      continue;
    }
    const p2 = await readMaskedLine(rl, "Confirmez le mot de passe: ");
    if (p1 !== p2) {
      console.log("❌ Les mots de passe ne correspondent pas. Réessayez.");
      continue;
    }
    return p1;
  }
}

async function main() {
  console.log(BANNER);

  const isQuick = process.argv.includes("--quick") || process.argv.includes("-y");

  // Check existing installation
  const isInstalled = await setupService.checkIsInstalled(prisma);
  const rl = readline.createInterface({ input, output });

  try {
    if (isInstalled && !isQuick) {
      console.log("⚠️  Une installation existante a été détectée sur cette base de données.");
      const confirmReinstall = await prompt(
        rl,
        "Souhaitez-vous reconfigurer la plateforme ? (o/N)",
        "N"
      );
      if (confirmReinstall.toLowerCase() !== "o" && confirmReinstall.toLowerCase() !== "oui") {
        console.log("\nInstallation annulée. Vos données actuelles sont inchangées.");
        process.exit(0);
      }
    }

    console.log("👉 Veuillez renseigner les informations de configuration :\n");

    let adminName, adminEmail, adminPassword;
    let platformName, platformSubtitle, defaultLanguage, currencySymbol;
    let workspacesInput;

    if (isQuick) {
      console.log("⚡ Mode rapide (--quick) activé : utilisation des paramètres par défaut.");
      adminName = "admin";
      adminEmail = "admin@example.com";
      adminPassword = "adminpassword123";
      platformName = "FabtrackJS";
      platformSubtitle = "Suivi d'activité du fablab";
      defaultLanguage = "fr";
      currencySymbol = "€";
      workspacesInput = "Atelier principal, Salle Impression 3D, Lab Électronique";
    } else {
      // 1. Admin account
      console.log("--- 👤 Compte Administrateur ---");
      adminName = await prompt(rl, "Nom d'administrateur / identifiant", "admin");
      while (true) {
        adminEmail = await prompt(rl, "Adresse email administrateur", "admin@fablab.local");
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) break;
        console.log("❌ Format d'email invalide.");
      }
      adminPassword = await promptPassword(rl, "Mot de passe administrateur");

      // 2. Platform & Localization
      console.log("\n--- 🏢 Identité de la plateforme & Régionalisation ---");
      platformName = await prompt(rl, "Nom du Fablab ou de la structure", "FabtrackJS");
      platformSubtitle = await prompt(
        rl,
        "Sous-titre ou devise",
        "Suivi d'activité du fablab"
      );

      const langChoice = await prompt(
        rl,
        "Langue par défaut (1: Français, 2: English)",
        "1"
      );
      defaultLanguage = langChoice === "2" || langChoice.toLowerCase() === "en" ? "en" : "fr";

      currencySymbol = await prompt(rl, "Symbole de monnaie (€, $, CHF, £)", "€");

      // 3. Workspaces
      console.log("\n--- 📍 Espaces de travail (Workspaces) ---");
      console.log("Séparez les noms d'espaces par une virgule.");
      workspacesInput = await prompt(
        rl,
        "Espaces à créer",
        "Atelier principal, Salle Impression 3D, Lab Électronique"
      );
    }

    const workspaces = parseWorkspacesInput(workspacesInput);

    console.log("\n⏳ Initialisation de la plateforme en cours...");

    const result = await setupService.runSetup(
      {
        adminName,
        adminEmail,
        adminPassword,
        platformName,
        platformSubtitle,
        defaultLanguage,
        currencySymbol,
        workspaces,
      },
      prisma,
      { allowReconfigure: isInstalled }
    );

    const serverPort = process.env.PORT || "8080";
    console.log(`
============================================================
   🎉 Félicitations ! Installation terminée avec succès !
============================================================
• Administrateur : ${result.admin.name} (${result.admin.email})
• Plateforme     : ${result.settings.platformName}
• Langue         : ${result.settings.defaultLanguage.toUpperCase()}
• Devise         : ${result.settings.currencySymbol}
• Espaces créés  : ${result.workspaces.map((w) => w.name).join(", ")}

Pour démarrer votre serveur FabtrackJS :
   npm start   (ou npm run dev)

Accédez ensuite à votre espace d'administration sur :
   http://localhost:${serverPort}/login
============================================================
`);
  } catch (err) {
    console.error("\n❌ Erreur lors de l'installation :", err);
    process.exit(1);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
