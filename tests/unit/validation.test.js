const {
  createUserSchema,
  updateUserSchema,
  createVisitSchema,
  creditSchema,
  adjustBalanceSchema,
  updateStaffSchema,
  activitySchema,
  loginSchema,
  registerStaffSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
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
    test("accepts strictly positive decimal amounts (with dot or comma)", () => {
      const creditRes = creditSchema.safeParse({ userid: "10", money: "15.50" });
      expect(creditRes.success).toBe(true);
      expect(creditRes.data.userid).toBe(10);
      expect(creditRes.data.money).toBe(15.5);

      const commaRes = creditSchema.safeParse({ userid: "10", money: "12,50" });
      expect(commaRes.success).toBe(true);
      expect(commaRes.data.money).toBe(12.5);
    });

    test("rejects zero and negative amounts on credit route (R-007)", () => {
      expect(creditSchema.safeParse({ userid: "10", money: "0" }).success).toBe(false);
      expect(creditSchema.safeParse({ userid: "10", money: "-5.25" }).success).toBe(false);
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

  describe("adjustBalanceSchema", () => {
    test("computes signed delta for admin debit and credit operations", () => {
      const debitRes = adjustBalanceSchema.safeParse({
        userid: "10",
        operation: "debit",
        amount: "7,50",
        reason: "Correction caisse atelier",
      });
      expect(debitRes.success).toBe(true);
      expect(debitRes.data.delta).toBe(-7.5);

      const creditRes = adjustBalanceSchema.safeParse({
        userid: "10",
        operation: "credit",
        amount: "12.00",
        reason: "Avoir impression annulée",
      });
      expect(creditRes.success).toBe(true);
      expect(creditRes.data.delta).toBe(12);

      const signedRes = adjustBalanceSchema.safeParse({
        userid: "10",
        amount: "-3.25",
        reason: "Régularisation directe",
      });
      expect(signedRes.success).toBe(true);
      expect(signedRes.data.delta).toBe(-3.25);
    });

    test("rejects zero amount and missing reason", () => {
      expect(adjustBalanceSchema.safeParse({ userid: "10", amount: "0", reason: "Test" }).success).toBe(false);
      expect(adjustBalanceSchema.safeParse({ userid: "10", amount: "5", reason: "ab" }).success).toBe(false);
    });
  });

  describe("updateStaffSchema", () => {
    test("accepts allowed staff roles (admin, user, staff)", () => {
      for (const role of ["admin", "user", "staff"]) {
        const res = updateStaffSchema.safeParse({
          id: "4",
          username: "compte_test",
          email: "staff@fablab.fr",
          role,
          approved: "on",
        });
        expect(res.success).toBe(true);
        expect(res.data.role).toBe(role);
        expect(res.data.approved).toBe(true);
      }
    });

    test("rejects unknown roles outside whitelist", () => {
      const res = updateStaffSchema.safeParse({
        id: "4",
        username: "compte_test",
        email: "staff@fablab.fr",
        role: "superadmin",
      });
      expect(res.success).toBe(false);
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

    test("keeps accepting existing accounts whose passwords are shorter than 8 characters", () => {
      const result = loginSchema.safeParse({ username: "legacy", password: "12345" });
      expect(result.success).toBe(true);
    });
  });

  describe("registerStaffSchema", () => {
    test("accepts valid staff registration payload with 8+ char password", () => {
      const result = registerStaffSchema.safeParse({
        username: "new_facilitator",
        mail: "facilitator@fablab.fr",
        password: "Password1",
      });
      expect(result.success).toBe(true);
    });

    test("rejects password shorter than 8 characters (7 chars)", () => {
      const result = registerStaffSchema.safeParse({
        username: "new_facilitator",
        mail: "facilitator@fablab.fr",
        password: "1234567",
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain("8 caractères");
    });
  });

  describe("requestPasswordResetSchema", () => {
    test("validates and normalizes valid email", () => {
      const result = requestPasswordResetSchema.safeParse({ mail: "  Staff@Fablab.FR " });
      expect(result.success).toBe(true);
      expect(result.data.mail).toBe("staff@fablab.fr");
    });

    test("rejects invalid email", () => {
      const result = requestPasswordResetSchema.safeParse({ mail: "pas-un-email" });
      expect(result.success).toBe(false);
    });
  });

  describe("resetPasswordSchema", () => {
    const validToken = "a".repeat(64);

    test("accepts valid 64-hex token and matching 8+ char password", () => {
      const result = resetPasswordSchema.safeParse({
        token: validToken,
        password: "Password123",
        password_verif: "Password123",
      });
      expect(result.success).toBe(true);
    });

    test("rejects legacy id-only payload without a valid token", () => {
      const result = resetPasswordSchema.safeParse({
        id: "1",
        password: "Password123",
        password_verif: "Password123",
      });
      expect(result.success).toBe(false);
    });

    test("rejects passwords shorter than 8 characters", () => {
      const result = resetPasswordSchema.safeParse({
        token: validToken,
        password: "1234567",
        password_verif: "1234567",
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain("8 caractères");
    });

    test("rejects mismatched confirmation password", () => {
      const result = resetPasswordSchema.safeParse({
        token: validToken,
        password: "Password123",
        password_verif: "Different123",
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toContain("password_verif");
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
