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

module.exports = {
  reportIssueSchema,
};
