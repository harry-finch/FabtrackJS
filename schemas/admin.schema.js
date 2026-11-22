const { z } = require("zod");
const {
  positiveIntId,
  optionalPositiveIntId,
  optionalTrimmedString,
  requiredTrimmedString,
  optionalDateString,
  optionalEmail,
  optionalPageNumber,
  preprocessCheckbox,
  preprocessOptionalInt,
} = require("./common.schema.js");

// ---------------------------------------------------------------------------
// Generic reference-table CRUD schemas
// ---------------------------------------------------------------------------

const createAccessLevelSchema = z.object({
  name: requiredTrimmedString("Le nom du niveau d'accès", { max: 255 }),
  description: z
    .string({ error: "La description est obligatoire." })
    .trim()
    .max(255, "La description ne peut pas dépasser 255 caractères.")
    .optional()
    .default(""),
});

const updateAccessLevelSchema = z.object({
  accessid: positiveIntId("L'identifiant du niveau d'accès"),
  name: requiredTrimmedString("Le nom du niveau d'accès", { max: 255 }),
  description: z
    .string({ error: "La description est invalide." })
    .trim()
    .max(255, "La description ne peut pas dépasser 255 caractères.")
    .optional()
    .default(""),
});

const createCategorySchema = z.object({
  name: requiredTrimmedString("Le nom de la catégorie", { max: 255 }),
  workspaceId: optionalPositiveIntId("L'espace de travail"),
});

const updateCategorySchema = z.object({
  categoryid: positiveIntId("L'identifiant de la catégorie"),
  name: requiredTrimmedString("Le nom de la catégorie", { max: 255 }),
  workspaceId: optionalPositiveIntId("L'espace de travail"),
});

const createLocationSchema = z.object({
  name: requiredTrimmedString("Le nom de l'emplacement", { max: 255 }),
  description: optionalTrimmedString(255, "La description"),
});

const updateLocationSchema = z.object({
  locationid: positiveIntId("L'identifiant de l'emplacement"),
  name: requiredTrimmedString("Le nom de l'emplacement", { max: 255 }),
  description: optionalTrimmedString(255, "La description"),
});

const createProjecttypeSchema = z.object({
  name: requiredTrimmedString("Le nom du motif de visite", { max: 255 }),
});

const updateProjecttypeSchema = z.object({
  projecttypeid: positiveIntId("L'identifiant du motif de visite"),
  name: requiredTrimmedString("Le nom du motif de visite", { max: 255 }),
});

const createUsertypeSchema = z.object({
  name: requiredTrimmedString("Le nom du type d'usager", { max: 255 }),
});

const updateUsertypeSchema = z.object({
  usertypeid: positiveIntId("L'identifiant du type d'usager"),
  name: requiredTrimmedString("Le nom du type d'usager", { max: 255 }),
});

const createWarningtypeSchema = z.object({
  name: requiredTrimmedString("Le nom du type d'avertissement", { max: 255 }),
  icon: optionalTrimmedString(255, "L'icône"),
});

const updateWarningtypeSchema = z.object({
  warningtypeid: positiveIntId("L'identifiant du type d'avertissement"),
  name: requiredTrimmedString("Le nom du type d'avertissement", { max: 255 }),
  icon: optionalTrimmedString(255, "L'icône"),
});

const createWorkspaceSchema = z.object({
  name: requiredTrimmedString("Le nom de l'espace de travail", { max: 255 }),
  location: optionalTrimmedString(255, "La localisation"),
});

const updateWorkspaceSchema = z.object({
  workspaceid: positiveIntId("L'identifiant de l'espace de travail"),
  name: requiredTrimmedString("Le nom de l'espace de travail", { max: 255 }),
  location: optionalTrimmedString(255, "La localisation"),
});

const switchWorkspaceSchema = z.object({
  workspaceId: positiveIntId("L'identifiant de l'espace de travail"),
});

// ---------------------------------------------------------------------------
// Machines & machine types
// ---------------------------------------------------------------------------

