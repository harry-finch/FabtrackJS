const { prisma } = require("../utilities/db");
const { v4: uuidv4 } = require("uuid");
const moment = require("moment");
const logger = require("../utilities/simpleLogger.js");

/**
 * Service de gestion de l'importation par lot d'historiques et séances d'enseignement via CSV.
 */
class HistoryImportService {
  /**
   * Analyse du texte CSV (RFC 4180 avec détection automatique de séparateur , ; ou \t)
   */
  parseCsvText(csvText) {
    if (!csvText || typeof csvText !== "string") return [];

    // Nettoyage du BOM UTF-8
    let cleanText = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;
    cleanText = cleanText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    if (!cleanText) return [];

    // Détection du délimiteur le plus fréquent sur la première ligne (, ; ou \t)
    const firstLine = cleanText.split("\n")[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;

    let delimiter = ",";
    if (semicolonCount > commaCount && semicolonCount >= tabCount) {
      delimiter = ";";
    } else if (tabCount > commaCount && tabCount > semicolonCount) {
      delimiter = "\t";
    }

    const rows = [];
    let currentRow = [];
    let currentField = "";
    let insideQuotes = false;

    for (let i = 0; i < cleanText.length; i++) {
      const char = cleanText[i];
      const nextChar = cleanText[i + 1];

      if (insideQuotes) {
        if (char === '"') {
          if (nextChar === '"') {
            currentField += '"';
            i++; // Sauter le guillemet échappé
          } else {
            insideQuotes = false;
          }
        } else {
          currentField += char;
        }
      } else {
        if (char === '"') {
          insideQuotes = true;
        } else if (char === delimiter) {
          currentRow.push(currentField.trim());
          currentField = "";
        } else if (char === "\n") {
          currentRow.push(currentField.trim());
          if (currentRow.some((field) => field.length > 0)) {
            rows.push(currentRow);
          }
          currentRow = [];
          currentField = "";
        } else {
          currentField += char;
        }
      }
    }

    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField.trim());
      if (currentRow.some((field) => field.length > 0)) {
        rows.push(currentRow);
      }
    }

