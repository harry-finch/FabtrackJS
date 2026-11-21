const { z } = require("zod");

const createVisitSchema = z.object({
  userid: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : undefined),
    z.number({ required_error: "Veuillez sélectionner un usager." }).int().positive("Identifiant usager invalide."),
  ),
  projecttype: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" && val !== "null" ? Number(val) : undefined),
    z.number().int().positive().optional().nullable(),
  ),
  projectid: z.string().optional().nullable(),
  userprojectid: z.string().optional().nullable(),
  documentation: z.string().trim().optional().nullable(),
  comments: z.string().trim().optional().nullable(),
  teachingUnitId: z.string().optional().nullable(),
  unregisteredUeName: z.string().trim().optional().nullable(),
  unregisteredUeContact: z.string().trim().optional().nullable(),
  repairObject: z.string().trim().optional().nullable(),
  workshopId: z.string().optional().nullable(),
  sorbonneEntity: z.string().trim().max(255).optional().nullable(),
});

function preprocessDecimalAmount(val) {
  if (val === undefined || val === null) return undefined;
  if (typeof val === "boolean" || typeof val === "object") return val;
  if (typeof val === "string") {
    const cleaned = val.replace(",", ".").trim();
    return cleaned === "" ? undefined : Number(cleaned);
  }
  return Number(val);
}

const creditSchema = z.object({
  userid: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : undefined),
    z.number({ error: "Identifiant d'usager manquant." }).int().positive("Identifiant usager invalide."),
  ),
  money: z.preprocess(
    preprocessDecimalAmount,
    z
      .number({ error: "Veuillez saisir un montant valide." })
      .finite("Le montant saisi n'est pas un nombre valide.")
      .positive("Le montant à créditer doit être strictement positif (> 0)."),
  ),
});

const adjustBalanceSchema = z
  .object({
    userid: z.preprocess(
      (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : undefined),
      z.number({ error: "Identifiant d'usager manquant." }).int().positive("Identifiant usager invalide."),
    ),
    operation: z.enum(["debit", "credit"]).optional(),
    amount: z.preprocess(
      preprocessDecimalAmount,
      z
        .number({ error: "Veuillez saisir un montant valide." })
        .finite("Le montant saisi n'est pas un nombre valide.")
        .refine((n) => n !== 0, {
          message: "Le montant de l'ajustement ne peut pas être égal à 0.",
        }),
    ),
    reason: z
      .string({ error: "Veuillez préciser le motif de l'ajustement." })
      .trim()
      .min(3, "Le motif de l'ajustement doit contenir au moins 3 caractères.")
      .max(255, "Le motif de l'ajustement ne peut pas dépasser 255 caractères."),
  })
  .transform((data) => {
    let delta = data.amount;
    if (data.operation === "debit") {
      delta = -Math.abs(data.amount);
    } else if (data.operation === "credit") {
      delta = Math.abs(data.amount);
    }
    return {
      ...data,
      delta: Number(delta.toFixed(2)),
    };
  });

const activitySchema = z.object({
  activityhistoryid: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" && val !== "null" ? Number(val) : null),
    z.number().int().positive().nullable().optional(),
  ),
  activityuserid: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" && val !== "null" ? Number(val) : null),
    z.number().int().positive().nullable().optional(),
  ),
  machineId: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" && val !== "null" ? Number(val) : null),
    z.number().int().positive().nullable().optional(),
  ),
  equipmentId: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" && val !== "null" ? Number(val) : null),
    z.number().int().positive().nullable().optional(),
  ),
  borrowDurationDays: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : 7),
    z.number().int().positive().default(7),
  ),
  consumable: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" && val !== "null" ? Number(val) : null),
    z.number().int().positive().nullable().optional(),
  ),
  quantity: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : 1),
    z.number().int().min(1, "La quantité doit être supérieure ou égale à 1.").default(1),
  ),
});

const returnEquipmentSchema = z.object({
  returnNotes: z.string().trim().max(255, "La note de retour ne peut pas dépasser 255 caractères.").optional().nullable(),
});

const updateCommentSchema = z.object({
  historyid: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : undefined),
    z.number({ required_error: "Identifiant de session manquant." }).int().positive("Identifiant de session invalide."),
  ),
  comments: z.string().trim().optional().nullable(),
});

module.exports = {
  createVisitSchema,
  creditSchema,
  adjustBalanceSchema,
  activitySchema,
  returnEquipmentSchema,
  updateCommentSchema,
};