const createMachineTypeSchema = z.object({
  name: requiredTrimmedString("Le nom du type de machine", { max: 255 }),
});

const updateMachineTypeSchema = z.object({
  machinetypeid: positiveIntId("L'identifiant du type de machine"),
  name: requiredTrimmedString("Le nom du type de machine", { max: 255 }),
});

const machineCommonFields = {
  name: optionalTrimmedString(255, "Le nom de la machine"),
  machinetypeId: positiveIntId("Le type de machine"),
  categoryId: optionalPositiveIntId("La catégorie"),
  make: z.string({ error: "La marque est invalide." }).trim().max(255, "La marque ne peut pas dépasser 255 caractères.").optional().default("Generic"),
  model: z.string({ error: "Le modèle est invalide." }).trim().max(255, "Le modèle ne peut pas dépasser 255 caractères.").optional().default("Standard"),
  serialNumber: optionalTrimmedString(255, "Le numéro de série"),
  serialnum: optionalTrimmedString(255, "Le numéro de série"),
  internalReference: z.preprocess(
    preprocessOptionalInt,
    z
      .number({ error: "La référence interne doit être un entier." })
      .int("La référence interne doit être un entier.")
      .min(0, "La référence interne ne peut pas être négative.")
      .nullable()
      .optional(),
  ),
  locationId: optionalPositiveIntId("L'emplacement"),
  purchaseDate: optionalDateString("La date d'achat"),
  lastMaintenance: optionalDateString("La date de dernière maintenance"),
  warrantyExpiry: optionalDateString("La date de fin de garantie"),
  picture: optionalTrimmedString(255, "L'image"),
  documentation: optionalTrimmedString(255, "La documentation"),
  accessId: positiveIntId("Le niveau d'accès"),
};

const createMachineSchema = z.object(machineCommonFields);

const updateMachineSchema = z
  .object({
    machineid: optionalPositiveIntId("L'identifiant de machine"),
    id: optionalPositiveIntId("L'identifiant de machine"),
    ...machineCommonFields,
  })
  .refine((data) => Boolean(data.machineid || data.id), {
    message: "Identifiant de machine invalide.",
    path: ["machineid"],
  })
  .transform((data) => ({
    ...data,
    machineid: data.machineid || data.id,
    id: data.machineid || data.id,
  }));

// ---------------------------------------------------------------------------
// Workshops
// ---------------------------------------------------------------------------

const createWorkshopSchema = z.object({
  name: requiredTrimmedString("Le nom de l'atelier", { max: 255 }),
  description: optionalTrimmedString(5000, "La description"),
  accessId: optionalPositiveIntId("Le niveau d'accès"),
});

const updateWorkshopSchema = z.object({
  workshopid: positiveIntId("L'identifiant de l'atelier"),
  name: requiredTrimmedString("Le nom de l'atelier", { max: 255 }),
  description: optionalTrimmedString(5000, "La description"),
  accessId: optionalPositiveIntId("Le niveau d'accès"),
});

const awardWorkshopBadgeSchema = z.object({
  userId: positiveIntId("L'identifiant de l'usager"),
  workshopId: positiveIntId("L'identifiant de l'atelier"),
  removeInterest: z.preprocess(preprocessCheckbox, z.boolean().optional().default(false)),
});

const addWorkshopInterestSchema = z.object({
  userId: positiveIntId("L'identifiant de l'usager"),
  workshopId: positiveIntId("L'identifiant de l'atelier"),
});

// ---------------------------------------------------------------------------
// Teaching Units (UE)
// ---------------------------------------------------------------------------

const createUeSchema = z.object({
  code: requiredTrimmedString("Le code de l'UE", { max: 50 }),
  name: requiredTrimmedString("L'intitulé de l'UE", { max: 255 }),
  department: optionalTrimmedString(255, "Le département"),
  responsibleEmail: optionalEmail(255, "Veuillez saisir une adresse e-mail valide pour le responsable."),
});

