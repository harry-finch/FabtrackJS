const { z } = require("zod");

const addEquipmentSchema = z.object({
  name: z
    .string({ required_error: "Le nom de l'équipement est obligatoire." })
    .trim()
    .min(1, "Le nom de l'équipement ne peut pas être vide."),
  workspaceId: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : null),
    z.number().int().positive().nullable().optional(),
  ),
});

const updateEquipmentSchema = z.object({
  id: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : undefined),
    z.number({ required_error: "Identifiant manquant." }).int().positive(),
  ),
  name: z
    .string({ required_error: "Le nom de l'équipement est obligatoire." })
    .trim()
    .min(1, "Le nom de l'équipement ne peut pas être vide."),
  workspaceId: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : null),
    z.number().int().positive().nullable().optional(),
  ),
});

module.exports = {
  addEquipmentSchema,
  updateEquipmentSchema,
};
