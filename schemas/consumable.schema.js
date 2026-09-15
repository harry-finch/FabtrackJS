const { z } = require("zod");

const addConsumableSchema = z.object({
  name: z
    .string({ required_error: "Le nom du consommable est obligatoire." })
    .trim()
    .min(1, "Le nom du consommable ne peut pas être vide."),
  cost: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(String(val).replace(",", ".")) : 0),
    z.number().min(0, "Le coût unitaire doit être supérieur ou égal à 0.").default(0),
  ),
  categoryId: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : null),
    z.number().int().positive().nullable().optional(),
  ),
});

const updateConsumableSchema = z.object({
  id: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : undefined),
    z.number({ required_error: "Identifiant manquant." }).int().positive(),
  ),
  name: z
    .string({ required_error: "Le nom du consommable est obligatoire." })
    .trim()
    .min(1, "Le nom du consommable ne peut pas être vide."),
  cost: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(String(val).replace(",", ".")) : 0),
    z.number().min(0, "Le coût unitaire doit être supérieur ou égal à 0.").default(0),
  ),
  categoryId: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : null),
    z.number().int().positive().nullable().optional(),
  ),
});

module.exports = {
  addConsumableSchema,
  updateConsumableSchema,
};
