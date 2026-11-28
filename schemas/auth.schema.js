const { z } = require("zod");
const { optionalPositiveIntId, positiveIntId } = require("./common.schema.js");

const loginSchema = z.object({
  username: z
    .string({ error: "Veuillez saisir votre nom d'utilisateur." })
    .trim()
    .min(1, "Veuillez saisir votre nom d'utilisateur.")
    .max(255, "Le nom d'utilisateur ne peut pas dépasser 255 caractères."),
  password: z
    .string({ error: "Veuillez saisir votre mot de passe." })
    .min(1, "Veuillez saisir votre mot de passe.")
    .max(255, "Le mot de passe ne peut pas dépasser 255 caractères."),
});

const registerStaffSchema = z.object({
  username: z
    .string({ error: "Le nom d'utilisateur est requis." })
    .trim()
    .min(1, "Le nom d'utilisateur ne peut pas être vide.")
    .max(255, "Le nom d'utilisateur ne peut pas dépasser 255 caractères."),
  firstName: z
    .string({ error: "Le prénom est invalide." })
    .trim()
    .max(255, "Le prénom ne peut pas dépasser 255 caractères.")
    .optional()
    .nullable(),
  lastName: z
    .string({ error: "Le nom est invalide." })
    .trim()
    .max(255, "Le nom ne peut pas dépasser 255 caractères.")
    .optional()
    .nullable(),
  usertypeId: optionalPositiveIntId("Le type de contributeur"),
  mail: z
    .string({ error: "L'adresse e-mail est requise." })
    .trim()
    .max(255, "L'adresse e-mail ne peut pas dépasser 255 caractères.")
    .email("Veuillez saisir une adresse e-mail valide."),
  password: z
    .string({ error: "Le mot de passe est requis." })
    .min(8, "Le mot de passe doit comporter au moins 8 caractères.")
    .max(255, "Le mot de passe ne peut pas dépasser 255 caractères."),
  // Declared explicitly so strict stripping in validateBody preserves the anti-bot honeypot field
  honeypot: z
    .string({ error: "Champ invalide." })
    .max(255, "Champ invalide.")
    .optional()
    .default(""),
});

const completeStaffProfileSchema = z.object({
  firstName: z
    .string({ error: "Votre prénom est requis." })
    .trim()
    .min(1, "Votre prénom est requis.")
    .max(255, "Le prénom ne peut pas dépasser 255 caractères."),
  lastName: z
    .string({ error: "Votre nom est requis." })
    .trim()
    .min(1, "Votre nom est requis.")
    .max(255, "Le nom ne peut pas dépasser 255 caractères."),
  usertypeId: positiveIntId("Le type de contributeur"),
});

const requestPasswordResetSchema = z.object({
  mail: z.preprocess(
    (val) => (typeof val === "string" ? val.trim().toLowerCase() : ""),
    z
      .string({ error: "Veuillez saisir une adresse e-mail valide." })
      .max(255, "L'adresse e-mail ne peut pas dépasser 255 caractères.")
      .email("Veuillez saisir une adresse e-mail valide."),
  ),
});

const resetPasswordSchema = z
  .object({
    token: z.preprocess(
      (val) => (typeof val === "string" ? val.trim() : ""),
      z.string({ error: "Jeton de réinitialisation invalide ou expiré." }).regex(
        /^[a-f0-9]{64}$/i,
        "Jeton de réinitialisation invalide ou expiré.",
      ),
    ),
    password: z.preprocess(
      (val) => (typeof val === "string" ? val : ""),
      z
        .string({ error: "Le mot de passe est requis." })
        .min(8, "Le mot de passe doit comporter au moins 8 caractères.")
        .max(255, "Le mot de passe ne peut pas dépasser 255 caractères."),
    ),
    password_verif: z.preprocess(
      (val) => (typeof val === "string" ? val : ""),
      z
        .string({ error: "Veuillez confirmer le mot de passe." })
        .min(1, "Veuillez confirmer le mot de passe.")
        .max(255, "La confirmation du mot de passe est trop longue."),
    ),
  })
  .refine((data) => data.password === data.password_verif, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["password_verif"],
  });

module.exports = {
  loginSchema,
  registerStaffSchema,
  completeStaffProfileSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
};
