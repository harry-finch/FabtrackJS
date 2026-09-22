const { prisma } = require("../utilities/db");
const logger = require("../utilities/simpleLogger");

/**
 * Computes the ConsumableStatus based on current stock and threshold.
 * @param {number} stock
 * @param {number} threshold
 * @returns {"AVAILABLE"|"LOW_STOCK"|"OUT_OF_STOCK"}
 */
function computeStatus(stock, threshold) {
  if (stock <= 0) return "OUT_OF_STOCK";
  if (stock <= threshold) return "LOW_STOCK";
  return "AVAILABLE";
}

/**
 * Check out / write off a consumable from inventory.
 * @param {Object} params
 * @param {number} params.id - Consumable ID
 * @param {number} params.quantity - Quantity to deduct
 * @param {string} params.reason - Motive (Casse, Rebut, etc.)
 * @param {string} [params.notes] - Circumstances or extra details
 * @param {string} params.author - Staff/Admin username
 */
async function checkoutConsumable({ id, quantity, reason, notes, author }) {
  const consumableId = Number(id);
  const qty = Math.max(1, parseInt(quantity, 10) || 1);

  const consumable = await prisma.consumable.findUnique({
    where: { id: consumableId },
  });

  if (!consumable) {
    throw new Error(`Consommable introuvable (#${consumableId}).`);
  }

  const stockBefore = consumable.stock;
  const stockAfter = Math.max(0, stockBefore - qty);
  const newStatus = computeStatus(stockAfter, consumable.reorderThreshold);

  const [updatedConsumable, movement] = await prisma.$transaction([
    prisma.consumable.update({
      where: { id: consumableId },
      data: {
        stock: stockAfter,
        status: newStatus,
      },
    }),
    prisma.inventoryMovement.create({
      data: {
        itemType: "CONSUMABLE",
        itemId: consumable.id,
        itemName: consumable.name,
        quantity: qty,
        unit: consumable.unit || "u",
        reason: reason.trim(),
        notes: notes ? notes.trim() : null,
        author: author || "Système",
        stockBefore,
        stockAfter,
      },
    }),
  ]);

  logger.logThat(
    `Sortie d'inventaire: -${qty} ${consumable.unit || "u"} de "${consumable.name}" (Motif: ${reason}) par ${author}. Nouveau stock: ${stockAfter}.`,
  );

  return { consumable: updatedConsumable, movement };
}

/**
 * Check out / decommission / mark out of service an equipment or tool.
 * @param {Object} params
 * @param {number} params.id - Equipment ID
 * @param {string} [params.action] - "OUT_OF_SERVICE" | "DECOMMISSIONED"
 * @param {string} params.reason - Motive (Casse, Rebut, Panne...)
 * @param {string} [params.notes] - Comments
 * @param {string} params.author - Staff/Admin username
 */
async function checkoutEquipment({ id, action = "DECOMMISSIONED", reason, notes, author }) {
  const equipmentId = Number(id);
  const statusTarget = action === "OUT_OF_SERVICE" ? "OUT_OF_SERVICE" : "DECOMMISSIONED";

  const equipment = await prisma.equipment.findUnique({
    where: { id: equipmentId },
    include: { workspace: true },
  });

  if (!equipment) {
    throw new Error(`Équipement introuvable (#${equipmentId}).`);
  }

  const equipmentStatusBefore = equipment.status || "AVAILABLE";

  const [updatedEquipment, movement] = await prisma.$transaction([
    prisma.equipment.update({
      where: { id: equipmentId },
      data: {
        status: statusTarget,
        decommissionedAt: new Date(),
        decommissionReason: reason.trim(),
      },
    }),
    prisma.inventoryMovement.create({
      data: {
        itemType: "EQUIPMENT",
        itemId: equipment.id,
        itemName: equipment.name,
        quantity: 1,
        unit: "u",
        reason: reason.trim(),
        notes: notes ? notes.trim() : null,
        author: author || "Système",
        equipmentStatusBefore,
        equipmentStatusAfter: statusTarget,
      },
    }),
  ]);

  logger.logThat(
    `Sortie d'inventaire équipement: "${equipment.name}" (#${equipment.id}) passé à ${statusTarget} (Motif: ${reason}) par ${author}.`,
  );

  return { equipment: updatedEquipment, movement };
}

/**
 * Restore an equipment back to AVAILABLE service (e.g. after repair).
 * @param {Object} params
 * @param {number} params.id - Equipment ID
 * @param {string} [params.notes] - Resolution details
 * @param {string} params.author - Staff/Admin username
 */