const updateUeSchema = z.object({
  code: requiredTrimmedString("Le code de l'UE", { max: 50 }),
  name: requiredTrimmedString("L'intitulé de l'UE", { max: 255 }),
  department: optionalTrimmedString(255, "Le département"),
  responsibleEmail: optionalEmail(255, "Veuillez saisir une adresse e-mail valide pour le responsable."),
  active: z.preprocess(preprocessCheckbox, z.boolean().optional().default(false)),
});

const regularizeUeSchema = z
  .object({
    historyId: optionalPositiveIntId("L'identifiant de visite"),
    unregisteredName: optionalTrimmedString(255, "Le nom d'UE non enregistrée"),
    regularizeAction: z.enum(["existing", "new"], {
      error: "Action de régularisation non reconnue.",
    }),
    targetUeId: optionalPositiveIntId("L'UE existante"),
    newCode: optionalTrimmedString(50, "Le code de la nouvelle UE"),
    newName: optionalTrimmedString(255, "L'intitulé de la nouvelle UE"),
    newDepartment: optionalTrimmedString(255, "Le département"),
    newResponsibleEmail: optionalEmail(255, "Veuillez saisir une adresse e-mail valide pour le responsable."),
  })
  .refine(
    (data) =>
      data.regularizeAction === "existing"
        ? Boolean(data.targetUeId)
        : Boolean(data.newCode && data.newName),
    {
      message: "Veuillez renseigner les informations de l'UE cible ou de la nouvelle UE.",
      path: ["regularizeAction"],
    },
  );

const ueExportQuerySchema = z.object({
  ueId: z
    .string()
    .trim()
    .max(50)
    .refine(
      (val) => val === "" || val === "all" || val === "unregistered" || (/^\d+$/.test(val) && Number(val) > 0),
      "Identifiant d'UE invalide.",
    )
    .optional(),
  startDate: optionalDateString("La date de début"),
  endDate: optionalDateString("La date de fin"),
});

// ---------------------------------------------------------------------------
// Sorbonne billing
// ---------------------------------------------------------------------------

const sorbonneSettleEntitySchema = z.object({
  entity: requiredTrimmedString("L'entité Sorbonne", { max: 255 }),
});

const sorbonneFilterQuerySchema = z.object({
  entity: z.string().trim().max(255, "Le filtre entité est trop long.").optional(),
  status: z.enum(["", "all", "pending", "settled"], { error: "Filtre de statut invalide." }).optional(),
  startDate: optionalDateString("La date de début"),
  endDate: optionalDateString("La date de fin"),
});

// ---------------------------------------------------------------------------
// Repair Café, BookStack, Emails
// ---------------------------------------------------------------------------

const repairCafeSettingsSchema = z.object({
  plugin_repaircafe_enabled: z.union([z.string(), z.boolean()]).optional(),
  repaircafe_projecttype_name: optionalTrimmedString(255, "Le motif de visite Repair Café"),
});

const repairCafeEntrySchema = z.object({
  historyid: positiveIntId("L'identifiant de visite"),
  repairObject: optionalTrimmedString(255, "L'objet à réparer"),
  repairStatus: z
    .enum(["PENDING", "REPAIRED", "PARTIALLY_REPAIRED", "NOT_REPAIRED", "NEEDS_RETURN"], {
      error: "Statut de réparation invalide.",
    })
    .optional()
    .default("PENDING"),
  repairNotes: optionalTrimmedString(5000, "Les notes de réparation"),
});

const bookstackSettingsSchema = z.object({
  plugin_bookstack_enabled: z.union([z.string(), z.boolean()]).optional(),
  bookstack_url: z.string().trim().max(500, "L'URL BookStack est trop longue.").optional(),
  bookstack_token_id: z.string().trim().max(255, "Le Token ID BookStack est trop long.").optional(),
  bookstack_token_secret: z.string().trim().max(255, "Le Token Secret BookStack est trop long.").optional(),
  bookstack_auto_prefill: z.union([z.string(), z.boolean()]).optional(),
});