    return rows;
  }

  /**
   * Normalisation des en-têtes de colonnes CSV
   */
  mapHeaders(headerRow) {
    const mapping = {};
    const cleanHeaders = headerRow.map((h) =>
      h
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\s\-_]+/g, "_")
        .trim()
    );

    cleanHeaders.forEach((col, idx) => {
      if (["nom", "surname", "last_name", "lastname"].includes(col)) {
        mapping.surname = idx;
      } else if (["prenom", "name", "first_name", "firstname"].includes(col)) {
        mapping.name = idx;
      } else if (["email", "mail", "courriel", "e_mail"].includes(col)) {
        mapping.email = idx;
      } else if (["date", "jour", "seance_date"].includes(col)) {
        mapping.date = idx;
      } else if (["arrivee", "arrival", "heure_arrivee", "debut", "start", "start_time"].includes(col)) {
        mapping.arrival = idx;
      } else if (["depart", "departure", "heure_depart", "fin", "end", "end_time"].includes(col)) {
        mapping.departure = idx;
      } else if (["type_projet", "type_de_projet", "projet_type", "projecttype", "type"].includes(col)) {
        mapping.projectType = idx;
      } else if (["projet", "project", "intitule", "cours"].includes(col)) {
        mapping.projectName = idx;
      } else if (["ue", "code_ue", "ue_code"].includes(col)) {
        mapping.teachingUnit = idx;
      } else if (["espace", "workspace", "lieu", "salle"].includes(col)) {
        mapping.workspace = idx;
      } else if (["commentaires", "commentaire", "notes", "comments", "remarques"].includes(col)) {
        mapping.comments = idx;
      }
    });

    return mapping;
  }

  /**
   * Analyse et prévisualisation d'un import CSV avant exécution
   */
  async analyzeImport(csvText, options = {}) {
    const rawRows = this.parseCsvText(csvText);
    if (rawRows.length < 2) {
      throw new Error("Le fichier CSV est vide ou ne contient aucune ligne de données après l'en-tête.");
    }

    const headerRow = rawRows[0];
    const dataRows = rawRows.slice(1);
    const colMap = this.mapHeaders(headerRow);

    if (colMap.surname === undefined || colMap.name === undefined || colMap.email === undefined) {
      throw new Error(
        "Colonnes obligatoires manquantes dans le CSV : 'nom', 'prenom' et 'email' doivent être présents."
      );
    }

    // Récupération des données de référence en base pour les résolutions
    const allUsers = await prisma.user.findMany({
      select: { id: true, name: true, surname: true, email: true, usertypeId: true },
    });
    const allProjectTypes = await prisma.projecttype.findMany();
    const allWorkspaces = await prisma.workspace.findMany();
    const allTeachingUnits = await prisma.teachingUnit.findMany();
    const allUserTypes = await prisma.usertype.findMany();

    // Map pour recherche rapide par e-mail en minuscules
    const usersByEmail = new Map();
    // Map pour recherche par Nom + Prénom (homonymes potentiels)
    const usersByName = new Map();

    allUsers.forEach((u) => {
      const emailKey = u.email.toLowerCase().trim();
      usersByEmail.set(emailKey, u);

      const nameKey = `${u.surname.toLowerCase().trim()}|${u.name.toLowerCase().trim()}`;
      if (!usersByName.has(nameKey)) {
        usersByName.set(nameKey, []);
      }
      usersByName.get(nameKey).push(u);
    });

    const parsedItems = [];
    let readyCount = 0;
    let newUsersCount = 0;
    let existingUsersCount = 0;
    let homonymWarningCount = 0;
    let errorCount = 0;

    // Détection ou fallback des options globales
    const defaultDateStr = options.defaultDate || moment().format("YYYY-MM-DD");
    const defaultArrivalStr = options.defaultArrival || "14:00";
    const defaultDepartureStr = options.defaultDeparture || "17:00";
    const defaultProjectTypeName = options.defaultProjectType || "Academic";
    const defaultWorkspaceId = options.defaultWorkspaceId ? Number(options.defaultWorkspaceId) : null;
    const defaultUserTypeId = options.defaultUserTypeId ? Number(options.defaultUserTypeId) : (allUserTypes[0]?.id || 1);

    for (let index = 0; index < dataRows.length; index++) {
      const row = dataRows[index];
      const rowNum = index + 2; // +1 pour 1-indexé, +1 pour la ligne d'en-tête

      const surname = (row[colMap.surname] || "").trim();
      const name = (row[colMap.name] || "").trim();
      const email = (row[colMap.email] || "").trim().toLowerCase();

      const itemErrors = [];
      const itemWarnings = [];

      if (!surname) itemErrors.push("Nom manquant");
      if (!name) itemErrors.push("Prénom manquant");
      if (!email) {
        itemErrors.push("E-mail manquant");
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        itemErrors.push("Format d'e-mail invalide");
      }

      // Horaires et dates
      const dateStr = (colMap.date !== undefined && row[colMap.date] ? row[colMap.date].trim() : defaultDateStr);
      const arrivalTimeStr = (colMap.arrival !== undefined && row[colMap.arrival] ? row[colMap.arrival].trim() : defaultArrivalStr);
      const departureTimeStr = (colMap.departure !== undefined && row[colMap.departure] ? row[colMap.departure].trim() : defaultDepartureStr);

      // Validation de la date
      let parsedDate = moment(dateStr, ["YYYY-MM-DD", "DD/MM/YYYY", "DD-MM-YYYY", "YYYY/MM/DD"], true);
      if (!parsedDate.isValid()) {
        parsedDate = moment(defaultDateStr);
        itemWarnings.push(`Format de date "${dateStr}" non reconnu, date par défaut (${parsedDate.format("DD/MM/YYYY")}) utilisée`);
      }

      // Validation des heures
      const arrivalMoment = this.combineDateAndTime(parsedDate, arrivalTimeStr);
      const departureMoment = departureTimeStr ? this.combineDateAndTime(parsedDate, departureTimeStr) : null;

      if (!arrivalMoment.isValid()) {
        itemErrors.push(`Heure d'arrivée invalide : "${arrivalTimeStr}"`);
      }
      if (departureMoment && !departureMoment.isValid()) {
        itemErrors.push(`Heure de départ invalide : "${departureTimeStr}"`);
      }
      if (arrivalMoment.isValid() && departureMoment && departureMoment.isValid() && departureMoment.isBefore(arrivalMoment)) {
        itemWarnings.push("L'heure de départ est antérieure à l'heure d'arrivée");
      }

      // Résolution usager & détection homonymes
      let userStatus = "NEW_USER";
      let matchedUser = null;
      let homonymUser = null;

      if (email && usersByEmail.has(email)) {
        matchedUser = usersByEmail.get(email);
        userStatus = "EXISTING_USER";
        existingUsersCount++;
      } else if (surname && name) {
        const nameKey = `${surname.toLowerCase()}|${name.toLowerCase()}`;
        if (usersByName.has(nameKey)) {
          const homonyms = usersByName.get(nameKey);
          homonymUser = homonyms[0];
          userStatus = "HOMONYM_WARNING";
          itemWarnings.push(
            `Attention : Un compte existe déjà pour "${name} ${surname}" avec l'adresse "${homonymUser.email}". Un nouveau compte sera créé pour "${email}".`
          );
          homonymWarningCount++;
          newUsersCount++;
        } else {
          userStatus = "NEW_USER";
          newUsersCount++;
        }
      } else {
        userStatus = "NEW_USER";
        newUsersCount++;
      }

      // Résolution du type de projet
      const rawProjectTypeName = (colMap.projectType !== undefined && row[colMap.projectType] ? row[colMap.projectType].trim() : "") || defaultProjectTypeName;
      const matchedProjectType = allProjectTypes.find(
        (pt) => pt.name.toLowerCase() === rawProjectTypeName.toLowerCase()
      ) || null;

      // Résolution du nom de projet / intitulé
      const projectName = (colMap.projectName !== undefined && row[colMap.projectName] ? row[colMap.projectName].trim() : "") || rawProjectTypeName;

      // Résolution de l'UE
      const rawUe = colMap.teachingUnit !== undefined && row[colMap.teachingUnit] ? row[colMap.teachingUnit].trim() : "";
      const matchedUe = rawUe
        ? allTeachingUnits.find(
            (ue) => ue.code.toLowerCase() === rawUe.toLowerCase() || ue.name.toLowerCase() === rawUe.toLowerCase()
          ) || null
        : null;

      // Résolution de l'espace
      const rawWorkspace = colMap.workspace !== undefined && row[colMap.workspace] ? row[colMap.workspace].trim() : "";
      let workspaceId = defaultWorkspaceId;
      if (rawWorkspace) {
        const matchedWs = allWorkspaces.find(
          (ws) => ws.name.toLowerCase() === rawWorkspace.toLowerCase()
        );
        if (matchedWs) {
          workspaceId = matchedWs.id;
        }
      }

      const comments = colMap.comments !== undefined && row[colMap.comments] ? row[colMap.comments].trim() : "";

      if (itemErrors.length > 0) {
        errorCount++;
      } else {
        readyCount++;
      }

      parsedItems.push({
        rowNum,
        name,
        surname,
        email,
        userStatus,
        matchedUserId: matchedUser ? matchedUser.id : null,
        homonymEmail: homonymUser ? homonymUser.email : null,
        date: parsedDate.format("YYYY-MM-DD"),
        arrival: arrivalMoment.isValid() ? arrivalMoment.format("YYYY-MM-DD HH:mm:ss") : null,
        departure: departureMoment && departureMoment.isValid() ? departureMoment.format("YYYY-MM-DD HH:mm:ss") : null,
        displayArrival: arrivalMoment.isValid() ? arrivalMoment.format("HH:mm") : arrivalTimeStr,
        displayDeparture: departureMoment && departureMoment.isValid() ? departureMoment.format("HH:mm") : (departureTimeStr || "-"),
        projectTypeName: matchedProjectType ? matchedProjectType.name : rawProjectTypeName,
        projectName,
        teachingUnitId: matchedUe ? matchedUe.id : null,
        teachingUnitCode: matchedUe ? matchedUe.code : (rawUe || null),
        workspaceId,
        comments,
        errors: itemErrors,
        warnings: itemWarnings,
        isValid: itemErrors.length === 0,
      });
    }

    return {
      totalRows: dataRows.length,
      readyCount,
      newUsersCount,
      existingUsersCount,
      homonymWarningCount,
      errorCount,
      items: parsedItems,
      defaultOptions: {
        defaultDate: defaultDateStr,
        defaultArrival: defaultArrivalStr,
        defaultDeparture: defaultDepartureStr,
        defaultProjectType: defaultProjectTypeName,
        defaultWorkspaceId,
        defaultUserTypeId,
      },
    };
  }

  /**
   * Combine une date moment et une chaîne d'heure (ex: "14:00", "14h30", "14:00:00")
   */
  combineDateAndTime(dateMoment, timeStr) {
    if (!timeStr) return moment.invalid();
    const cleanTime = timeStr.trim().replace(/h/i, ":");
    const timeMoment = moment(cleanTime, ["HH:mm:ss", "HH:mm", "H:mm"], true);
    if (!timeMoment.isValid()) return moment.invalid();

    const result = dateMoment.clone();
    result.hour(timeMoment.hour());
    result.minute(timeMoment.minute());
    result.second(timeMoment.second() || 0);
    return result;
  }

  /**
   * Exécution de l'importation en base de données MariaDB
   */
  async executeImport(items, options = {}, sessionUser = "Admin") {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("Aucune donnée valide à importer.");
    }

    // Filtrer uniquement les lignes valides
    const validItems = items.filter((i) => i.isValid);
    if (validItems.length === 0) {
      throw new Error("Toutes les lignes sélectionnées contiennent des erreurs bloquantes.");
    }

    const defaultUserTypeId = options.defaultUserTypeId ? Number(options.defaultUserTypeId) : 1;
    const acceptTerms = options.acceptTerms === true || options.acceptTerms === "true";

    let createdUsersCount = 0;
    let createdHistoriesCount = 0;
    let existingUsersCount = 0;

    // Cache local pour éviter les doublons au sein du même import
    const userCache = new Map();

    for (const item of validItems) {
      let userId = item.matchedUserId;

      // 1. Récupération ou création de l'usager
      if (!userId && userCache.has(item.email)) {
        userId = userCache.get(item.email);
      }

      if (!userId) {
        // Vérifier à nouveau en DB si créé précédemment dans ce batch
        const existing = await prisma.user.findUnique({ where: { email: item.email } });
        if (existing) {
          userId = existing.id;
          existingUsersCount++;
        } else {
          // Création minimale du nouvel usager
          const token = uuidv4();
          const newUser = await prisma.user.create({
            data: {
              name: item.name,
              surname: item.surname,
              email: item.email,
              usertypeId: defaultUserTypeId,
              token: token,
              termsAccepted: acceptTerms,
              balance: 0.0,
            },
          });
          userId = newUser.id;
          createdUsersCount++;
        }
        userCache.set(item.email, userId);
      } else {
        existingUsersCount++;
      }

      // 2. Résolution ou création du type de projet
      const projectTypeName = item.projectTypeName || "Academic";
      let projectType = await prisma.projecttype.findUnique({
        where: { name: projectTypeName },
      });
      if (!projectType) {
        projectType = await prisma.projecttype.create({
          data: { name: projectTypeName },
        });
      }

      // 3. Résolution ou création du Projet et UserProject
      const projectUrl = item.projectName || `${projectTypeName} - Séance du ${item.date}`;
      let project = await prisma.project.findFirst({
        where: {
          url: projectUrl,
          projecttypeId: projectType.id,
        },
      });
      if (!project) {
        project = await prisma.project.create({
          data: {
            url: projectUrl,
            projecttypeId: projectType.id,
            teachingUnitId: item.teachingUnitId || null,
            active: true,
          },
        });
      }

      // Liaison UserProject
      let userProject = await prisma.userProject.findUnique({
        where: {
          userId_projectId: {
            userId: userId,
            projectId: project.id,
          },
        },
      });
      if (!userProject) {
        userProject = await prisma.userProject.create({
          data: {
            userId: userId,
            projectId: project.id,
          },
        });
      }

      // 4. Création de l'enregistrement History
      const arrivalDate = item.arrival ? new Date(item.arrival) : new Date();
      const departureDate = item.departure ? new Date(item.departure) : null;

      await prisma.history.create({
        data: {
          userId: userId,
          userprojectId: userProject.id,
          teachingUnitId: item.teachingUnitId || null,
          unregisteredUeName: !item.teachingUnitId && item.teachingUnitCode ? item.teachingUnitCode : null,
          workspaceId: item.workspaceId || null,
          comments: item.comments || `Importation séance : ${projectUrl}`,
          arrival: arrivalDate,
          departure: departureDate,
        },
      });

      createdHistoriesCount++;
    }

    logger.logThat(
      `Importation CSV d'historique exécutée par ${sessionUser} : ${createdHistoriesCount} visites créées, ${createdUsersCount} nouveaux usagers créés.`
    );

    return {
      success: true,
      createdHistoriesCount,
      createdUsersCount,
      existingUsersCount,
      message: `${createdHistoriesCount} visite(s) enregistrée(s) avec succès (${createdUsersCount} nouveau(x) compte(s) créé(s), ${existingUsersCount} compte(s) existant(s) associé(s)).`,
    };
  }

  /**
   * Génération d'un fichier CSV modèle prêt à être complété
   */
  generateCsvTemplate() {
    const headers = [
      "nom",
      "prenom",
      "email",
      "date",
      "arrivee",
      "depart",
      "type_projet",
      "projet",
      "ue_code",
      "espace",
      "commentaires",
    ];

    const sampleRows = [
      [
        "Dupont",
        "Marie",
        "marie.dupont@etu.sorbonne-universite.fr",
        moment().format("YYYY-MM-DD"),
        "14:00",
        "17:00",
        "Academic",
        "LU3IN013 - Projet Robotique",
        "LU3IN013",
        "Atelier Principal",
        "Séance de travaux pratiques n°1",
      ],
      [
        "Martin",
        "Lucas",
        "lucas.martin@etu.sorbonne-universite.fr",
        moment().format("YYYY-MM-DD"),
        "14:00",
        "17:00",
        "Academic",
        "LU3IN013 - Projet Robotique",
        "LU3IN013",
        "Atelier Principal",
        "Séance de travaux pratiques n°1",
      ],
      [
        "Dubois",
        "Camille",
        "camille.dubois@etu.sorbonne-universite.fr",
        moment().format("YYYY-MM-DD"),
        "09:30",
        "12:30",
        "Academic",
        "LU2PY001 - Électronique",
        "LU2PY001",
        "Salle Électronique",
        "Conception de circuit imprimé",
      ],
    ];

    const lines = [headers.join(",")];
    sampleRows.forEach((row) => {
      lines.push(
        row
          .map((val) => {
            if (val.includes(",") || val.includes('"') || val.includes(" ")) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
          })
          .join(",")
      );
    });

    return lines.join("\n");
  }
}

module.exports = new HistoryImportService();
