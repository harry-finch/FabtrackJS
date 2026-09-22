const { z } = require("zod");

const inventoryCheckoutSchema = z.object({
  itemType: z.enum(["CONSUMABLE", "EQUIPMENT"], {
    required_error: "Le type d'article (consommable ou équipement) est obligatoire.",
  }),
  itemId: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : undefined),
    z.number({ required_error: "L'identifiant de l'article est obligatoire." }).int().positive(),
  ),
  quantity: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : 1),
    z.number().positive("La quantité doit être supérieure à 0.").default(1),
  ),
  reason: z
    .string({ required_error: "Le motif de la sortie est obligatoire." })
    .trim()
    .min(1, "Le motif de la sortie ne peut pas être vide.")
    .max(100, "Le motif est trop long (maximum 100 caractères)."),
  equipmentAction: z.enum(["OUT_OF_SERVICE", "DECOMMISSIONED", "KEEP_STATUS"]).optional().default("DECOMMISSIONED"),
  notes: z
    .string()
    .trim()
    .max(2000, "Les notes ne peuvent pas dépasser 2000 caractères.")
    .optional()
    .nullable(),
});

module.exports = {
  inventoryCheckoutSchema,
};