const bookstackTestSchema = z.object({});

const emailSettingsSchema = z.object({
  mail_admin_recipient: optionalTrimmedString(255, "L'adresse destinataire admin"),
  mail_from: optionalTrimmedString(255, "L'adresse expéditeur"),
  smtp_host: optionalTrimmedString(255, "L'hôte SMTP"),
  smtp_port: z.preprocess(
    preprocessOptionalInt,
    z
      .number({ error: "Le port SMTP doit être un entier valide." })
      .int("Le port SMTP doit être un entier.")
      .min(1, "Le port SMTP doit être compris entre 1 et 65535.")
      .max(65535, "Le port SMTP doit être compris entre 1 et 65535.")
      .nullable()
      .optional(),
  ),
  smtp_user: optionalTrimmedString(255, "L'utilisateur SMTP"),
  smtp_pass: z.string().max(500, "Le mot de passe SMTP est trop long.").optional(),
  smtp_secure: z.union([z.string(), z.boolean()]).optional(),
  mail_notif_consumable_low_stock: z.union([z.string(), z.boolean()]).optional(),
  mail_notif_user_warning: z.union([z.string(), z.boolean()]).optional(),
  mail_notif_staff_registration: z.union([z.string(), z.boolean()]).optional(),
  mail_notif_staff_approved: z.union([z.string(), z.boolean()]).optional(),
  mail_notif_user_agreement: z.union([z.string(), z.boolean()]).optional(),
  mail_notif_machine_issue: z.union([z.string(), z.boolean()]).optional(),
  mail_notif_bug_report: z.union([z.string(), z.boolean()]).optional(),
  mail_user_agreement_subject: optionalTrimmedString(255, "L'objet de l'e-mail de charte"),
  mail_user_agreement_title: optionalTrimmedString(255, "Le titre de l'e-mail de charte"),
  mail_user_agreement_body: optionalTrimmedString(10000, "Le corps de l'e-mail de charte"),
  mail_user_agreement_cta_text: optionalTrimmedString(255, "Le texte du bouton"),
  mail_user_agreement_notice: optionalTrimmedString(2000, "La mention de pied d'e-mail"),
  mail_user_agreement_success_title: optionalTrimmedString(255, "Le titre de confirmation"),
  mail_user_agreement_success_message: optionalTrimmedString(5000, "Le message de confirmation"),
  mail_user_agreement_redirect_url: optionalTrimmedString(500, "L'URL de redirection"),
  mail_user_agreement_redirect_delay: optionalTrimmedString(20, "Le délai de redirection"),
});

const emailTestSchema = z.object({
  test_recipient: z
    .string({ error: "Veuillez renseigner une adresse email de destination." })
    .trim()
    .min(1, "Veuillez renseigner une adresse email de destination.")
    .max(255, "L'adresse e-mail ne peut pas dépasser 255 caractères.")
    .email("Veuillez saisir une adresse e-mail valide."),
});

// ---------------------------------------------------------------------------
// Settings, AI test, Statistics, History Import, Communication
// ---------------------------------------------------------------------------

