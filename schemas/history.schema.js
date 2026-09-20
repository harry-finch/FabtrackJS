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

const creditSchema = z.object({
  userid: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : undefined),
    z.number({ required_error: "Identifiant d'usager manquant." }).int().positive("Identifiant usager invalide."),
  ),
  money: z.preprocess(
    (val) => {
      if (typeof val === "string") {
        const cleaned = val.replace(",", ".").trim();
        return Number(cleaned);
      }
      return Number(val);
    },
    z.number({ required_error: "Veuillez saisir un montant valide." }).refine((n) => !isNaN(n), {
      message: "Le montant saisi n'est pas un nombre valide.",
    }),
  ),
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
  activitySchema,
  returnEquipmentSchema,
  updateCommentSchema,
};
