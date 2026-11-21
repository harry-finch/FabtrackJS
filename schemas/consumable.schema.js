const { z } = require("zod");
const {
  preprocessDecimal,
  preprocessOptionalInt,
  optionalPositiveIntId,
  positiveIntId,
} = require("./common.schema.js");

const consumableBaseFields = {
  name: z
    .string({ error: "Le nom du consommable est obligatoire." })
    .trim()
    .min(1, "Le nom du consommable ne peut pas être vide.")
    .max(255, "Le nom du consommable ne peut pas dépasser 255 caractères."),
  cost: z.preprocess(
    (val) => preprocessDecimal(val, 0),
    z
      .number({ error: "Le coût unitaire doit être un nombre valide." })
      .finite("Le coût unitaire doit être un nombre valide.")
      .min(0, "Le coût unitaire doit être supérieur ou égal à 0.")
      .max(99999999.99, "Le coût unitaire est trop élevé.")
      .default(0),
  ),
  stock: z.preprocess(
    (val) => {
      const parsed = preprocessOptionalInt(val);
      return parsed === null || parsed === undefined ? 0 : parsed;
    },
    z
      .number({ error: "Le stock doit être un entier valide." })
      .int("Le stock doit être un entier.")
      .min(0, "Le stock ne peut pas être négatif.")
      .default(0),
  ),
  reorderThreshold: z.preprocess(
    (val) => {
      const parsed = preprocessOptionalInt(val);
      return parsed === null || parsed === undefined ? 10 : parsed;
    },
    z
      .number({ error: "Le seuil d'alerte doit être un entier valide." })
      .int("Le seuil d'alerte doit être un entier.")
      .min(0, "Le seuil d'alerte ne peut pas être négatif.")
      .default(10),
  ),
  categoryId: optionalPositiveIntId("La catégorie"),
  unit: z
    .string({ error: "L'unité est invalide." })
    .trim()
    .min(1, "L'unité ne peut pas être vide.")
    .max(30, "L'unité ne peut pas dépasser 30 caractères.")
    .optional()
    .default("u"),
  stockUnit: z
    .string({ error: "L'unité de conditionnement est invalide." })
    .trim()
    .max(50, "L'unité de conditionnement ne peut pas dépasser 50 caractères.")
    .optional()
    .default("u"),
  unitsPerPack: z.preprocess(
    (val) => preprocessDecimal(val, 1),
    z
      .number({ error: "Le nombre d'unités par lot doit être un nombre valide." })
      .finite("Le nombre d'unités par lot doit être un nombre valide.")
      .positive("Le nombre d'unités par lot doit être strictement positif.")
      .default(1),
  ),
};

const addConsumableSchema = z.object(consumableBaseFields);

const updateConsumableSchema = z
  .object({
    id: optionalPositiveIntId("L'identifiant du consommable"),
    consumableid: optionalPositiveIntId("L'identifiant du consommable"),
    ...consumableBaseFields,
  })
  .refine((data) => Boolean(data.id || data.consumableid), {
    message: "Identifiant du consommable manquant.",
    path: ["id"],
  })
  .transform((data) => ({
    ...data,
    id: data.consumableid || data.id,
    consumableid: data.consumableid || data.id,
  }));

const restockConsumableSchema = z
  .object({
    id: optionalPositiveIntId("L'identifiant du consommable"),
    consumableid: optionalPositiveIntId("L'identifiant du consommable"),
    restockMode: z.enum(["units", "packs"], { error: "Mode de réapprovisionnement invalide." }).optional().default("units"),
    packages: z.preprocess(
      (val) => preprocessDecimal(val, undefined),
      z
        .number({ error: "Nombre de conditionnements invalide." })
        .finite("Nombre de conditionnements invalide.")
        .positive("Le nombre de conditionnements doit être supérieur à 0.")
        .optional(),
    ),
    quantity: z.preprocess(
      preprocessOptionalInt,
      z
        .number({ error: "La quantité doit être un entier positif." })
        .int("La quantité doit être un entier positif.")
        .positive("La quantité doit être supérieure à 0.")
        .nullable()
        .optional(),
    ),
  })
  .refine((data) => Boolean(data.id || data.consumableid), {
    message: "Identifiant du consommable manquant.",
    path: ["id"],
  })
  .refine(
    (data) =>
      data.restockMode === "packs"
        ? typeof data.packages === "number" && data.packages > 0
        : typeof data.quantity === "number" && data.quantity > 0,
    {
      message: "Veuillez saisir une quantité positive à réapprovisionner.",
      path: ["quantity"],
    },
  )
  .transform((data) => ({
    ...data,
    id: data.consumableid || data.id,
    consumableid: data.consumableid || data.id,
  }));

module.exports = {
  addConsumableSchema,
  updateConsumableSchema,
  restockConsumableSchema,
  positiveIntId,
};