const adminSettingsSchema = z.object({
  platform_name: optionalTrimmedString(255, "Le nom de la plateforme"),
  platform_subtitle: optionalTrimmedString(255, "Le sous-titre"),
  session_timeout_hours: z.preprocess(
    preprocessOptionalInt,
    z
      .number({ error: "Le délai de session doit être un entier positif." })
      .int("Le délai de session doit être un entier.")
      .min(1, "Le délai de session doit être compris entre 1 et 720 heures.")
      .max(720, "Le délai de session doit être compris entre 1 et 720 heures.")
      .nullable()
      .optional(),
  ),
  api_machine_token: z.string().trim().max(500, "Le jeton API machine est trop long.").optional(),
  currency_symbol: optionalTrimmedString(20, "Le symbole monétaire"),
  admin_email: optionalTrimmedString(255, "L'adresse e-mail administrateur"),
  allow_self_registration: z.string().trim().max(20).optional(),
  default_language: z.string().trim().max(20).optional(),
  date_format: z.string().trim().max(50).optional(),
  platform_logo_type: z.enum(["default", "custom"], { error: "Type de logo invalide." }).optional(),
  plugin_settings_submitted: z.string().trim().max(20).optional(),
  plugin_ue_enabled: z.union([z.string(), z.boolean()]).optional(),
  plugin_rfid_enabled: z.union([z.string(), z.boolean()]).optional(),
  plugin_bookstack_enabled: z.union([z.string(), z.boolean()]).optional(),
  plugin_repaircafe_enabled: z.union([z.string(), z.boolean()]).optional(),
  plugin_workshop_enabled: z.union([z.string(), z.boolean()]).optional(),
  plugin_sorbonne_enabled: z.union([z.string(), z.boolean()]).optional(),
  repaircafe_projecttype_name: optionalTrimmedString(255, "Le motif Repair Café"),
  workshop_projecttype_name: optionalTrimmedString(255, "Le motif Atelier"),
  ue_projecttype_name: optionalTrimmedString(255, "Le motif UE"),
  sorbonne_projecttype_name: optionalTrimmedString(255, "Le motif Sorbonne"),
  ai_provider: z
    .enum(["none", "disabled", "openai", "gemini", "anthropic", "local"], { error: "Fournisseur IA invalide." })
    .optional(),
  ai_openai_api_key: z.string().trim().max(500).optional(),
  ai_openai_model: optionalTrimmedString(100, "Le modèle OpenAI"),
  ai_gemini_api_key: z.string().trim().max(500).optional(),
  ai_gemini_model: optionalTrimmedString(100, "Le modèle Gemini"),
  ai_anthropic_api_key: z.string().trim().max(500).optional(),
  ai_anthropic_model: optionalTrimmedString(100, "Le modèle Anthropic"),
  ai_local_url: optionalTrimmedString(500, "L'URL LLM locale"),
  ai_local_model: optionalTrimmedString(100, "Le modèle local"),
  ai_local_api_key: z.string().trim().max(500).optional(),
});

const aiTestConnectionSchema = z.object({
  ai_provider: z.enum(["none", "disabled", "openai", "gemini", "anthropic", "local"], {
    error: "Fournisseur IA invalide.",
  }),
  ai_openai_api_key: z.string().trim().max(500).optional(),
  ai_openai_model: optionalTrimmedString(100, "Le modèle OpenAI"),
  ai_gemini_api_key: z.string().trim().max(500).optional(),
  ai_gemini_model: optionalTrimmedString(100, "Le modèle Gemini"),
  ai_anthropic_api_key: z.string().trim().max(500).optional(),
  ai_anthropic_model: optionalTrimmedString(100, "Le modèle Anthropic"),
  ai_local_url: optionalTrimmedString(500, "L'URL LLM locale"),
  ai_local_model: optionalTrimmedString(100, "Le modèle local"),
  ai_local_api_key: z.string().trim().max(500).optional(),
});

const aiQuerySchema = z.object({
  question: z
    .string({ error: "Veuillez saisir une question." })
    .trim()
    .min(2, "La question doit comporter au moins 2 caractères.")
    .max(1000, "La question ne peut pas dépasser 1000 caractères."),
});

const statisticsQuerySchema = z.object({
  workspaceId: z
    .string()
    .trim()
    .max(30)
    .refine(
      (val) => val === "" || val === "all" || (/^\d+$/.test(val) && Number(val) > 0),
      "Identifiant d'espace de travail invalide.",
    )
    .optional(),
  period: z
    .enum(
      [
        "",
        "7d",
        "30d",
        "90d",
        "this_month",
        "last_month",
        "this_year",
        "academic_year",
        "1y",
        "year",
        "all",
        "custom",
      ],
      { error: "Période statistique invalide." },
    )
    .optional(),
  startDate: optionalDateString("La date de début"),
  endDate: optionalDateString("La date de fin"),
});

