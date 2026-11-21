const { z } = require("zod");
const { positiveIntId } = require("./common.schema.js");

const createWarningSchema = z.object({
  userid: positiveIntId("L'identifiant d'usager"),
  warningtype: positiveIntId("Le type d'avertissement"),
  comments: z
    .string({ error: "Le commentaire est invalide." })
    .trim()
    .max(255, "Le commentaire ne peut pas dépasser 255 caractères.")
    .optional()
    .nullable(),
});

module.exports = {
  createWarningSchema,
};
