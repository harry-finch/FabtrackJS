const { z } = require("zod");

const reportIssueSchema = z.object({
  machineId: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : undefined),
    z.number({ required_error: "Veuillez sélectionner une machine." }).int().positive("Machine invalide."),
  ),
  description: z
    .string({ required_error: "Veuillez décrire le problème rencontré." })
    .trim()
    .min(5, "La description de la panne doit comporter au moins 5 caractères."),
  reporterName: z.string().trim().optional().nullable(),
  reporterEmail: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), {
      message: "Veuillez saisir une adresse e-mail valide pour le signalement.",
    }),
});

const createMaintenanceSchema = z.object({
  machineId: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : undefined),
    z.number({ required_error: "Machine invalide." }).int().positive("Machine invalide."),
  ),
  title: z
    .string({ required_error: "Veuillez indiquer l'intitulé de la maintenance." })
    .trim()
    .min(2, "L'intitulé doit comporter au moins 2 caractères.")
    .max(255, "L'intitulé ne peut pas dépasser 255 caractères."),
  type: z
    .enum(["PREVENTIVE", "CURATIVE", "REPLACEMENT", "CALIBRATION", "CLEANING", "OTHER"])
    .optional()
    .default("PREVENTIVE"),
  description: z.string().trim().optional().nullable(),
  operator: z.string().trim().optional().nullable(),
  partsReplaced: z.string().trim().max(255).optional().nullable(),
  cost: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(String(val).replace(",", ".")) : null),
    z.number().min(0).nullable().optional(),
  ),
  maintenanceDate: z.preprocess(
    (val) => (val ? new Date(val) : undefined),
    z.date().optional().default(() => new Date()),
  ),
  resolveOpenIssues: z.preprocess(
    (val) => val === true || val === "true" || val === "on" || val === "1",
    z.boolean().optional().default(false),
  ),
});

module.exports = {
  reportIssueSchema,
  createMaintenanceSchema,
};
