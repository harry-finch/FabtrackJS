const { z } = require("zod");

const rfidScanSchema = z.object({
  rfid: z
    .string({ required_error: "Le code RFID est requis." })
    .trim()
    .min(1, "Le code RFID ne peut pas être vide."),
  workspaceId: z.preprocess(
    (val) => (val !== undefined && val !== null && val !== "" ? Number(val) : undefined),
    z.number().int().positive().optional().nullable(),
  ),
});

module.exports = {
  rfidScanSchema,
};
