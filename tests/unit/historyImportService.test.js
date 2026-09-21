const historyImportService = require("../../services/historyImportService");
const { prisma } = require("../../utilities/db");
const moment = require("moment");

describe("Unit: HistoryImportService - CSV Parsing, Reconciliation & Import Logic", () => {
  describe("parseCsvText()", () => {
    test("parses standard comma-delimited CSV", () => {
      const csv = "nom,prenom,email\nDupont,Marie,marie@example.com\nMartin,Pierre,pierre@example.com";
      const rows = historyImportService.parseCsvText(csv);
      expect(rows.length).toBe(3);
      expect(rows[0]).toEqual(["nom", "prenom", "email"]);
      expect(rows[1]).toEqual(["Dupont", "Marie", "marie@example.com"]);
      expect(rows[2]).toEqual(["Martin", "Pierre", "pierre@example.com"]);
    });

    test("auto-detects semicolon delimiter", () => {
      const csv = "nom;prenom;email;date\nDupont;Marie;marie@example.com;2026-09-21";
      const rows = historyImportService.parseCsvText(csv);
      expect(rows.length).toBe(2);
      expect(rows[0]).toEqual(["nom", "prenom", "email", "date"]);
      expect(rows[1]).toEqual(["Dupont", "Marie", "marie@example.com", "2026-09-21"]);
    });

    test("strips UTF-8 BOM if present", () => {
      const csv = "\uFEFFnom,prenom,email\nTest,User,test@example.com";
      const rows = historyImportService.parseCsvText(csv);
      expect(rows[0][0]).toBe("nom");
    });

    test("handles quoted fields with commas and escaped quotes", () => {
      const csv = 'nom,prenom,commentaires\n"Dupont, Jr.","Marie","Projet ""Robotique"" TP1"';
      const rows = historyImportService.parseCsvText(csv);
      expect(rows.length).toBe(2);
      expect(rows[1][0]).toBe("Dupont, Jr.");
      expect(rows[1][1]).toBe("Marie");
      expect(rows[1][2]).toBe('Projet "Robotique" TP1');
    });

    test("returns empty array on empty input", () => {
      expect(historyImportService.parseCsvText("")).toEqual([]);
      expect(historyImportService.parseCsvText(null)).toEqual([]);
    });
  });

  describe("mapHeaders()", () => {
    test("maps French column names", () => {
      const headers = ["Nom", "Prénom", "E-mail", "Date", "Arrivée", "Départ", "Type de projet"];
      const map = historyImportService.mapHeaders(headers);
      expect(map.surname).toBe(0);
      expect(map.name).toBe(1);
      expect(map.email).toBe(2);
      expect(map.date).toBe(3);
      expect(map.arrival).toBe(4);
      expect(map.departure).toBe(5);
      expect(map.projectType).toBe(6);
    });

    test("maps English column names and synonyms", () => {
      const headers = ["last_name", "first_name", "mail", "start_time", "end_time"];
      const map = historyImportService.mapHeaders(headers);
      expect(map.surname).toBe(0);
      expect(map.name).toBe(1);
      expect(map.email).toBe(2);
      expect(map.arrival).toBe(3);
      expect(map.departure).toBe(4);
    });
  });

  describe("combineDateAndTime()", () => {
    test("combines standard date and HH:mm string", () => {
      const dateMoment = moment("2026-09-21");
      const combined = historyImportService.combineDateAndTime(dateMoment, "14:30");
      expect(combined.isValid()).toBe(true);
      expect(combined.format("YYYY-MM-DD HH:mm")).toBe("2026-09-21 14:30");
    });

    test("handles '14h30' syntax", () => {
      const dateMoment = moment("2026-09-21");
      const combined = historyImportService.combineDateAndTime(dateMoment, "14h30");
      expect(combined.isValid()).toBe(true);
      expect(combined.format("YYYY-MM-DD HH:mm")).toBe("2026-09-21 14:30");
    });

    test("returns invalid moment for invalid time", () => {
      const dateMoment = moment("2026-09-21");
      const combined = historyImportService.combineDateAndTime(dateMoment, "invalid");
      expect(combined.isValid()).toBe(false);
    });
  });

  describe("generateCsvTemplate()", () => {
    test("produces a valid CSV string with headers and sample rows", () => {
      const template = historyImportService.generateCsvTemplate();
      expect(typeof template).toBe("string");
      expect(template).toContain("nom,prenom,email,date,arrivee,depart");
      expect(template).toContain("marie.dupont@etu.sorbonne-universite.fr");
    });
  });

  describe("analyzeImport() and Reconciliation logic", () => {
    const testEmail = `existing-${Date.now()}@example.org`;
    const homonymEmail = `other-${Date.now()}@example.org`;
    let existingUser;
    let studentUserType;

    beforeAll(async () => {
      studentUserType = await prisma.usertype.findFirst();
      if (!studentUserType) {
        studentUserType = await prisma.usertype.create({ data: { name: "Étudiant Test" } });
      }

      existingUser = await prisma.user.create({
        data: {
          name: "Jean",
          surname: "Valjean",
          email: testEmail,
          usertypeId: studentUserType.id,
          token: `token-${Date.now()}`,
          termsAccepted: true,
        },
      });
    });

    afterAll(async () => {
      if (existingUser) {
        await prisma.user.deleteMany({
          where: { email: { in: [testEmail, homonymEmail] } },
        });
      }
    });

    test("identifies existing user by exact email match", async () => {
      const csv = `nom,prenom,email,date,arrivee,depart\nValjean,Jean,${testEmail},2026-09-21,14:00,17:00`;
      const result = await historyImportService.analyzeImport(csv);

      expect(result.totalRows).toBe(1);
      expect(result.existingUsersCount).toBe(1);
      expect(result.newUsersCount).toBe(0);
      expect(result.items[0].userStatus).toBe("EXISTING_USER");
      expect(result.items[0].matchedUserId).toBe(existingUser.id);
      expect(result.items[0].isValid).toBe(true);
    });

    test("triggers WARNING_HOMONYM when name/surname match but email is different", async () => {
      const csv = `nom,prenom,email,date,arrivee,depart\nValjean,Jean,${homonymEmail},2026-09-21,14:00,17:00`;
      const result = await historyImportService.analyzeImport(csv);

      expect(result.totalRows).toBe(1);
      expect(result.homonymWarningCount).toBe(1);
      expect(result.newUsersCount).toBe(1);
      expect(result.items[0].userStatus).toBe("HOMONYM_WARNING");
      expect(result.items[0].homonymEmail).toBe(testEmail);
      expect(result.items[0].warnings.length).toBeGreaterThan(0);
      expect(result.items[0].isValid).toBe(true);
    });

    test("identifies brand new user when neither email nor name matches", async () => {
      const newEmail = `brandnew-${Date.now()}@example.org`;
      const csv = `nom,prenom,email,date,arrivee,depart\nCosette,Fauchelevent,${newEmail},2026-09-21,14:00,17:00`;
      const result = await historyImportService.analyzeImport(csv);

      expect(result.newUsersCount).toBe(1);
      expect(result.items[0].userStatus).toBe("NEW_USER");
      expect(result.items[0].matchedUserId).toBeNull();
      expect(result.items[0].isValid).toBe(true);
    });

    test("flags invalid rows with invalid email or missing name", async () => {
      const csv = `nom,prenom,email\n,Jean,bad-email\nDupont,,dupont@example.com`;
      const result = await historyImportService.analyzeImport(csv);

      expect(result.errorCount).toBe(2);
      expect(result.items[0].isValid).toBe(false);
      expect(result.items[0].errors).toContain("Nom manquant");
      expect(result.items[0].errors).toContain("Format d'e-mail invalide");
      expect(result.items[1].isValid).toBe(false);
      expect(result.items[1].errors).toContain("Prénom manquant");
    });
  });
});
