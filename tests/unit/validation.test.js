const {
  createUserSchema,
  updateUserSchema,
  createVisitSchema,
  creditSchema,
  activitySchema,
  loginSchema,
  reportIssueSchema,
  rfidScanSchema,
} = require("../../schemas");

describe("Unit: Zod Validation Schemas", () => {
  describe("createUserSchema", () => {
    test("validates a complete and correct user payload", () => {
      const validData = {
        newname: "Thomas",
        newsurname: "Pesquet",
        newemail: "thomas.pesquet@esa.int",
        newusertype: "2",
        newbirthyear: "1978",
        newcomments: "Astronaute",
        newrfid: "RFID_007",
        newnewsletter: "true",
      };

      const result = createUserSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data.newname).toBe("Thomas");
      expect(result.data.newusertype).toBe(2);
      expect(result.data.newbirthyear).toBe(1978);
      expect(result.data.newnewsletter).toBe(true);
    });

    test("rejects when required fields are missing or invalid", () => {
      const invalidData = {
        newname: "",
        newsurname: "Test",
        newemail: "not-an-email",
        newusertype: "",
      };

      const result = createUserSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      const errors = result.error.issues.map((i) => i.path.join("."));
      expect(errors).toContain("newname");
      expect(errors).toContain("newemail");
      expect(errors).toContain("newusertype");
    });
  });

  describe("creditSchema", () => {
    test("accepts valid decimal amounts and negative debits", () => {
      const creditRes = creditSchema.safeParse({ userid: "10", money: "15.50" });
      expect(creditRes.success).toBe(true);
      expect(creditRes.data.userid).toBe(10);
      expect(creditRes.data.money).toBe(15.5);

      const debitRes = creditSchema.safeParse({ userid: "10", money: "-5.25" });
      expect(debitRes.success).toBe(true);
      expect(debitRes.data.money).toBe(-5.25);

      const commaRes = creditSchema.safeParse({ userid: "10", money: "12,50" });
      expect(commaRes.success).toBe(true);
      expect(commaRes.data.money).toBe(12.5);
    });

    test("rejects non-numeric money values (NaN protection)", () => {
      const result = creditSchema.safeParse({ userid: "10", money: "abc" });
      expect(result.success).toBe(false);
    });

    test("rejects missing user ID", () => {
      const result = creditSchema.safeParse({ money: "10" });
      expect(result.success).toBe(false);
    });
  });

  describe("loginSchema", () => {
    test("accepts valid username and password", () => {
      const result = loginSchema.safeParse({ username: "admin", password: "securepassword" });
      expect(result.success).toBe(true);
    });

    test("rejects empty username or password", () => {
      const result = loginSchema.safeParse({ username: "", password: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("reportIssueSchema", () => {
    test("validates valid issue report", () => {
      const result = reportIssueSchema.safeParse({
        machineId: "3",
        description: "Buse bouchée sur l'Ultimaker",
        reporterName: "Jean",
        reporterEmail: "jean@example.com",
      });
      expect(result.success).toBe(true);
      expect(result.data.machineId).toBe(3);
    });

    test("rejects description too short or invalid email", () => {
      const shortDesc = reportIssueSchema.safeParse({
        machineId: "3",
        description: "hs",
      });
      expect(shortDesc.success).toBe(false);

      const badEmail = reportIssueSchema.safeParse({
        machineId: "3",
        description: "Plateau ne chauffe plus",
        reporterEmail: "mauvais-format",
      });
      expect(badEmail.success).toBe(false);
    });
  });

  describe("rfidScanSchema", () => {
    test("accepts valid RFID string", () => {
      const result = rfidScanSchema.safeParse({ rfid: "A1B2C3D4", workspaceId: "1" });
      expect(result.success).toBe(true);
      expect(result.data.rfid).toBe("A1B2C3D4");
      expect(result.data.workspaceId).toBe(1);
    });

    test("rejects empty or missing RFID", () => {
      const result = rfidScanSchema.safeParse({ rfid: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("createVisitSchema", () => {
    test("coerces userid and handles optional project fields", () => {
      const result = createVisitSchema.safeParse({
        userid: "42",
        comments: "Découpe laser 3mm",
      });
      expect(result.success).toBe(true);
      expect(result.data.userid).toBe(42);
      expect(result.data.comments).toBe("Découpe laser 3mm");
    });
  });
});
