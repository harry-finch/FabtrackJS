const inventoryService = require("../../services/inventoryService");
const { inventoryCheckoutSchema } = require("../../schemas/inventory.schema");
const { prisma } = require("../../utilities/db");

describe("Unit: InventoryService & Inventory Checkout", () => {
  let testConsumable;
  let testEquipment;
  const createdMovementIds = [];

  beforeAll(async () => {
    // Create a temporary consumable for testing
    testConsumable = await prisma.consumable.create({
      data: {
        name: `Test Consumable ${Date.now()}`,
        cost: 15.5,
        stock: 50,
        reorderThreshold: 10,
        status: "AVAILABLE",
        unit: "g",
      },
    });

    // Create a temporary equipment for testing
    testEquipment = await prisma.equipment.create({
      data: {
        name: `Test Tool ${Date.now()}`,
        status: "AVAILABLE",
      },
    });
  });

  afterAll(async () => {
    // Cleanup movements
    if (createdMovementIds.length > 0) {
      await prisma.inventoryMovement.deleteMany({
        where: { id: { in: createdMovementIds } },
      });
    }

    // Cleanup consumable and equipment
    if (testConsumable) {
      await prisma.consumable.delete({ where: { id: testConsumable.id } }).catch(() => {});
    }
    if (testEquipment) {
      await prisma.equipment.delete({ where: { id: testEquipment.id } }).catch(() => {});
    }
  });

  describe("computeStatus()", () => {
    test("returns OUT_OF_STOCK when stock is 0 or negative", () => {
      expect(inventoryService.computeStatus(0, 10)).toBe("OUT_OF_STOCK");
      expect(inventoryService.computeStatus(-5, 10)).toBe("OUT_OF_STOCK");
    });

    test("returns LOW_STOCK when stock is <= threshold and > 0", () => {
      expect(inventoryService.computeStatus(10, 10)).toBe("LOW_STOCK");
      expect(inventoryService.computeStatus(3, 10)).toBe("LOW_STOCK");
    });

    test("returns AVAILABLE when stock is strictly greater than threshold", () => {
      expect(inventoryService.computeStatus(11, 10)).toBe("AVAILABLE");
      expect(inventoryService.computeStatus(100, 10)).toBe("AVAILABLE");
    });
  });

  describe("inventoryCheckoutSchema (Zod validation)", () => {
    test("validates consumable checkout successfully", () => {
      const payload = {
        itemType: "CONSUMABLE",
        itemId: "42",
        quantity: "5",
        reason: "Casse / Dégradation",
        notes: "Bobine cassée lors de manipulation",
      };
      const result = inventoryCheckoutSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.itemId).toBe(42);
      expect(result.data.quantity).toBe(5);
      expect(result.data.itemType).toBe("CONSUMABLE");
    });

    test("validates equipment checkout successfully", () => {
      const payload = {
        itemType: "EQUIPMENT",
        itemId: 12,
        reason: "Panne / Maintenance",
        equipmentAction: "OUT_OF_SERVICE",
        notes: "Moteur bloqué",
      };
      const result = inventoryCheckoutSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.equipmentAction).toBe("OUT_OF_SERVICE");
    });

    test("fails if reason is empty or missing", () => {
      const payload = {
        itemType: "CONSUMABLE",
        itemId: 1,
        quantity: 1,
        reason: "",
      };
      const result = inventoryCheckoutSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    test("fails if itemType is invalid", () => {
      const payload = {
        itemType: "UNKNOWN",
        itemId: 1,
        reason: "Casse",
      };
      const result = inventoryCheckoutSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe("checkoutConsumable()", () => {
    test("deducts stock, updates status, and logs inventory movement", async () => {
      const res = await inventoryService.checkoutConsumable({
        id: testConsumable.id,
        quantity: 15,
        reason: "Casse / Dégradation",
        notes: "Filament humide et cassant",
        author: "AdminTester",
      });

      createdMovementIds.push(res.movement.id);

      expect(res.consumable.stock).toBe(35);
      expect(res.consumable.status).toBe("AVAILABLE");
      expect(res.movement.itemType).toBe("CONSUMABLE");
      expect(res.movement.quantity).toBe(15);
      expect(res.movement.stockBefore).toBe(50);
      expect(res.movement.stockAfter).toBe(35);
      expect(res.movement.author).toBe("AdminTester");

      // Verify in DB
      const freshConsumable = await prisma.consumable.findUnique({
        where: { id: testConsumable.id },
      });
      expect(freshConsumable.stock).toBe(35);
    });

    test("clamps stock to 0 and marks OUT_OF_STOCK when removing excess quantity", async () => {
      const res = await inventoryService.checkoutConsumable({
        id: testConsumable.id,
        quantity: 100,
        reason: "Écart d'inventaire",
        notes: "Inventaire de fin d'année",
        author: "AdminTester",
      });

      createdMovementIds.push(res.movement.id);

      expect(res.consumable.stock).toBe(0);
      expect(res.consumable.status).toBe("OUT_OF_STOCK");
      expect(res.movement.stockAfter).toBe(0);
    });
  });

  describe("checkoutEquipment()", () => {
    test("marks equipment OUT_OF_SERVICE with reason and creates movement", async () => {
      const res = await inventoryService.checkoutEquipment({
        id: testEquipment.id,
        action: "OUT_OF_SERVICE",
        reason: "Panne / Maintenance",
        notes: "Charbons usés à remplacer",
        author: "StaffTester",
      });

      createdMovementIds.push(res.movement.id);

      expect(res.equipment.status).toBe("OUT_OF_SERVICE");
      expect(res.equipment.decommissionReason).toBe("Panne / Maintenance");
      expect(res.movement.equipmentStatusBefore).toBe("AVAILABLE");
      expect(res.movement.equipmentStatusAfter).toBe("OUT_OF_SERVICE");

      // Verify in DB
      const freshEquip = await prisma.equipment.findUnique({
        where: { id: testEquipment.id },
      });
      expect(freshEquip.status).toBe("OUT_OF_SERVICE");
    });

    test("marks equipment DECOMMISSIONED (scrap)", async () => {
      const res = await inventoryService.checkoutEquipment({
        id: testEquipment.id,
        action: "DECOMMISSIONED",
        reason: "Mise au rebut / Usure",
        notes: "Appareil irréparable, sécurité compromise",
        author: "AdminTester",
      });

      createdMovementIds.push(res.movement.id);

      expect(res.equipment.status).toBe("DECOMMISSIONED");
      expect(res.movement.equipmentStatusAfter).toBe("DECOMMISSIONED");
    });
  });

  describe("restoreEquipment()", () => {
    test("restores equipment back to AVAILABLE service", async () => {
      const res = await inventoryService.restoreEquipment({
        id: testEquipment.id,
        author: "AdminTester",
        notes: "Moteur remplacé, testé fonctionnel",
      });

      createdMovementIds.push(res.movement.id);

      expect(res.equipment.status).toBe("AVAILABLE");
      expect(res.equipment.decommissionedAt).toBeNull();
      expect(res.movement.equipmentStatusAfter).toBe("AVAILABLE");

      const freshEquip = await prisma.equipment.findUnique({
        where: { id: testEquipment.id },
      });
      expect(freshEquip.status).toBe("AVAILABLE");
    });
  });

  describe("exportMovementsCsv()", () => {
    test("exports formatted CSV string with semicolon delimiters and headers", async () => {
      const csv = await inventoryService.exportMovementsCsv();
      expect(typeof csv).toBe("string");
      expect(csv).toContain("ID;Date;Heure;Type;ID_Article;Nom_Article;Quantite;Unite;Motif;Auteur");
    });
  });
});
