const crypto = require("crypto");
const { prisma: defaultPrisma } = require("../utilities/db.js");
const defaultLogger = require("../utilities/simpleLogger.js");

const ELIGIBLE_STAFF_ROLES = new Set(["admin", "user"]);

function isEligibleForContributorLink(staff) {
  return Boolean(staff && staff.approved === true && ELIGIBLE_STAFF_ROLES.has(staff.role));
}

function cleanOptionalName(val) {
  if (typeof val !== "string") return "";
  return val.trim().slice(0, 255);
}

/**
 * Ensures an approved staff member (role admin or user) is linked to exactly one active contributor (User).
 *
 * Business rules (R-037):
 * - Pending accounts (approved !== true) and technical borne accounts (role === "staff") are skipped.
 * - Idempotent: repeated approvals or calls always resolve to the exact same contributor record.
 * - If an active User with the same email already exists: links Staff.userId to it, preserves its ID,
 *   badge (rfid), history, projects, and marks termsAccepted = true without sending an agreement email.
 * - If a soft-deleted (archived) User with the same email exists: NEVER auto-reactivates; returns
 *   status "archived_match" so an admin can review it explicitly.
 * - If no User exists for this email: requires self-provided firstName, lastName and usertypeId
 *   (NEVER falls back to login username). Creates User with termsAccepted = true (no agreement email).
 *
 * @param {Object} params
 * @param {Object} [params.prisma]
 * @param {number|string} [params.staffId]
 * @param {Object} [params.staffRecord]
 * @param {string|null} [params.actorUsername]
 * @param {Object} [params.logger]
 */
async function ensureStaffContributorLink({
  prisma = defaultPrisma,
  staffId = null,
  staffRecord = null,
  actorUsername = null,
  logger = defaultLogger,
} = {}) {
  const staff =
    staffRecord ||
    (staffId && prisma.staff && typeof prisma.staff.findUnique === "function"
      ? await prisma.staff.findUnique({ where: { id: Number(staffId) } })
      : null);

  if (!staff) {
    return { status: "not_found", linked: false };
  }

  if (!ELIGIBLE_STAFF_ROLES.has(staff.role)) {
    return { status: "skipped_role", linked: false };
  }

  if (!staff.approved) {
    return { status: "skipped_unapproved", linked: false };
  }

  // Defensive guard for unit tests that mock only prisma.staff without prisma.user
  if (!prisma || !prisma.user || typeof prisma.user.findUnique !== "function") {
    return { status: "skipped_unavailable", linked: false };
  }

  // 1. Already linked -> verify active & ensure charter accepted (idempotent)
  if (staff.userId) {
    const linkedUser = await prisma.user.findUnique({ where: { id: Number(staff.userId) } });
    if (linkedUser) {
      if (linkedUser.deletedAt) {
        return {
          status: "archived_match",
          linked: false,
          archivedUser: linkedUser,
          message:
            "La fiche contributeur associée est archivée. Un examen administrateur est requis avant toute réactivation.",
        };
      }
      if (!linkedUser.termsAccepted && typeof prisma.user.update === "function") {
        await prisma.user.update({
          where: { id: linkedUser.id },
          data: { termsAccepted: true },
        });
        linkedUser.termsAccepted = true;
      }
      return { status: "already_linked", linked: true, user: linkedUser };
    }
  }

  const cleanEmail = typeof staff.email === "string" ? staff.email.trim() : "";
  if (!cleanEmail) {
    return {
      status: "missing_info",
      linked: false,
      missingFields: ["email"],
      message: "Adresse e-mail manquante sur le compte staff.",
    };
  }

  // 2. Look up existing contributor with the same email (active or archived)
  const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
  if (existingUser) {
    if (existingUser.deletedAt) {
      if (logger && typeof logger.logThat === "function") {
        logger.logThat(
          `[STAFF-LINK] Correspondance archivée détectée pour ${staff.name} (${cleanEmail}, fiche #${existingUser.id}) — réactivation non automatique.`,
        );
      }
      return {
        status: "archived_match",
        linked: false,
        archivedUser: existingUser,
        message:
          "Une fiche contributeur archivée correspond déjà à cette adresse e-mail. Un examen administrateur est requis avant toute réactivation.",
      };
    }

    // Active contributor found: preserve ID, badge, visits, projects; accept charter without email
    const runLinkExisting = async (tx) => {
      let targetUser = existingUser;
      if (!existingUser.termsAccepted) {
        targetUser = await tx.user.update({
          where: { id: existingUser.id },
          data: { termsAccepted: true },
        });
      }
      await tx.staff.update({
        where: { id: staff.id },
        data: {
          userId: existingUser.id,
          firstName: staff.firstName || existingUser.name,
          lastName: staff.lastName || existingUser.surname,
          usertypeId: staff.usertypeId || existingUser.usertypeId,
        },
      });
      return targetUser;
    };

    const linkedUser =
      typeof prisma.$transaction === "function"
        ? await prisma.$transaction(runLinkExisting)
        : await runLinkExisting(prisma);

    if (logger && typeof logger.logThat === "function") {
      logger.logThat(
        `[STAFF-LINK] Compte ${staff.name} (${staff.role}) rattaché à la fiche contributeur existante #${existingUser.id} (${existingUser.name} ${existingUser.surname}) par ${actorUsername || "système"}.`,
      );
    }

    return {
      status: "linked_existing",
      linked: true,
      user: linkedUser,
      message: `Fiche contributeur existante (${existingUser.name} ${existingUser.surname}) associée et charte validée.`,
    };
  }

  // 3. No existing contributor -> require self-provided civil info + usertypeId (NEVER use login username!)
  const firstName = cleanOptionalName(staff.firstName);
  const lastName = cleanOptionalName(staff.lastName);
  const usertypeId =
    staff.usertypeId && Number.isInteger(Number(staff.usertypeId)) && Number(staff.usertypeId) > 0
      ? Number(staff.usertypeId)
      : null;

  const missingFields = [];
  if (!firstName) missingFields.push("firstName");
  if (!lastName) missingFields.push("lastName");
  if (!usertypeId) missingFields.push("usertypeId");

  if (missingFields.length > 0) {
    return {
      status: "missing_info",
      linked: false,
      missingFields,
      message:
        "Informations personnelles manquantes (prénom, nom ou type de contributeur) : le membre les complétera lors de sa prochaine connexion.",
    };
  }

  const runCreateAndLink = async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        name: firstName,
        surname: lastName,
        email: cleanEmail,
        usertypeId,
        termsAccepted: true,
        newsletter: false,
        token: crypto.randomUUID(),
      },
    });

    await tx.staff.update({
      where: { id: staff.id },
      data: { userId: createdUser.id },
    });

    return createdUser;
  };

  const createdUser =
    typeof prisma.$transaction === "function"
      ? await prisma.$transaction(runCreateAndLink)
      : await runCreateAndLink(prisma);

  if (logger && typeof logger.logThat === "function") {
    logger.logThat(
      `[STAFF-LINK] Fiche contributeur #${createdUser.id} (${createdUser.name} ${createdUser.surname}) créée et associée au compte ${staff.name} (${staff.role}) par ${actorUsername || "système"}.`,
    );
  }

  return {
    status: "created",
    linked: true,
    user: createdUser,
    message: `Fiche contributeur (${createdUser.name} ${createdUser.surname}) créée et associée (charte validée).`,
  };
}

