const fs = require("fs");
const path = require("path");
const {
  validateBody,
  validateParams,
  validateQuery,
} = require("../../middleware/validate.js");
const schemas = require("../../schemas");

function createMockReqRes({ body = {}, params = {}, query = {}, headers = {}, isApi = false } = {}) {
  const req = {
    body,
    params,
    query,
    headers: {
      ...(isApi ? { accept: "application/json" } : {}),
      ...headers,
    },
    baseUrl: isApi ? "/api" : "/admin",
    originalUrl: isApi ? "/api/test" : "/admin/test",
    session: {},
    xhr: false,
  };
  const res = {
    statusCode: 200,
    jsonBody: null,
    redirectTarget: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonBody = payload;
      return this;
    },
    redirect(target) {
      this.redirectTarget = target;
      return this;
    },
  };
  const next = jest.fn();
  return { req, res, next };
}

describe("R-019: Zod v4 migration, strict stripping & HTTP validation", () => {
  describe("Static guards across schemas/ and routes/", () => {
    test("no schema file uses deprecated Zod v3 required_error or invalid_type_error", () => {
      const schemasDir = path.join(__dirname, "../../schemas");
      const files = fs.readdirSync(schemasDir).filter((f) => f.endsWith(".js"));
      const offenders = [];

      for (const file of files) {
        const content = fs.readFileSync(path.join(schemasDir, file), "utf8");
        if (/\b(required_error|invalid_type_error)\b/.test(content)) {
          offenders.push(file);
        }
      }

      expect(offenders).toEqual([]);
    });

    test("every route file with router.post() uses middleware/validate.js", () => {
      const routesDir = path.join(__dirname, "../../routes");
      const walk = (dir) => {
        let out = [];
        for (const entry of fs.readdirSync(dir)) {
          const full = path.join(dir, entry);
          if (fs.statSync(full).isDirectory()) out = out.concat(walk(full));
          else if (full.endsWith(".js")) out.push(full);
        }
        return out;
      };

      const missingValidation = [];
      for (const file of walk(routesDir)) {
        const src = fs.readFileSync(file, "utf8");
        if (/router\.post\(/.test(src) && !/validate(Body|Params|Query)/.test(src)) {
          missingValidation.push(path.relative(path.join(__dirname, "../.."), file));
        }
      }

      expect(missingValidation).toEqual([]);
    });
  });

  describe("Zod v4 French error messages (no English fallback on missing fields)", () => {
    const missingFieldCases = [
      ["loginSchema", schemas.loginSchema, {}, "Veuillez saisir"],
      ["registerStaffSchema", schemas.registerStaffSchema, {}, "requis"],
      ["createUserSchema", schemas.createUserSchema, {}, "obligatoire"],
      ["updateUserSchema", schemas.updateUserSchema, {}, "obligatoire"],
      ["addConsumableSchema", schemas.addConsumableSchema, {}, "obligatoire"],
      ["addEquipmentSchema", schemas.addEquipmentSchema, {}, "obligatoire"],
      ["createVisitSchema", schemas.createVisitSchema, {}, "invalide"],
      ["creditSchema", schemas.creditSchema, {}, "invalide"],
      ["inventoryCheckoutSchema", schemas.inventoryCheckoutSchema, {}, "obligatoire"],
      ["reportIssueSchema", schemas.reportIssueSchema, {}, "invalide"],
      ["createMaintenanceSchema", schemas.createMaintenanceSchema, {}, "invalide"],
      ["createWarningSchema", schemas.createWarningSchema, {}, "invalide"],
      ["rfidScanSchema", schemas.rfidScanSchema, {}, "requis"],
      ["reportBugSchema", schemas.reportBugSchema, {}, "signalement"],
      ["createUeSchema", schemas.createUeSchema, {}, "obligatoire"],
      ["aiQuerySchema", schemas.aiQuerySchema, {}, "question"],
    ];

    test.each(missingFieldCases)(
      "%s returns a French error message on missing input",
      (_name, schema, payload, expectedFragment) => {
        const res = schema.safeParse(payload);
        expect(res.success).toBe(false);
        const firstMsg = res.error.issues[0].message;
        expect(firstMsg).not.toMatch(/^Invalid input/i);
        expect(firstMsg.toLowerCase()).toContain(expectedFragment.toLowerCase());
      },
    );
  });

  describe("Strict stripping against mass-assignment in validateBody", () => {
    test("strips unknown injected fields from req.body (e.g. role, balance, approved)", () => {
      const mw = validateBody(schemas.createUserSchema, { redirectUrl: "/fabtrack" });
      const { req, res, next } = createMockReqRes({
        body: {
          newname: "Ada",
          newsurname: "Lovelace",
          newemail: "ada@example.org",
          newusertype: "2",
          role: "admin",
          balance: 99999,
          isExpert: true,
          __extra: "malicious",
        },
      });

      mw(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.body.newname).toBe("Ada");
      expect(req.body.newusertype).toBe(2);
      expect(req.body).not.toHaveProperty("role");
      expect(req.body).not.toHaveProperty("balance");
      expect(req.body).not.toHaveProperty("isExpert");
      expect(req.body).not.toHaveProperty("__extra");
      expect(req.validatedBody).toEqual(req.body);
    });

    test("preserves honeypot field in registerStaffSchema while stripping unknown fields", () => {
      const mw = validateBody(schemas.registerStaffSchema, { redirectUrl: "/register" });
      const { req, res, next } = createMockReqRes({
        body: {
          username: "bot_user",
          mail: "bot@example.org",
          password: "Password123",
          honeypot: "i-am-a-bot",
          role: "admin",
          approved: true,
        },
      });

      mw(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.body.honeypot).toBe("i-am-a-bot");
      expect(req.body).not.toHaveProperty("role");
      expect(req.body).not.toHaveProperty("approved");
    });

    test("preserves isExpert and termsAccepted checkboxes in updateUserSchema while stripping balance", () => {
      const mw = validateBody(schemas.updateUserSchema, { redirectUrl: "/users/manage" });
      const { req, res, next } = createMockReqRes({
        body: {
          name: "Marie",
          surname: "Curie",
          email: "marie@example.org",
          usertype: "1",
          isExpert: "on",
          termsAccepted: "true",
          newsletter: "on",
          balance: 500,
          role: "admin",
        },
      });

      mw(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.body.isExpert).toBe(true);
      expect(req.body.termsAccepted).toBe(true);
      expect(req.body.newsletter).toBe(true);
      expect(req.body).not.toHaveProperty("balance");
      expect(req.body).not.toHaveProperty("role");
    });
  });

  describe("validateParams and validateQuery", () => {
    test("validateParams rejects NaN, zero, negative and float IDs without 500", () => {
      const mw = validateParams(schemas.idParamSchema, { redirectUrl: "/admin/machines/manage" });

      for (const badId of ["abc", "0", "-3", "1.5", ""]) {
        const { req, res, next } = createMockReqRes({ params: { id: badId } });
        mw(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.redirectTarget).toBe("/admin/machines/manage");
        expect(req.session.notification).toMatch(/^Error: /);
      }
    });

    test("validateParams coerces positive numeric string to integer and strips extra params", () => {
      const mw = validateParams(schemas.idParamSchema, { isApi: true });
      const { req, res, next } = createMockReqRes({
        params: { id: "42", stray: "nope" },
        isApi: true,
      });

      mw(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.params).toEqual({ id: 42 });
      expect(req.validatedParams).toEqual({ id: 42 });
    });

    test("validateQuery rejects impossible calendar dates and negative page numbers", () => {
      const statsMw = validateQuery(schemas.statisticsQuerySchema, { isApi: true });
      const badDate = createMockReqRes({
        query: { startDate: "2026-02-31", period: "custom" },
        isApi: true,
      });
      statsMw(badDate.req, badDate.res, badDate.next);
      expect(badDate.next).not.toHaveBeenCalled();
      expect(badDate.res.statusCode).toBe(400);
      expect(badDate.res.jsonBody.error).toContain("date");

      const invMw = validateQuery(schemas.inventoryMovementsQuerySchema, { isApi: true });
      const badPage = createMockReqRes({ query: { page: "-2" }, isApi: true });
      invMw(badPage.req, badPage.res, badPage.next);
      expect(badPage.next).not.toHaveBeenCalled();
      expect(badPage.res.statusCode).toBe(400);

      const goodStats = createMockReqRes({
        query: { workspaceId: "2", period: "this_month", startDate: "2026-11-01", endDate: "2026-11-22" },
        isApi: true,
      });
      statsMw(goodStats.req, goodStats.res, goodStats.next);
      expect(goodStats.next).toHaveBeenCalledTimes(1);
    });

    test("all GET query schemas accept an empty query object (prevents redirect loops)", () => {
      const getQuerySchemas = [
        schemas.inventoryMovementsQuerySchema,
        schemas.sorbonneFilterQuerySchema,
        schemas.communicationQuerySchema,
        schemas.statisticsQuerySchema,
        schemas.statisticsExportQuerySchema,
        schemas.ueExportQuerySchema,
        schemas.reportIssueQuerySchema,
        schemas.checkRfidQuerySchema,
        schemas.projectDocumentationQuerySchema,
      ];

      for (const schema of getQuerySchemas) {
        expect(schema.safeParse({}).success).toBe(true);
      }
    });
  });

  describe("MariaDB .max() bounds & dynamic birthYear", () => {
    test("rejects strings exceeding MariaDB VarChar column limits", () => {
      expect(
        schemas.createUserSchema.safeParse({
          newname: "a".repeat(256),
          newsurname: "Test",
          newemail: "ok@example.org",
          newusertype: "1",
        }).success,
      ).toBe(false);

      expect(
        schemas.createUserSchema.safeParse({
          newname: "Ada",
          newsurname: "Test",
          newemail: "ok@example.org",
          newusertype: "1",
          newrfid: "R".repeat(101),
        }).success,
      ).toBe(false);

      expect(
        schemas.addConsumableSchema.safeParse({
          name: "PLA",
          unit: "u".repeat(31),
        }).success,
      ).toBe(false);

      expect(
        schemas.createUeSchema.safeParse({
          code: "X".repeat(51),
          name: "UE Test",
        }).success,
      ).toBe(false);
    });

    test("evaluates maximum birthYear dynamically at parse time (not module load time)", () => {
      const spy = jest.spyOn(Date.prototype, "getFullYear");
      try {
        spy.mockReturnValue(2026);
        expect(
          schemas.createUserSchema.safeParse({
            newname: "Future",
            newsurname: "Baby",
            newemail: "baby@example.org",
            newusertype: "1",
            newbirthyear: "2027",
          }).success,
        ).toBe(false);

        spy.mockReturnValue(2027);
        expect(
          schemas.createUserSchema.safeParse({
            newname: "Future",
            newsurname: "Baby",
            newemail: "baby@example.org",
            newusertype: "1",
            newbirthyear: "2027",
          }).success,
        ).toBe(true);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe("Extended consumable schemas", () => {
    test("updateConsumableSchema accepts consumableid or id and normalizes both", () => {
      const res = schemas.updateConsumableSchema.safeParse({
        consumableid: "12",
        name: "Filament PLA Blanc",
        cost: "0,05",
        stock: "250",
        reorderThreshold: "50",
        unit: "g",
        stockUnit: "bobine",
        unitsPerPack: "1000",
      });
      expect(res.success).toBe(true);
      expect(res.data.id).toBe(12);
      expect(res.data.consumableid).toBe(12);
      expect(res.data.cost).toBe(0.05);
      expect(res.data.unitsPerPack).toBe(1000);
    });

    test("restockConsumableSchema enforces positive quantity or packs", () => {
      expect(
        schemas.restockConsumableSchema.safeParse({
          consumableid: "5",
          restockMode: "packs",
          packages: "2.5",
        }).success,
      ).toBe(true);

      expect(
        schemas.restockConsumableSchema.safeParse({
          consumableid: "5",
          restockMode: "units",
          quantity: "0",
        }).success,
      ).toBe(false);
    });
  });
});
