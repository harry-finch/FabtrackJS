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
      .min(2, "Le nom d'administrateur doit contenir au moins 2 caractères"),

    adminEmail: z
      .string({ error: "L'adresse email administrateur est requise" })
      .trim()
      .email("Adresse email administrateur invalide"),

    adminPassword: z
      .string({ error: "Le mot de passe est requis" })
      .min(6, "Le mot de passe doit contenir au moins 6 caractères"),

    confirmPassword: z
      .string({ error: "La confirmation du mot de passe est requise" }),

    platformName: z
      .string({ error: "Le nom de la plateforme est requis" })
      .trim()
      .min(2, "Le nom de la plateforme doit contenir au moins 2 caractères"),

    platformSubtitle: z
      .string()
      .trim()
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
      .default("€"),

    workspaces: z
      .union([z.array(z.string()), z.string()], {
        error: "Au moins un espace de travail doit être créé",
      })
      .transform(parseWorkspacesInput)
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
  parseWorkspacesInput,
};
