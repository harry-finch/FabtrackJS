const { z } = require("zod");
const {
  positiveIntId,
  optionalPositiveIntId,
  preprocessOptionalInt,
  preprocessCheckbox,
  optionalDateString,
} = require("./common.schema.js");

const dynamicBirthYearSchema = z.preprocess(
  preprocessOptionalInt,
  z
    .number({ error: "Année de naissance invalide." })
    .finite("Année de naissance invalide.")
    .int("Année de naissance invalide.")
    .min(1900, "Année de naissance invalide.")
    .nullable()
    .optional()
    .refine(
      (val) => val === null || val === undefined || val <= new Date().getFullYear(),
      { message: "Année de naissance invalide." },
    ),
);

const createUserSchema = z.object({
  newname: z
    .string({ error: "Le prénom est obligatoire." })
    .trim()
    .min(1, "Le prénom est obligatoire.")
    .max(255, "Le prénom ne peut pas dépasser 255 caractères."),
  newsurname: z
    .string({ error: "Le nom de famille est obligatoire." })
    .trim()
    .min(1, "Le nom de famille est obligatoire.")
    .max(255, "Le nom de famille ne peut pas dépasser 255 caractères."),
  newemail: z
    .string({ error: "L'adresse e-mail est obligatoire." })
    .trim()
    .max(255, "L'adresse e-mail ne peut pas dépasser 255 caractères.")
    .email("Veuillez saisir une adresse e-mail valide."),
  newusertype: positiveIntId("Le type d'usager"),
  newbirthyear: dynamicBirthYearSchema,
  newcomments: z
    .string({ error: "Le commentaire est invalide." })
    .trim()
    .max(255, "Le commentaire ne peut pas dépasser 255 caractères.")
    .optional()
    .nullable(),
  newrfid: z
    .string({ error: "Le badge RFID est invalide." })
    .trim()
    .max(100, "Le code RFID ne peut pas dépasser 100 caractères.")
    .optional()
    .nullable(),
  newnewsletter: z.preprocess(preprocessCheckbox, z.boolean().default(false)),
});

const updateUserSchema = z.object({
  name: z
    .string({ error: "Le prénom est obligatoire." })
    .trim()
    .min(1, "Le prénom ne peut pas être vide.")
    .max(255, "Le prénom ne peut pas dépasser 255 caractères."),
  surname: z
    .string({ error: "Le nom de famille est obligatoire." })
    .trim()
    .min(1, "Le nom de famille ne peut pas être vide.")
    .max(255, "Le nom de famille ne peut pas dépasser 255 caractères."),
  email: z
    .string({ error: "L'adresse e-mail est obligatoire." })
    .trim()
    .max(255, "L'adresse e-mail ne peut pas dépasser 255 caractères.")
    .email("Veuillez saisir une adresse e-mail valide."),
  usertype: optionalPositiveIntId("Le type d'usager"),
  birthyear: dynamicBirthYearSchema,
  comments: z
    .string({ error: "Le commentaire est invalide." })
    .trim()
    .max(255, "Le commentaire ne peut pas dépasser 255 caractères.")
    .optional()
    .nullable(),
  rfid: z
    .string({ error: "Le badge RFID est invalide." })
    .trim()
    .max(100, "Le code RFID ne peut pas dépasser 100 caractères.")
    .optional()
    .nullable(),
  newsletter: z.preprocess(preprocessCheckbox, z.boolean().default(false)),
  isExpert: z.preprocess(preprocessCheckbox, z.boolean().default(false)),
  termsAccepted: z.preprocess(preprocessCheckbox, z.boolean().default(false)),
});

const userWorkshopInterestSchema = z.object({
  workshopId: positiveIntId("L'atelier"),
});

const userWorkshopBadgeSchema = z.object({
  workshopId: positiveIntId("L'atelier"),
  removeInterest: z.preprocess(preprocessCheckbox, z.boolean().optional().default(false)),
  awardedAt: optionalDateString("La date d'attribution"),
  awardedBy: z
    .string({ error: "Le nom de l'évaluateur est invalide." })
    .trim()
    .max(255, "Le nom de l'évaluateur ne peut pas dépasser 255 caractères.")
    .optional()
    .nullable(),
});

module.exports = {
  createUserSchema,
  updateUserSchema,
  userWorkshopInterestSchema,
  userWorkshopBadgeSchema,
};
