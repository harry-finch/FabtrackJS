#!/usr/bin/env node

const path = require("path");
const i18nService = require("../services/i18nService");

const action = (process.argv[2] || "export").toLowerCase();
const customPath = process.argv[3];

if (action === "export") {
  const dest = customPath ? path.resolve(customPath) : undefined;
  const outPath = i18nService.exportToCsvFile(dest);
  console.log(`✅ Traductions exportées avec succès dans : ${outPath}`);
} else if (action === "import") {
  const src = customPath ? path.resolve(customPath) : undefined;
  const result = i18nService.importFromCsvFile(src);
  const newMsg = result.newLocales && result.newLocales.length > 0 ? ` (Nouvelle(s) langue(s) créée(s) : ${result.newLocales.join(", ")})` : "";
  console.log(`✅ Importation réussie ! ${result.totalKeys} clés synchronisées dans ${result.localesUpdated.map(l => "locales/" + l + ".json").join(", ")}.${newMsg}`);
} else {
  console.error("Usage : node scripts/i18n-csv.js [export|import] [fichier.csv]");
  process.exit(1);
}