async function restoreEquipment({ id, notes, author }) {
  const equipmentId = Number(id);

  const equipment = await prisma.equipment.findUnique({
    where: { id: equipmentId },
  });

  if (!equipment) {
    throw new Error(`Équipement introuvable (#${equipmentId}).`);
  }

  const equipmentStatusBefore = equipment.status || "OUT_OF_SERVICE";

  const [updatedEquipment, movement] = await prisma.$transaction([
    prisma.equipment.update({
      where: { id: equipmentId },
      data: {
        status: "AVAILABLE",
        decommissionedAt: null,
        decommissionReason: null,
      },
    }),
    prisma.inventoryMovement.create({
      data: {
        itemType: "EQUIPMENT",
        itemId: equipment.id,
        itemName: equipment.name,
        quantity: 1,
        unit: "u",
        reason: "Remise en service / Fin de maintenance",
        notes: notes ? notes.trim() : null,
        author: author || "Système",
        equipmentStatusBefore,
        equipmentStatusAfter: "AVAILABLE",
      },
    }),
  ]);

  logger.logThat(
    `Remise en service équipement: "${equipment.name}" (#${equipment.id}) remis à AVAILABLE par ${author}.`,
  );

  return { equipment: updatedEquipment, movement };
}

/**
 * Get active consumables and equipments for UI selector modals.
 */
async function getInventoryItems() {
  const [consumables, equipment] = await Promise.all([
    prisma.consumable.findMany({
      orderBy: { name: "asc" },
      include: { category: true },
    }),
    prisma.equipment.findMany({
      orderBy: { name: "asc" },
      include: { workspace: true },
    }),
  ]);

  return {
    consumables: consumables.map((c) => ({
      id: c.id,
      name: c.name,
      stock: c.stock,
      unit: c.unit || "u",
      category: c.category ? c.category.name : null,
      status: c.status,
    })),
    equipment: equipment.map((eq) => ({
      id: eq.id,
      name: eq.name,
      status: eq.status || "AVAILABLE",
      workspace: eq.workspace ? eq.workspace.name : null,
    })),
  };
}

/**
 * List past inventory movements with optional filters and pagination.
 */
async function getMovements({ itemType, reason, search, limit = 50, offset = 0 } = {}) {
  const where = {};

  if (itemType && (itemType === "CONSUMABLE" || itemType === "EQUIPMENT")) {
    where.itemType = itemType;
  }

  if (reason && reason !== "all") {
    where.reason = { contains: reason };
  }

  if (search && search.trim() !== "") {
    const q = search.trim();
    where.OR = [
      { itemName: { contains: q } },
      { author: { contains: q } },
      { notes: { contains: q } },
      { reason: { contains: q } },
    ];
  }

  const [total, movements] = await Promise.all([
    prisma.inventoryMovement.count({ where }),
    prisma.inventoryMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Number(limit),
      skip: Number(offset),
    }),
  ]);

  return { total, movements };
}

/**
 * Export all inventory movements as CSV.
 */
async function exportMovementsCsv() {
  const movements = await prisma.inventoryMovement.findMany({
    orderBy: { createdAt: "desc" },
  });

  const headers = [
    "ID",
    "Date",
    "Heure",
    "Type",
    "ID_Article",
    "Nom_Article",
    "Quantite",
    "Unite",
    "Motif",
    "Auteur",
    "Stock_Avant",
    "Stock_Apres",
    "Statut_Equipement_Avant",
    "Statut_Equipement_Apres",
    "Notes",
  ];

  const escapeCsv = (str) => {
    if (str === null || str === undefined) return "";
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = movements.map((m) => {
    const d = new Date(m.createdAt);
    const dateStr = d.toLocaleDateString("fr-FR");
    const timeStr = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

    return [
      m.id,
      escapeCsv(dateStr),
      escapeCsv(timeStr),
      escapeCsv(m.itemType),
      m.itemId,
      escapeCsv(m.itemName),
      m.quantity,
      escapeCsv(m.unit || ""),
      escapeCsv(m.reason),
      escapeCsv(m.author),
      m.stockBefore !== null ? m.stockBefore : "",
      m.stockAfter !== null ? m.stockAfter : "",
      escapeCsv(m.equipmentStatusBefore || ""),
      escapeCsv(m.equipmentStatusAfter || ""),
      escapeCsv(m.notes || ""),
    ].join(";");
  });

  return [headers.join(";"), ...rows].join("\r\n");
}

module.exports = {
  computeStatus,
  checkoutConsumable,
  checkoutEquipment,
  restoreEquipment,
  getInventoryItems,
  getMovements,
  exportMovementsCsv,
};