const statisticsExportQuerySchema = z.object({
  workspaceId: z
    .string()
    .trim()
    .max(30)
    .refine(
      (val) => val === "" || val === "all" || (/^\d+$/.test(val) && Number(val) > 0),
      "Identifiant d'espace de travail invalide.",
    )
    .optional(),
  startDate: optionalDateString("La date de début"),
  endDate: optionalDateString("La date de fin"),
});

const historyImportPreviewSchema = z.object({
  default_date: optionalDateString("La date par défaut"),
  default_arrival: optionalTrimmedString(20, "L'heure d'arrivée par défaut"),
  default_departure: optionalTrimmedString(20, "L'heure de départ par défaut"),
  default_project_type: optionalTrimmedString(255, "Le motif de visite par défaut"),
  default_workspace_id: optionalPositiveIntId("L'espace de travail par défaut"),
  default_usertype_id: optionalPositiveIntId("Le type d'usager par défaut"),
});

const historyImportExecuteSchema = z.object({
  items: z
    .array(z.record(z.string(), z.unknown()), {
      error: "Aucune donnée à importer.",
    })
    .min(1, "Aucune donnée à importer.")
    .max(50000, "Le lot d'import dépasse la limite maximale autorisée (50 000 lignes)."),
  options: z.record(z.string(), z.unknown()).optional().default({}),
});

const communicationQuerySchema = z.object({
  workshopId: optionalPositiveIntId("L'identifiant de l'atelier"),
  target: z.string().trim().max(100, "Cible de communication invalide.").optional(),
});

const viewHistoryQuerySchema = z.object({
  page: optionalPageNumber,
  limit: z.preprocess(
    (val) => {
      const parsed = preprocessOptionalInt(val);
      return parsed === null || parsed === undefined ? 50 : parsed;
    },
    z
      .number({ error: "La taille de page est invalide." })
      .int("La taille de page doit être un entier.")
      .min(10, "La taille de page doit être comprise entre 10 et 200.")
      .max(200, "La taille de page doit être comprise entre 10 et 200.")
      .default(50),
  ),
  workspaceId: z
    .string()
    .trim()
    .max(30)
    .refine(
      (val) => val === "" || val === "all" || (/^\d+$/.test(val) && Number(val) > 0),
      "Identifiant d'espace de travail invalide.",
    )
    .optional(),
  startDate: optionalDateString("La date de début"),
  endDate: optionalDateString("La date de fin"),
  search: z.string().trim().max(200, "La recherche est trop longue.").optional(),
});

module.exports = {
  createAccessLevelSchema,
  updateAccessLevelSchema,
  createCategorySchema,
  updateCategorySchema,
  createLocationSchema,
  updateLocationSchema,
  createProjecttypeSchema,
  updateProjecttypeSchema,
  createUsertypeSchema,
  updateUsertypeSchema,
  createWarningtypeSchema,
  updateWarningtypeSchema,
  createWorkspaceSchema,
  updateWorkspaceSchema,
  switchWorkspaceSchema,
  createMachineTypeSchema,
  updateMachineTypeSchema,
  createMachineSchema,
  updateMachineSchema,
  createWorkshopSchema,
  updateWorkshopSchema,
  awardWorkshopBadgeSchema,
  addWorkshopInterestSchema,
  createUeSchema,
  updateUeSchema,
  regularizeUeSchema,
  ueExportQuerySchema,
  sorbonneSettleEntitySchema,
  sorbonneFilterQuerySchema,
  repairCafeSettingsSchema,
  repairCafeEntrySchema,
  bookstackSettingsSchema,
  bookstackTestSchema,
  emailSettingsSchema,
  emailTestSchema,
  adminSettingsSchema,
  aiTestConnectionSchema,
  aiQuerySchema,
  statisticsQuerySchema,
  statisticsExportQuerySchema,
  historyImportPreviewSchema,
  historyImportExecuteSchema,
  communicationQuerySchema,
  viewHistoryQuerySchema,
};
