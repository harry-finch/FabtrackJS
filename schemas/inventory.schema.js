const { z } = require("zod");
const { positiveIntId, preprocessDecimal, optionalPageNumber } = require("./common.schema.js");

const inventoryCheckoutSchema = z.object({
  itemType: z.enum(["CONSUMABLE", "EQUIPMENT"], {
    error: "Le type d'article (consommable ou équipement) est obligatoire.",
  }),
  itemId: positiveIntId("L'identifiant de l'article"),
  quantity: z.preprocess(
    (val) => preprocessDecimal(val, 1),
    z
      .number({ error: "La quantité doit être un nombre valide." })
      .finite("La quantité doit être un nombre valide.")
      .positive("La quantité doit être supérieure à 0.")
      .max(100000, "La quantité est trop élevée.")
      .default(1),
  ),
  reason: z
    .string({ error: "Le motif de la sortie est obligatoire." })
    .trim()
    .min(1, "Le motif de la sortie ne peut pas être vide.")
    .max(100, "Le motif est trop long (maximum 100 caractères)."),
  equipmentAction: z
    .enum(["OUT_OF_SERVICE", "DECOMMISSIONED", "KEEP_STATUS"], {
      error: "L'action sur l'équipement est invalide.",
    })
    .optional()
    .default("DECOMMISSIONED"),
  notes: z
    .string({ error: "Les notes sont invalides." })
    .trim()
    .max(2000, "Les notes ne peuvent pas dépasser 2000 caractères.")
    .optional()
    .nullable(),
});

const restoreEquipmentSchema = z.object({
  notes: z
    .string({ error: "Les notes sont invalides." })
    .trim()
    .max(2000, "Les notes ne peuvent pas dépasser 2000 caractères.")
    .optional()
    .nullable(),
});

const inventoryMovementsQuerySchema = z.object({
  itemType: z.enum(["", "CONSUMABLE", "EQUIPMENT"], { error: "Type d'article invalide." }).optional(),
  reason: z.string().trim().max(100, "Le filtre de motif est trop long.").optional(),
  search: z.string().trim().max(200, "La recherche est trop longue.").optional(),
  page: optionalPageNumber,
});

module.exports = {
  inventoryCheckoutSchema,
  restoreEquipmentSchema,
  inventoryMovementsQuerySchema,
};
