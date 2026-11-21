const { z } = require("zod");

const ISO_DATETIME_REGEX =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/i;

function preprocessOptionalNumber(val) {
  if (val === undefined) return undefined;
  if (val === null) return null;
  if (typeof val === "boolean" || typeof val === "object") return val;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "") return undefined;
    return Number(trimmed);
  }
  return val;
}

function preprocessRequiredNumber(val) {
  if (val === undefined || val === null) return undefined;
  if (typeof val === "boolean" || typeof val === "object") return val;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "") return undefined;
    return Number(trimmed);
  }
  return val;
}

const optionalPositiveInt = (fieldLabel = "ID") =>
  z.preprocess(
    preprocessOptionalNumber,
    z
      .number({ error: `${fieldLabel} doit être un entier positif.` })
      .finite(`${fieldLabel} doit être un nombre fini.`)
      .int(`${fieldLabel} doit être un entier.`)
      .positive(`${fieldLabel} doit être un nombre positif.`)
      .optional()
      .nullable()
  );

const requiredPositiveInt = (fieldLabel = "ID") =>
  z.preprocess(
    preprocessRequiredNumber,
    z
      .number({ error: `${fieldLabel} est requis et doit être un entier positif.` })
      .finite(`${fieldLabel} doit être un nombre fini.`)
      .int(`${fieldLabel} doit être un entier.`)
      .positive(`${fieldLabel} doit être un nombre positif.`)
  );

const optionalBoundedInt = (fieldLabel = "Limite", minVal = 1, maxVal = 200) =>
  z.preprocess(
    preprocessOptionalNumber,
    z
      .number({ error: `${fieldLabel} doit être un entier.` })
      .finite(`${fieldLabel} doit être un nombre fini.`)
      .int(`${fieldLabel} doit être un entier.`)
      .min(minVal, `${fieldLabel} doit être compris entre ${minVal} et ${maxVal}.`)
      .max(maxVal, `${fieldLabel} doit être compris entre ${minVal} et ${maxVal}.`)
      .optional()
      .nullable()
  );

const optionalNonNegativeNumber = (fieldLabel = "Valeur") =>
  z.preprocess(
    preprocessOptionalNumber,
    z
      .number({ error: `${fieldLabel} doit être un nombre valide.` })
      .finite(`${fieldLabel} doit être un nombre fini.`)
      .min(0, `${fieldLabel} ne peut pas être négatif.`)
      .optional()
      .nullable()
  );

const optionalNonNegativeInt = (fieldLabel = "Durée") =>
  z.preprocess(
    preprocessOptionalNumber,
    z
      .number({ error: `${fieldLabel} doit être un entier valide.` })
      .finite(`${fieldLabel} doit être un nombre fini.`)
      .int(`${fieldLabel} doit être un entier.`)
      .min(0, `${fieldLabel} ne peut pas être négatif.`)
      .optional()
      .nullable()
  );

const optionalIsoDate = (fieldLabel = "La date") =>
  z.preprocess(
    (val) => {
      if (val === undefined) return undefined;
      if (val === null) return null;
      if (typeof val === "string") {
        const trimmed = val.trim();
        return trimmed === "" ? undefined : trimmed;
      }
      return val;
    },
    z
      .string({ error: `${fieldLabel} doit être une date ISO 8601 valide.` })
      .refine(
        (str) => ISO_DATETIME_REGEX.test(str) && !Number.isNaN(Date.parse(str)),
        `${fieldLabel} doit être une date ISO 8601 valide.`
      )
      .optional()
      .nullable()
  );

const verifyCardUserSchema = z.object({
  rfid: z
    .string({ error: "Le code RFID / UID de la carte est requis." })
    .trim()
    .min(1, "Le code RFID / UID ne peut pas être vide."),
  machineId: optionalPositiveInt("L'identifiant de la machine (machineId)"),
});

const verifyCardQuerySchema = z
  .object({
    rfid: z.string().trim().min(1, "Le code RFID / UID ne peut pas être vide.").optional(),
    cardId: z.string().trim().min(1, "Le code RFID / UID ne peut pas être vide.").optional(),
    machineId: optionalPositiveInt("L'identifiant de la machine (machineId)"),
  })
  .refine((data) => Boolean(data.rfid || data.cardId), {
    message: "Le paramètre 'rfid' (ou 'cardId') est requis.",
    path: ["rfid"],
  });

