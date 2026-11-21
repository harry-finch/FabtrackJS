const { z } = require("zod");
const { optionalPositiveIntId } = require("./common.schema.js");

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

module.exports = {
  rfidScanSchema,
  checkRfidQuerySchema,
  projectDocumentationQuerySchema,
};
