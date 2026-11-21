const { z } = require("zod");

/**
 * Deduplicate non-empty trimmed strings while preserving original order.
 * @param {Array<unknown>} items
 * @returns {string[]}
 */
function normalizeWorkspaceArray(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    if (item == null) continue;
    const trimmed = String(item).trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

/**
 * Parse workspaces input from an array, a JSON array string, or a delimited string.
 * @param {unknown} val
 * @returns {string[]}
 */
function parseWorkspacesInput(val) {
  if (Array.isArray(val)) {
    return normalizeWorkspaceArray(val);
  }

  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) {
      return [];
    }

    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return normalizeWorkspaceArray(parsed);
        }
      } catch (_err) {
        // Fall back to delimited string parsing when JSON parsing fails
      }
    }

    return normalizeWorkspaceArray(trimmed.split(/[\n,;]+/));
  }

  return [];
}

/**
 * Validation schema for the setup / installation form.
 */
const setupSchema = z
  .object({
    adminName: z
      .string({ error: "Le nom d'administrateur est requis" })
      .trim()
      .min(2, "Le nom d'administrateur doit contenir au moins 2 caractères")
      .max(255, "Le nom d'administrateur ne peut pas dépasser 255 caractères"),

    adminEmail: z
      .string({ error: "L'adresse email administrateur est requise" })
      .trim()
      .max(255, "L'adresse email administrateur ne peut pas dépasser 255 caractères")
      .email("Adresse email administrateur invalide"),

    adminPassword: z
      .string({ error: "Le mot de passe est requis" })
      .min(6, "Le mot de passe doit contenir au moins 6 caractères")
      .max(255, "Le mot de passe ne peut pas dépasser 255 caractères"),

    confirmPassword: z
      .string({ error: "La confirmation du mot de passe est requise" })
      .max(255, "La confirmation du mot de passe est trop longue"),

    platformName: z
      .string({ error: "Le nom de la plateforme est requis" })
      .trim()
      .min(2, "Le nom de la plateforme doit contenir au moins 2 caractères")
      .max(255, "Le nom de la plateforme ne peut pas dépasser 255 caractères"),

    platformSubtitle: z
      .string()
      .trim()
      .max(255, "Le sous-titre ne peut pas dépasser 255 caractères")
      .optional()
      .default("Suivi d'activité du fablab"),

    defaultLanguage: z
      .enum(["fr", "en"], {
        error: "Langue non supportée (fr ou en)",
      })
      .default("fr"),

    currencySymbol: z
      .string()
      .trim()
      .min(1, "La devise est requise")
      .max(20, "Le symbole monétaire ne peut pas dépasser 20 caractères")
      .default("€"),

    workspaces: z
      .union([z.array(z.string().max(255)), z.string().max(5000)], {
        error: "Au moins un espace de travail doit être créé",
      })
      .transform(parseWorkspacesInput)
      .refine(
        (list) => list.length > 0 && list.every((w) => w.length <= 255),
        "Au moins un espace de travail valide (255 caractères max) doit être créé",
      ),
  })
  .refine((data) => data.adminPassword === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });

module.exports = {
  setupSchema,
  parseWorkspacesInput,
};
