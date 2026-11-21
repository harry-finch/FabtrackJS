const { z } = require("zod");
const { positiveIntId, optionalPositiveIntId } = require("./common.schema.js");

const addEquipmentSchema = z.object({
  name: z
    .string({ error: "Le nom de l'équipement est obligatoire." })
    .trim()
    .min(1, "Le nom de l'équipement ne peut pas être vide.")
    .max(255, "Le nom de l'équipement ne peut pas dépasser 255 caractères."),
  workspaceId: optionalPositiveIntId("L'espace de travail"),
});

const updateEquipmentSchema = z.object({
  id: positiveIntId("L'identifiant de l'équipement"),
  name: z
    .string({ error: "Le nom de l'équipement est obligatoire." })
    .trim()
    .min(1, "Le nom de l'équipement ne peut pas être vide.")
    .max(255, "Le nom de l'équipement ne peut pas dépasser 255 caractères."),
  workspaceId: optionalPositiveIntId("L'espace de travail"),
});

module.exports = {
  addEquipmentSchema,
  updateEquipmentSchema,
};
