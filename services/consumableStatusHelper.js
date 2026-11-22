const { ConsumableStatus } = require("../utilities/db.js");

const STATUS = ConsumableStatus || {
  OUT_OF_STOCK: "OUT_OF_STOCK",
  LOW_STOCK: "LOW_STOCK",
  AVAILABLE: "AVAILABLE",
};

/**
 * Computes the ConsumableStatus from current stock and reorder threshold.
 * @param {number} stock
 * @param {number} [threshold=10]
 * @returns {"OUT_OF_STOCK"|"LOW_STOCK"|"AVAILABLE"}
 */
function computeConsumableStatus(stock, threshold = 10) {
  if (stock <= 0) return STATUS.OUT_OF_STOCK;
  if (stock <= threshold) return STATUS.LOW_STOCK;
  return STATUS.AVAILABLE;
}

module.exports = {
  computeConsumableStatus,
};
