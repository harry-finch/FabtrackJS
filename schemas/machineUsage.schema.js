const { z } = require("zod");

// Helper to preprocess numeric fields (e.g. from JSON body or URL query)
const optionalNumber = () =>
  z.preprocess((val) => {
    if (val === undefined || val === null || val === "") return undefined;
    const num = Number(val);
    return isNaN(num) ? undefined : num;
  }, z.number().optional().nullable());

const requiredNumber = (fieldLabel = "ID") =>
  z.preprocess((val) => {
    if (val === undefined || val === null || val === "") return undefined;
    const num = Number(val);
    return isNaN(num) ? undefined : num;
  }, z.number({ required_error: `${fieldLabel} est requis.` }).int().positive(`${fieldLabel} doit être un nombre positif.`));

const verifyCardUserSchema = z.object({
  rfid: z
    .string({ required_error: "Le code RFID / UID de la carte est requis." })
    .trim()
    .min(1, "Le code RFID / UID ne peut pas être vide."),
  machineId: optionalNumber(),
});

const startMachineUsageSchema = z
  .object({
    rfid: z.string().trim().min(1).optional().nullable(),
    userId: optionalNumber(),
    machineId: requiredNumber("L'identifiant de la machine (machineId)"),
    startedAt: z.string().datetime({ offset: true }).optional().or(z.string().optional()).nullable(),
    historyId: optionalNumber(),
    gcodeName: z.string().trim().max(255).optional().nullable(),
    filamentQuantity: optionalNumber(),
    filamentType: z.string().trim().max(100).optional().nullable(),
    printDuration: optionalNumber(), // En secondes
    comments: z.string().trim().max(255).optional().nullable(),
  })
  .refine((data) => data.rfid || data.userId, {
    message: "Vous devez fournir soit le code 'rfid' (badge NFC) soit l'identifiant 'userId'.",
    path: ["rfid"],
  });

const endMachineUsageSchema = z
  .object({
    activityId: optionalNumber(),
    machineId: optionalNumber(),
    rfid: z.string().trim().min(1).optional().nullable(),
    userId: optionalNumber(),
    endedAt: z.string().datetime({ offset: true }).optional().or(z.string().optional()).nullable(),
    gcodeName: z.string().trim().max(255).optional().nullable(),
    filamentQuantity: optionalNumber(),
    filamentType: z.string().trim().max(100).optional().nullable(),
    printDuration: optionalNumber(), // En secondes
    comments: z.string().trim().max(255).optional().nullable(),
  })
  .refine((data) => data.activityId || data.machineId, {
    message: "Vous devez spécifier soit 'activityId' soit 'machineId' pour clôturer la session.",
    path: ["activityId"],
  });

const recordMachineUsageSchema = z
  .object({
    rfid: z.string().trim().min(1).optional().nullable(),
    userId: optionalNumber(),
    machineId: requiredNumber("L'identifiant de la machine (machineId)"),
    historyId: optionalNumber(),
    startedAt: z.string().datetime({ offset: true }).optional().or(z.string().optional()).nullable(),
    endedAt: z.string().datetime({ offset: true }).optional().or(z.string().optional()).nullable(),
    gcodeName: z.string().trim().max(255).optional().nullable(),
    filamentQuantity: optionalNumber(),
    filamentType: z.string().trim().max(100).optional().nullable(),
    printDuration: optionalNumber(), // En secondes
    comments: z.string().trim().max(255).optional().nullable(),
  })
  .refine((data) => data.rfid || data.userId, {
    message: "Vous devez fournir soit le code 'rfid' (badge NFC) soit l'identifiant 'userId'.",
    path: ["rfid"],
  });

module.exports = {
  verifyCardUserSchema,
  startMachineUsageSchema,
  endMachineUsageSchema,
  recordMachineUsageSchema,
};

