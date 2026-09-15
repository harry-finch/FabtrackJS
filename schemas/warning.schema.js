const { z } = require("zod");

const createWarningSchema = z.object({
  userid: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : undefined),
    z.number({ required_error: "Veuillez sélectionner un usager." }).int().positive("Usager invalide."),
  ),
  warningtype: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : undefined),
    z.number({ required_error: "Veuillez sélectionner un type d'avertissement." }).int().positive("Type d'avertissement invalide."),
  ),
  comments: z.string().trim().optional().nullable(),
});

module.exports = {
  createWarningSchema,
};
