const { z } = require("zod");
const {
  positiveIntId,
  optionalPositiveIntId,
  preprocessDecimal,
  preprocessCheckbox,
} = require("./common.schema.js");

const reportIssueSchema = z.object({
  machineId: positiveIntId("L'identifiant de machine"),
  description: z
    .string({ error: "Veuillez décrire le problème rencontré." })
    .trim()
    .min(5, "La description de la panne doit comporter au moins 5 caractères.")
    .max(5000, "La description de la panne ne peut pas dépasser 5000 caractères."),
  reporterName: z
    .string({ error: "Le nom du déclarant est invalide." })
    .trim()
    .max(255, "Le nom ne peut pas dépasser 255 caractères.")
    .optional()
    .nullable(),
  reporterEmail: z
    .string({ error: "L'adresse e-mail est invalide." })
    .trim()
    .max(255, "L'adresse e-mail ne peut pas dépasser 255 caractères.")
    .optional()
    .nullable()
    .refine((val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), {
      message: "Veuillez saisir une adresse e-mail valide pour le signalement.",
    }),
});

const reportIssueQuerySchema = z.object({
  machineId: optionalPositiveIntId("L'identifiant de machine"),
  success: z.string().trim().max(10).optional(),
  machineName: z.string().trim().max(255).optional(),
});

const createMaintenanceSchema = z.object({
  machineId: positiveIntId("L'identifiant de machine"),
  title: z
    .string({ error: "Veuillez indiquer l'intitulé de la maintenance." })
    .trim()
    .min(2, "L'intitulé doit comporter au moins 2 caractères.")
    .max(255, "L'intitulé ne peut pas dépasser 255 caractères."),
  type: z
    .enum(["PREVENTIVE", "CURATIVE", "REPLACEMENT", "CALIBRATION", "CLEANING", "OTHER"], {
      error: "Type de maintenance invalide.",
    })
    .optional()
    .default("PREVENTIVE"),
  description: z
    .string({ error: "La description est invalide." })
    .trim()
    .max(5000, "La description ne peut pas dépasser 5000 caractères.")
    .optional()
    .nullable(),
  operator: z
    .string({ error: "Le nom de l'opérateur est invalide." })
    .trim()
    .max(255, "Le nom de l'opérateur ne peut pas dépasser 255 caractères.")
    .optional()
    .nullable(),
  partsReplaced: z
    .string({ error: "Les pièces remplacées sont invalides." })
    .trim()
    .max(255, "Les pièces remplacées ne peuvent pas dépasser 255 caractères.")
    .optional()
    .nullable(),
  cost: z.preprocess(
    (val) => preprocessDecimal(val, null),
    z
      .number({ error: "Le coût doit être un nombre valide." })
      .finite("Le coût doit être un nombre valide.")
      .min(0, "Le coût ne peut pas être négatif.")
      .max(99999999.99, "Le coût est trop élevé.")
      .nullable()
      .optional(),
  ),
  maintenanceDate: z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === "") return undefined;
      return new Date(val);
    },
    z
      .date({ error: "Date de maintenance invalide." })
      .refine((d) => !Number.isNaN(d.getTime()), "Date de maintenance invalide.")
      .optional()
      .default(() => new Date()),
  ),
  resolveOpenIssues: z.preprocess(preprocessCheckbox, z.boolean().optional().default(false)),
});

const updateIssueStatusSchema = z.object({
  status: z.enum(["OPEN", "RESOLVED"], {
    error: "Statut de signalement invalide (OPEN ou RESOLVED).",
  }),
  resolutionNotes: z
    .string({ error: "Les notes de résolution sont invalides." })
    .trim()
    .max(5000, "Les notes de résolution ne peuvent pas dépasser 5000 caractères.")
    .optional()
    .nullable(),
  machineId: optionalPositiveIntId("L'identifiant de machine"),
});

module.exports = {
  reportIssueSchema,
  reportIssueQuerySchema,
  createMaintenanceSchema,
  updateIssueStatusSchema,
};