/**
 * Allows an already-approved admin/user staff member to fill in their own civil info
 * and immediately create/link their contributor profile.
 */
async function completeSelfProfileAndLink({
  prisma = defaultPrisma,
  staffId,
  firstName,
  lastName,
  usertypeId,
  logger = defaultLogger,
} = {}) {
  const id = Number(staffId);
  if (!Number.isInteger(id) || id <= 0) {
    return { status: "not_found", linked: false, message: "Compte staff introuvable." };
  }

  const staff = await prisma.staff.findUnique({ where: { id } });
  if (!staff) {
    return { status: "not_found", linked: false, message: "Compte staff introuvable." };
  }

  if (!isEligibleForContributorLink(staff)) {
    return { status: "skipped_role", linked: false, message: "Ce compte ne requiert pas de fiche contributeur." };
  }

  const cleanFirst = cleanOptionalName(firstName);
  const cleanLast = cleanOptionalName(lastName);
  const parsedTypeId = Number(usertypeId);

  if (!cleanFirst || !cleanLast || !Number.isInteger(parsedTypeId) || parsedTypeId <= 0) {
    return {
      status: "missing_info",
      linked: false,
      message: "Veuillez renseigner votre prénom, votre nom et votre type de contributeur.",
    };
  }

  const updatedStaff = await prisma.staff.update({
    where: { id: staff.id },
    data: {
      firstName: cleanFirst,
      lastName: cleanLast,
      usertypeId: parsedTypeId,
    },
  });

  return ensureStaffContributorLink({
    prisma,
    staffRecord: updatedStaff,
    actorUsername: updatedStaff.name,
    logger,
  });
}

module.exports = {
  ELIGIBLE_STAFF_ROLES,
  isEligibleForContributorLink,
  ensureStaffContributorLink,
  completeSelfProfileAndLink,
};
