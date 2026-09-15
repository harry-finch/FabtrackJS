const { z } = require("zod");

const reportBugSchema = z.object({
  title: z
    .string({ required_error: "Veuillez préciser l'objet du signalement." })
    .trim()
    .min(3, "L'objet du signalement doit comporter au moins 3 caractères."),
  category: z
    .string()
    .trim()
    .default("Bug"),
  description: z
    .string({ required_error: "Veuillez décrire le problème ou la correction souhaitée." })
    .trim()
    .min(5, "La description doit comporter au moins 5 caractères."),
  pageUrl: z.string().trim().optional().nullable(),
  severity: z.string().trim().default("Moyenne"),
  reporterName: z.string().trim().optional().nullable(),
  reporterEmail: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), {
      message: "Veuillez saisir une adresse e-mail valide pour être recontacté.",
    }),
});

module.exports = {
  reportBugSchema,
};
