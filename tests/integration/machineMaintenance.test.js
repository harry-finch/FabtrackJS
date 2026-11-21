const { createMaintenanceSchema } = require("../../schemas");
const { prisma } = require("../../utilities/db");

describe("Unit: Machine Maintenance Schema & Database Operations", () => {
  let testMachineType;
  let testMachine;
  let testIssue;
  const createdMaintenanceIds = [];

  beforeAll(async () => {
    // Ensure an access level exists
    let access = await prisma.access.findFirst();
    if (!access) {
      access = await prisma.access.create({
        data: { name: "Test Access", description: "Test Access Description" },
      });
    }

    // Create a temporary machine type and machine for testing
    testMachineType = await prisma.machineType.create({
      data: {
        name: `Test Type ${Date.now()}`,
      },
    });

    testMachine = await prisma.machine.create({
      data: {
        name: `Test Machine ${Date.now()}`,
        make: "Prusa",
        model: "MK3S+",
        serialNumber: `TEST-SN-${Date.now()}`,
        machinetypeId: testMachineType.id,
        accessId: access.id,
      },
    });

    // Create an open machine issue for testing batch resolution
    testIssue = await prisma.machineIssue.create({
      data: {
        machineId: testMachine.id,
        description: "Buse bouchée",
        status: "OPEN",
        reporterName: "Staff Test",
      },
    });
  });

  afterAll(async () => {
    // Clean up created maintenances
    if (createdMaintenanceIds.length > 0) {
      await prisma.machineMaintenance.deleteMany({
        where: { id: { in: createdMaintenanceIds } },
      }).catch(() => {});
    }

    // Clean up test issue
    if (testIssue) {
      await prisma.machineIssue.delete({ where: { id: testIssue.id } }).catch(() => {});
    }

    // Clean up machine and type
    if (testMachine) {
      await prisma.machine.delete({ where: { id: testMachine.id } }).catch(() => {});
    }
    if (testMachineType) {
      await prisma.machineType.delete({ where: { id: testMachineType.id } }).catch(() => {});
    }
  });

  describe("createMaintenanceSchema Validation", () => {
    test("validates a full maintenance payload and parses types correctly", () => {
      const payload = {
        machineId: `${testMachine.id}`,
        title: "Changement de buse 0.4mm",
        type: "REPLACEMENT",
        description: "Remplacement de buse suite à colmatage",
        operator: "Alexandre",
        partsReplaced: "Buse laiton 0.4mm",
        cost: "14,90",
        maintenanceDate: "2026-09-22T10:00:00.000Z",
        resolveOpenIssues: "true",
      };

      const result = createMaintenanceSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.machineId).toBe(testMachine.id);
      expect(result.data.title).toBe("Changement de buse 0.4mm");
      expect(result.data.type).toBe("REPLACEMENT");
      expect(result.data.cost).toBe(14.9);
      expect(result.data.resolveOpenIssues).toBe(true);
      expect(result.data.maintenanceDate).toBeInstanceOf(Date);
    });

    test("applies default values for minimal payload", () => {
      const payload = {
        machineId: testMachine.id,
        title: "Nettoyage filtre et optique",
      };

      const result = createMaintenanceSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.type).toBe("PREVENTIVE");
      expect(result.data.resolveOpenIssues).toBe(false);
      expect(result.data.cost == null).toBe(true);
      expect(result.data.maintenanceDate).toBeInstanceOf(Date);
    });

    test("handles checkbox 'on' or '1' for resolveOpenIssues", () => {
      const resOn = createMaintenanceSchema.safeParse({
        machineId: testMachine.id,
        title: "Maintenance",
        resolveOpenIssues: "on",
      });
      expect(resOn.success).toBe(true);
      expect(resOn.data.resolveOpenIssues).toBe(true);

      const resOne = createMaintenanceSchema.safeParse({
        machineId: testMachine.id,
        title: "Maintenance",
        resolveOpenIssues: "1",
      });
      expect(resOne.success).toBe(true);
      expect(resOne.data.resolveOpenIssues).toBe(true);
    });

    test("rejects invalid machineId or missing title", () => {
      const invalidPayload = {
        machineId: "invalid",
        title: "A", // too short (< 2)
      };

      const result = createMaintenanceSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
      const errors = result.error.issues.map((i) => i.path.join("."));
      expect(errors).toContain("machineId");
      expect(errors).toContain("title");
    });
  });

  describe("Prisma MachineMaintenance Operations & Issue Resolution", () => {
    test("creates a MachineMaintenance record and links to Machine", async () => {
      const maintenanceDate = new Date();
      const maintenance = await prisma.machineMaintenance.create({
        data: {
          machineId: testMachine.id,
          title: "Changement de lentille focale",
          type: "REPLACEMENT",
          description: "Lentille changée après 200h d'utilisation",
          operator: "Fablab Staff",
          partsReplaced: "Lentille ZnSe 20mm",
          cost: 45.0,
          maintenanceDate,
        },
      });

      expect(maintenance).toBeDefined();
      expect(maintenance.id).toBeDefined();
      expect(maintenance.title).toBe("Changement de lentille focale");
      expect(maintenance.type).toBe("REPLACEMENT");
      expect(maintenance.machineId).toBe(testMachine.id);
      createdMaintenanceIds.push(maintenance.id);

      // Verify updating machine lastMaintenance
      const updatedMachine = await prisma.machine.update({
        where: { id: testMachine.id },
        data: { lastMaintenance: maintenanceDate },
      });
      expect(updatedMachine.lastMaintenance).toEqual(maintenanceDate);
    });

    test("resolves open issues for the machine when requested", async () => {
      // Check that testIssue is currently OPEN
      const initialIssue = await prisma.machineIssue.findUnique({ where: { id: testIssue.id } });
      expect(initialIssue.status).toBe("OPEN");

      // Simulate resolveOpenIssues logic
      await prisma.machineIssue.updateMany({
        where: {
          machineId: testMachine.id,
          status: "OPEN",
        },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
        },
      });

      // Verify that the issue is now RESOLVED
      const resolvedIssue = await prisma.machineIssue.findUnique({ where: { id: testIssue.id } });
      expect(resolvedIssue.status).toBe("RESOLVED");
      expect(resolvedIssue.resolvedAt).toBeInstanceOf(Date);
    });

    test("retrieves machine with relation to maintenances", async () => {
      const machineWithMaintenances = await prisma.machine.findUnique({
        where: { id: testMachine.id },
        include: {
          maintenances: {
            orderBy: { maintenanceDate: "desc" },
          },
        },
      });

      expect(machineWithMaintenances).toBeDefined();
      expect(machineWithMaintenances.maintenances.length).toBeGreaterThanOrEqual(1);
      expect(machineWithMaintenances.maintenances[0].title).toBe("Changement de lentille focale");
    });
  });
});
