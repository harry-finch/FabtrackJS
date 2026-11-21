const { z } = require("zod");

const ALLOWED_STAFF_ROLES = ["admin", "user", "staff"];

const updateStaffSchema = z.object({
  id: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : undefined),
    z
      .number({ error: "Identifiant du compte staff manquant." })
      .int("Identifiant du compte staff invalide.")
      .positive("Identifiant du compte staff invalide."),
  ),
  username: z
    .string({ error: "Le nom d'utilisateur est requis." })
    .trim()
    .min(1, "Le nom d'utilisateur ne peut pas être vide.")
    .max(100, "Le nom d'utilisateur ne peut pas dépasser 100 caractères."),
  email: z
    .string({ error: "L'adresse e-mail est requise." })
    .trim()
    .email("Veuillez saisir une adresse e-mail valide.")
    .max(255, "L'adresse e-mail ne peut pas dépasser 255 caractères."),
  role: z.enum(ALLOWED_STAFF_ROLES, {
    error: "Rôle staff invalide. Valeurs autorisées : admin, user, staff.",
  }),
  approved: z.preprocess(
    (val) => val === true || val === "true" || val === "on" || val === "1" || val === 1,
    z.boolean(),
  ),
});

module.exports = {
  ALLOWED_STAFF_ROLES,
  updateStaffSchema,
};
