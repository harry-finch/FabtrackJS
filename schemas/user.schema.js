const { z } = require("zod");

const createUserSchema = z.object({
  newname: z
    .string({ required_error: "Le prénom est obligatoire." })
    .trim()
    .min(1, "Le prénom est obligatoire."),
  newsurname: z
    .string({ required_error: "Le nom de famille est obligatoire." })
    .trim()
    .min(1, "Le nom de famille est obligatoire."),
  newemail: z
    .string({ required_error: "L'adresse e-mail est obligatoire." })
    .trim()
    .email("Veuillez saisir une adresse e-mail valide."),
  newusertype: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : undefined),
    z.number({ required_error: "Le type d'usager est obligatoire." }).int().positive("Type d'usager invalide."),
  ),
  newbirthyear: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : null),
    z.number().int().min(1900, "Année de naissance invalide.").max(new Date().getFullYear(), "Année de naissance invalide.").nullable().optional(),
  ),
  newcomments: z
    .string()
    .trim()
    .optional()
    .nullable(),
  newrfid: z
    .string()
    .trim()
    .optional()
    .nullable(),
  newnewsletter: z.preprocess(
    (val) => val === "true" || val === "on" || val === true,
    z.boolean().default(false),
  ),
});

const updateUserSchema = z.object({
  name: z
    .string({ required_error: "Le prénom est obligatoire." })
    .trim()
    .min(1, "Le prénom ne peut pas être vide."),
  surname: z
    .string({ required_error: "Le nom de famille est obligatoire." })
    .trim()
    .min(1, "Le nom de famille ne peut pas être vide."),
  email: z
    .string({ required_error: "L'adresse e-mail est obligatoire." })
    .trim()
    .email("Veuillez saisir une adresse e-mail valide."),
  usertype: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : undefined),
    z.number().int().positive().optional(),
  ),
  birthyear: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : null),
    z.number().int().min(1900).max(new Date().getFullYear()).nullable().optional(),
  ),
  comments: z.string().trim().optional().nullable(),
  rfid: z.string().trim().optional().nullable(),
  newsletter: z.preprocess(
    (val) => val === "true" || val === "on" || val === true,
    z.boolean().default(false),
  ),
});

module.exports = {
  createUserSchema,
  updateUserSchema,
};