const startMachineUsageSchema = z
  .object({
    rfid: z.string().trim().min(1, "Le code RFID ne peut pas être vide.").optional().nullable(),
    userId: optionalPositiveInt("L'identifiant utilisateur (userId)"),
    machineId: requiredPositiveInt("L'identifiant de la machine (machineId)"),
    startedAt: optionalIsoDate("La date de début (startedAt)"),
    historyId: optionalPositiveInt("L'identifiant de visite (historyId)"),
    gcodeName: z.string().trim().max(255).optional().nullable(),
    filamentQuantity: optionalNonNegativeNumber("La quantité de filament (filamentQuantity)"),
    filamentType: z.string().trim().max(100).optional().nullable(),
    printDuration: optionalNonNegativeInt("La durée d'impression (printDuration)"), // En secondes
    comments: z.string().trim().max(255).optional().nullable(),
  })
  .refine((data) => Boolean(data.rfid || data.userId), {
    message: "Vous devez fournir soit le code 'rfid' (badge NFC) soit l'identifiant 'userId'.",
    path: ["rfid"],
  });

const endMachineUsageSchema = z
  .object({
    activityId: optionalPositiveInt("L'identifiant de session (activityId)"),
    machineId: optionalPositiveInt("L'identifiant de la machine (machineId)"),
    rfid: z.string().trim().min(1, "Le code RFID ne peut pas être vide.").optional().nullable(),
    userId: optionalPositiveInt("L'identifiant utilisateur (userId)"),
    endedAt: optionalIsoDate("La date de fin (endedAt)"),
    gcodeName: z.string().trim().max(255).optional().nullable(),
    filamentQuantity: optionalNonNegativeNumber("La quantité de filament (filamentQuantity)"),
    filamentType: z.string().trim().max(100).optional().nullable(),
    printDuration: optionalNonNegativeInt("La durée d'impression (printDuration)"), // En secondes
    comments: z.string().trim().max(255).optional().nullable(),
  })
  .refine((data) => Boolean(data.activityId || data.machineId), {
    message: "Vous devez spécifier soit 'activityId' soit 'machineId' pour clôturer la session.",
    path: ["activityId"],
  });

const recordMachineUsageSchema = z
  .object({
    rfid: z.string().trim().min(1, "Le code RFID ne peut pas être vide.").optional().nullable(),
    userId: optionalPositiveInt("L'identifiant utilisateur (userId)"),
    machineId: requiredPositiveInt("L'identifiant de la machine (machineId)"),
    historyId: optionalPositiveInt("L'identifiant de visite (historyId)"),
    startedAt: optionalIsoDate("La date de début (startedAt)"),
    endedAt: optionalIsoDate("La date de fin (endedAt)"),
    gcodeName: z.string().trim().max(255).optional().nullable(),
    filamentQuantity: optionalNonNegativeNumber("La quantité de filament (filamentQuantity)"),
    filamentType: z.string().trim().max(100).optional().nullable(),
    printDuration: optionalNonNegativeInt("La durée d'impression (printDuration)"), // En secondes
    comments: z.string().trim().max(255).optional().nullable(),
  })
  .refine((data) => Boolean(data.rfid || data.userId), {
    message: "Vous devez fournir soit le code 'rfid' (badge NFC) soit l'identifiant 'userId'.",
    path: ["rfid"],
  })
  .refine(
    (data) => {
      if (!data.startedAt || !data.endedAt) return true;
      return new Date(data.endedAt).getTime() >= new Date(data.startedAt).getTime();
    },
    {
      message: "La date de fin ('endedAt') doit être postérieure ou égale à la date de début ('startedAt').",
      path: ["endedAt"],
    }
  );

const machineUsageQuerySchema = z.object({
  machineId: requiredPositiveInt("Le paramètre 'machineId'"),
  limit: optionalBoundedInt("Le paramètre 'limit'", 1, 200),
});

module.exports = {
  verifyCardUserSchema,
  verifyCardQuerySchema,
  startMachineUsageSchema,
  endMachineUsageSchema,
  recordMachineUsageSchema,
  machineUsageQuerySchema,
};
