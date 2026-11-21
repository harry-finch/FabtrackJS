const { z } = require("zod");

const loginSchema = z.object({
  username: z
    .string({ required_error: "Veuillez saisir votre nom d'utilisateur." })
    .trim()
    .min(1, "Veuillez saisir votre nom d'utilisateur."),
  password: z
    .string({ required_error: "Veuillez saisir votre mot de passe." })
    .min(1, "Veuillez saisir votre mot de passe."),
});

const registerStaffSchema = z.object({
  username: z
    .string({ required_error: "Le nom d'utilisateur est requis." })
    .trim()
    .min(1, "Le nom d'utilisateur ne peut pas être vide."),
  mail: z
    .string({ required_error: "L'adresse e-mail est requise." })
    .trim()
    .email("Veuillez saisir une adresse e-mail valide."),
  password: z
    .string({ required_error: "Le mot de passe est requis." })
    .min(6, "Le mot de passe doit comporter au moins 6 caractères."),
});

const requestPasswordResetSchema = z.object({
  mail: z.preprocess(
    (val) => (typeof val === "string" ? val.trim().toLowerCase() : ""),
    z.string().email("Veuillez saisir une adresse e-mail valide."),
  ),
});

const resetPasswordSchema = z
  .object({
    token: z.preprocess(
      (val) => (typeof val === "string" ? val.trim() : ""),
      z.string().regex(/^[a-f0-9]{64}$/i, "Jeton de réinitialisation invalide ou expiré."),
    ),
    password: z.preprocess(
      (val) => (typeof val === "string" ? val : ""),
      z.string().min(8, "Le mot de passe doit comporter au moins 8 caractères."),
    ),
    password_verif: z.preprocess(
      (val) => (typeof val === "string" ? val : ""),
      z.string().min(1, "Veuillez confirmer le mot de passe."),
    ),
  })
  .refine((data) => data.password === data.password_verif, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["password_verif"],
  });

module.exports = {
  loginSchema,
  registerStaffSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
};
