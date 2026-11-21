const { z } = require("zod");

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/i;

function preprocessRequiredInt(val) {
  if (val === undefined || val === null) return undefined;
  if (typeof val === "boolean" || typeof val === "object") return val;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "" || trimmed === "null" || trimmed === "undefined") return undefined;
    return Number(trimmed);
  }
  return val;
}

function preprocessOptionalInt(val) {
  if (val === undefined) return undefined;
  if (val === null) return null;
  if (typeof val === "boolean" || typeof val === "object") return val;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "" || trimmed === "null" || trimmed === "undefined") return null;
    return Number(trimmed);
  }
  return val;
}

function preprocessDecimal(val, defaultValue = undefined) {
  if (val === undefined || val === null) return defaultValue;
  if (typeof val === "boolean" || typeof val === "object") return val;
  if (typeof val === "string") {
    const cleaned = val.replace(",", ".").trim();
    if (cleaned === "" || cleaned === "null") return defaultValue;
    return Number(cleaned);
  }
  return Number(val);
}

function preprocessCheckbox(val) {
  return val === true || val === "true" || val === "on" || val === "1" || val === 1;
}

function positiveIntId(label = "L'identifiant") {
  return z.preprocess(
    preprocessRequiredInt,
    z
      .number({ error: `${label} est invalide.` })
      .finite(`${label} est invalide.`)
      .int(`${label} doit être un entier positif.`)
      .positive(`${label} doit être un entier positif.`),
  );
}

function optionalPositiveIntId(label = "L'identifiant") {
  return z.preprocess(
    preprocessOptionalInt,
    z
      .number({ error: `${label} est invalide.` })
      .finite(`${label} est invalide.`)
      .int(`${label} doit être un entier positif.`)
      .positive(`${label} doit être un entier positif.`)
      .nullable()
      .optional(),
  );
}

function optionalTrimmedString(maxLen = 255, label = "Ce champ") {
  return z.preprocess(
    (val) => {
      if (val === undefined) return undefined;
      if (val === null) return null;
      return typeof val === "string" ? val.trim() : val;
    },
    z
      .string({ error: `${label} doit être une chaîne de caractères.` })
      .max(maxLen, `${label} ne peut pas dépasser ${maxLen} caractères.`)
      .nullable()
      .optional(),
  );
}

function requiredTrimmedString(label, { min = 1, max = 255 } = {}) {
  return z
    .string({ error: `${label} est obligatoire.` })
    .trim()
    .min(min, min === 1 ? `${label} ne peut pas être vide.` : `${label} doit comporter au moins ${min} caractères.`)
    .max(max, `${label} ne peut pas dépasser ${max} caractères.`);
}

function isValidCalendarDateString(str) {
  if (!ISO_DATE_RE.test(str)) return false;
  const parsed = Date.parse(str);
  if (Number.isNaN(parsed)) return false;
  // Catch impossible calendar dates like 2026-02-31
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (
      check.getUTCFullYear() !== year ||
      check.getUTCMonth() + 1 !== month ||
      check.getUTCDate() !== day
    ) {
      return false;
    }
  }
  return true;
}

function optionalDateString(label = "La date") {
  return z.preprocess(
    (val) => {
      if (val === undefined || val === null) return undefined;
      if (typeof val === "string") {
        const trimmed = val.trim();
        return trimmed === "" ? undefined : trimmed;
      }
      return val;
    },
    z
      .string({ error: `${label} est invalide.` })
      .refine(isValidCalendarDateString, `${label} doit être une date valide (YYYY-MM-DD).`)
      .optional(),
  );
}

function optionalEmail(maxLen = 255, message = "Veuillez saisir une adresse e-mail valide.") {
  return z.preprocess(
    (val) => {
      if (val === undefined || val === null) return null;
      if (typeof val === "string") {
        const trimmed = val.trim();
        return trimmed === "" ? null : trimmed;
      }
      return val;
    },
    z
      .string({ error: message })
      .max(maxLen, `L'adresse e-mail ne peut pas dépasser ${maxLen} caractères.`)
      .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message })
      .nullable()
      .optional(),
  );
}

const idParamSchema = z.object({
  id: positiveIntId("L'identifiant"),
});

const issueIdParamSchema = z.object({
  issueId: positiveIntId("L'identifiant du signalement"),
});

const maintenanceIdParamSchema = z.object({
  maintenanceId: positiveIntId("L'identifiant de maintenance"),
});

const workshopUserParamsSchema = z.object({
  workshopId: positiveIntId("L'identifiant de l'atelier"),
  userId: positiveIntId("L'identifiant de l'usager"),
});

const userWorkshopParamsSchema = z.object({
  id: positiveIntId("L'identifiant de l'usager"),
  workshopId: positiveIntId("L'identifiant de l'atelier"),
});

const optionalPageNumber = z.preprocess(
  (val) => {
    if (val === undefined || val === null || val === "") return 1;
    return Number(val);
  },
  z
    .number({ error: "Le numéro de page est invalide." })
    .finite("Le numéro de page est invalide.")
    .int("Le numéro de page doit être un entier positif.")
    .min(1, "Le numéro de page doit être supérieur ou égal à 1.")
    .max(100000, "Le numéro de page est trop élevé.")
    .default(1),
);

module.exports = {
  preprocessRequiredInt,
  preprocessOptionalInt,
  preprocessDecimal,
  preprocessCheckbox,
  positiveIntId,
  optionalPositiveIntId,
  optionalTrimmedString,
  requiredTrimmedString,
  isValidCalendarDateString,
  optionalDateString,
  optionalEmail,
  optionalPageNumber,
  idParamSchema,
  issueIdParamSchema,
  maintenanceIdParamSchema,
  workshopUserParamsSchema,
  userWorkshopParamsSchema,
};
