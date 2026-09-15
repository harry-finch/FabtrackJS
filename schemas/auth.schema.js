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

const resetPasswordSchema = z.object({
  password: z
    .string({ required_error: "Le mot de passe est requis." })
    .min(6, "Le mot de passe doit comporter au moins 6 caractères."),
  id: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : undefined),
    z.number().int().positive("Identifiant invalide."),
  ),
});

module.exports = {
  loginSchema,
  registerStaffSchema,
  resetPasswordSchema,
};
