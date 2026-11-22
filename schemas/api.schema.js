const { z } = require("zod");
const { optionalPositiveIntId, preprocessOptionalInt } = require("./common.schema.js");

const rfidScanSchema = z.object({
  rfid: z
    .string({ error: "Le code RFID est requis." })
    .trim()
    .min(1, "Le code RFID ne peut pas être vide.")
    .max(100, "Le code RFID ne peut pas dépasser 100 caractères."),
  workspaceId: optionalPositiveIntId("L'identifiant de l'espace de travail"),
});

const checkRfidQuerySchema = z.object({
  rfid: z
    .string({ error: "Le code RFID est requis." })
    .trim()
    .max(100, "Le code RFID ne peut pas dépasser 100 caractères.")
    .optional(),
  excludeUserId: optionalPositiveIntId("L'identifiant usager exclu"),
});

const projectDocumentationQuerySchema = z.object({
  projectId: optionalPositiveIntId("L'identifiant projet"),
  userId: optionalPositiveIntId("L'identifiant usager"),
});

const userSearchQuerySchema = z.object({
  q: z
    .string({ error: "Le terme de recherche est invalide." })
    .trim()
    .max(100, "Le terme de recherche ne peut pas dépasser 100 caractères.")
    .optional()
    .default(""),
  limit: z.preprocess(
    (val) => {
      const parsed = preprocessOptionalInt(val);
      return parsed === null || parsed === undefined ? 20 : parsed;
    },
    z
      .number({ error: "La limite doit être un entier positif." })
      .int("La limite doit être un entier.")
      .min(1, "La limite doit être comprise entre 1 et 50.")
      .max(50, "La limite doit être comprise entre 1 et 50.")
      .default(20),
  ),
});

module.exports = {
  rfidScanSchema,
  checkRfidQuerySchema,
  projectDocumentationQuerySchema,
  userSearchQuerySchema,
};
