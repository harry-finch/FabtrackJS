const { z } = require("zod");

/**
 * Validation schema for the setup / installation form.
 */
const setupSchema = z
  .object({
    adminName: z
      .string({ required_error: "Le nom d'administrateur est requis" })
      .trim()
      .min(2, "Le nom d'administrateur doit contenir au moins 2 caractères"),

    adminEmail: z
      .string({ required_error: "L'adresse email administrateur est requise" })
      .trim()
      .email("Adresse email administrateur invalide"),

    adminPassword: z
      .string({ required_error: "Le mot de passe est requis" })
      .min(6, "Le mot de passe doit contenir au moins 6 caractères"),

    confirmPassword: z
      .string({ required_error: "La confirmation du mot de passe est requise" }),

    platformName: z
      .string({ required_error: "Le nom de la plateforme est requis" })
      .trim()
      .min(2, "Le nom de la plateforme doit contenir au moins 2 caractères"),

    platformSubtitle: z
      .string()
      .trim()
      .optional()
      .default("Suivi d'activité du fablab"),

    defaultLanguage: z
      .enum(["fr", "en"], {
        invalid_type_error: "Langue non supportée (fr ou en)",
      })
      .default("fr"),

    currencySymbol: z
      .string()
      .trim()
      .min(1, "La devise est requise")
      .default("€"),

    workspaces: z
      .union([z.array(z.string()), z.string()])
      .transform((val) => {
        if (Array.isArray(val)) {
          return val.map((s) => String(s).trim()).filter(Boolean);
        }
        if (typeof val === "string") {
          return val
            .split(/[\n,;]+/)
            .map((s) => s.trim())
            .filter(Boolean);
        }
        return [];
      })
      .refine(
        (list) => list.length > 0,
        "Au moins un espace de travail doit être créé"
      ),
  })
  .refine((data) => data.adminPassword === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });

module.exports = {
  setupSchema,
};
