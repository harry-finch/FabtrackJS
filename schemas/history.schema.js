const { z } = require("zod");
const {
  positiveIntId,
  optionalPositiveIntId,
  optionalDateString,
  preprocessOptionalInt,
} = require("./common.schema.js");

const createVisitSchema = z.object({
  userid: positiveIntId("L'identifiant usager"),
  projecttype: optionalPositiveIntId("Le motif de la visite"),
  projectid: z.string({ error: "Identifiant projet invalide." }).trim().max(255).optional().nullable(),
  userprojectid: z.string({ error: "Identifiant projet utilisateur invalide." }).trim().max(255).optional().nullable(),
  documentation: z.string({ error: "Documentation invalide." }).trim().max(255, "L'URL de documentation ne peut pas dépasser 255 caractères.").optional().nullable(),
  comments: z.string({ error: "Commentaire invalide." }).trim().max(255, "Le commentaire ne peut pas dépasser 255 caractères.").optional().nullable(),
  teachingUnitId: z.string({ error: "Identifiant d'UE invalide." }).trim().max(50).optional().nullable(),
  unregisteredUeName: z.string().trim().max(255, "Le nom de l'UE ne peut pas dépasser 255 caractères.").optional().nullable(),
  unregisteredUeContact: z.string().trim().max(255, "Le contact UE ne peut pas dépasser 255 caractères.").optional().nullable(),
  repairObject: z.string().trim().max(255, "L'objet à réparer ne peut pas dépasser 255 caractères.").optional().nullable(),
  workshopId: z.string().trim().max(50).optional().nullable(),
  sorbonneEntity: z.string().trim().max(255, "L'entité Sorbonne ne peut pas dépasser 255 caractères.").optional().nullable(),
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
  userid: positiveIntId("L'identifiant d'usager"),
  money: z.preprocess(
    preprocessDecimalAmount,
    z
      .number({ error: "Veuillez saisir un montant valide." })
      .finite("Le montant saisi n'est pas un nombre valide.")
      .positive("Le montant à créditer doit être strictement positif (> 0).")
      .max(99999999.99, "Le montant saisi est trop élevé."),
  ),
});

const adjustBalanceSchema = z
  .object({
    userid: positiveIntId("L'identifiant d'usager"),
    operation: z.enum(["debit", "credit"], { error: "Opération d'ajustement invalide." }).optional(),
    amount: z.preprocess(
      preprocessDecimalAmount,
      z
        .number({ error: "Veuillez saisir un montant valide." })
        .finite("Le montant saisi n'est pas un nombre valide.")
        .refine((n) => n !== 0, {
          message: "Le montant de l'ajustement ne peut pas être égal à 0.",
        })
        .refine((n) => Math.abs(n) <= 99999999.99, {
          message: "Le montant saisi est trop élevé.",
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
  activityhistoryid: optionalPositiveIntId("L'identifiant de visite"),
  activityuserid: optionalPositiveIntId("L'identifiant d'usager"),
  machineId: optionalPositiveIntId("L'identifiant de machine"),
  equipmentId: optionalPositiveIntId("L'identifiant d'équipement"),
  borrowDurationDays: z.preprocess(
    (val) => {
      const parsed = preprocessOptionalInt(val);
      return parsed === null || parsed === undefined ? 7 : parsed;
    },
    z
      .number({ error: "La durée d'emprunt doit être un entier positif." })
      .int("La durée d'emprunt doit être un entier positif.")
      .positive("La durée d'emprunt doit être supérieure à 0.")
      .max(365, "La durée d'emprunt ne peut pas dépasser 365 jours.")
      .default(7),
  ),
  consumable: optionalPositiveIntId("L'identifiant de consommable"),
  quantity: z.preprocess(
    (val) => {
      const parsed = preprocessOptionalInt(val);
      return parsed === null || parsed === undefined ? 1 : parsed;
    },
    z
      .number({ error: "La quantité doit être un entier valide." })
      .int("La quantité doit être un entier.")
      .min(1, "La quantité doit être supérieure ou égale à 1.")
      .max(100000, "La quantité est trop élevée.")
      .default(1),
  ),
});

const returnEquipmentSchema = z.object({
  returnNotes: z
    .string({ error: "La note de retour est invalide." })
    .trim()
    .max(255, "La note de retour ne peut pas dépasser 255 caractères.")
    .optional()
    .nullable(),
});

const updateCommentSchema = z.object({
  historyid: positiveIntId("L'identifiant de session"),
  comments: z
    .string({ error: "Le commentaire est invalide." })
    .trim()
    .max(255, "Le commentaire ne peut pas dépasser 255 caractères.")
    .optional()
    .nullable(),
});

const REPAIR_STATUSES = [
  "PENDING",
  "REPAIRED",
  "PARTIALLY_REPAIRED",
  "NOT_REPAIRED",
  "NEEDS_RETURN",
];

const exitRepairSchema = z.object({
  historyid: positiveIntId("L'identifiant de visite"),
  repairStatus: z.enum(REPAIR_STATUSES, {
    error: "Statut de réparation invalide.",
  }),
  repairNotes: z
    .string({ error: "Les notes de réparation sont invalides." })
    .trim()
    .max(5000, "Les notes de réparation ne peuvent pas dépasser 5000 caractères.")
    .optional()
    .nullable(),
});

const updateHistorySchema = z.object({
  historyid: positiveIntId("L'identifiant de visite"),
  arrival: optionalDateString("La date d'arrivée"),
  departure: optionalDateString("La date de départ"),
  workspaceId: optionalPositiveIntId("L'espace de travail"),
  comments: z
    .string({ error: "Le commentaire est invalide." })
    .trim()
    .max(255, "Le commentaire ne peut pas dépasser 255 caractères.")
    .optional()
    .nullable(),
});

const updateProjectTitleSchema = z.object({
  customTitle: z
    .string({ error: "Le nom du projet est invalide." })
    .trim()
    .max(255, "Le nom personnalisé ne peut pas dépasser 255 caractères.")
    .optional()
    .nullable(),
});

module.exports = {
  REPAIR_STATUSES,
  createVisitSchema,
  creditSchema,
  adjustBalanceSchema,
  activitySchema,
  returnEquipmentSchema,
  updateCommentSchema,
  exitRepairSchema,
  updateHistorySchema,
  updateProjectTitleSchema,
};
