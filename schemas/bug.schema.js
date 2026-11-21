const { z } = require("zod");
const { safeHttpUrl } = require("../utilities/xssHelpers.js");

const ALLOWED_SEVERITIES = ["Faible", "Moyenne", "Élevée", "Critique"];

const reportBugSchema = z.object({
  title: z
    .string({ error: "Veuillez préciser l'objet du signalement." })
    .trim()
    .min(3, "L'objet du signalement doit comporter au moins 3 caractères.")
    .max(200, "L'objet du signalement ne peut pas dépasser 200 caractères."),
  category: z
    .string({ error: "La catégorie est invalide." })
    .trim()
    .max(100, "La catégorie ne peut pas dépasser 100 caractères.")
    .default("Bug"),
  description: z
    .string({ error: "Veuillez décrire le problème ou la correction souhaitée." })
    .trim()
    .min(5, "La description doit comporter au moins 5 caractères.")
    .max(5000, "La description ne peut pas dépasser 5000 caractères."),
  pageUrl: z
    .string({ error: "L'URL de la page est invalide." })
    .trim()
    .max(2048, "L'URL de la page est trop longue.")
    .optional()
    .nullable()
    .refine((val) => !val || safeHttpUrl(val) !== null, {
      message: "L'URL de la page doit être une adresse HTTP ou HTTPS valide.",
    }),
  severity: z
    .string({ error: "La gravité est invalide." })
    .trim()
    .default("Moyenne")
    .transform((val) => (ALLOWED_SEVERITIES.includes(val) ? val : "Moyenne")),
  reporterName: z.string().trim().max(120, "Le nom ne peut pas dépasser 120 caractères.").optional().nullable(),
  reporterEmail: z
    .string()
    .trim()
    .max(254, "L'adresse e-mail ne peut pas dépasser 254 caractères.")
    .optional()
    .nullable()
    .refine((val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), {
      message: "Veuillez saisir une adresse e-mail valide pour être recontacté.",
    }),
});

module.exports = {
  ALLOWED_SEVERITIES,
  reportBugSchema,
};
