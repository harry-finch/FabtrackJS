const { prisma } = require("../utilities/db.js");
const settingsService = require("./settingsService.js");
const referenceCacheService = require("./referenceCacheService.js");
const logger = require("../utilities/simpleLogger.js");

class WorkshopService {
  /**
   * Ensures that the 'Atelier' project type exists in the database.
   */
  async ensureProjectType() {
    try {
      const typeName = (await settingsService.getSetting("workshop_projecttype_name")) || "Atelier";
      let projectType = await prisma.projecttype.findFirst({
        where: {
          name: {
            equals: typeName,
          },
        },
      });

      if (!projectType) {
        projectType = await prisma.projecttype.create({
          data: { name: typeName },
        });
        referenceCacheService.invalidate();
        logger.logThat(`Created default project type '${typeName}' for Workshop plugin`);
      }

      return projectType;
    } catch (err) {
      console.error("[WorkshopService] Error ensuring project type:", err);
      return null;
    }
  }

  /**
   * Returns all active workshops with their associated machine access level.
   */
  async getActiveWorkshops() {
    try {
      return await prisma.workshop.findMany({
        where: { active: true },
        include: { access: true },
        orderBy: { name: "asc" },
      });
    } catch (err) {
      console.error("[WorkshopService] Error fetching active workshops:", err);
      return [];
    }
  }

  /**
   * Records a user's interest in a workshop (idempotent upsert).
   * @param {Object} params
   * @param {number|string} params.userId
   * @param {number|string} params.workshopId
   */
  async addWorkshopInterest({ userId, workshopId }) {
    const uId = Number(userId);
    const wId = Number(workshopId);
    if (!uId || isNaN(uId) || !wId || isNaN(wId)) {
      throw new Error("ID utilisateur ou atelier invalide");
    }

    return prisma.userWorkshopInterest.upsert({
      where: {
        userId_workshopId: {
          userId: uId,
          workshopId: wId,
        },
      },
      create: {
        userId: uId,
        workshopId: wId,
      },
      update: {},
    });
  }

  /**
   * Removes a user's pending interest in a workshop.
   * @param {Object} params
   * @param {number|string} params.userId
   * @param {number|string} params.workshopId
   */
  async removeWorkshopInterest({ userId, workshopId }) {
    const uId = Number(userId);
    const wId = Number(workshopId);
    if (!uId || isNaN(uId) || !wId || isNaN(wId)) {
      throw new Error("ID utilisateur ou atelier invalide");
    }

    return prisma.userWorkshopInterest.deleteMany({
      where: {
        userId: uId,
        workshopId: wId,
      },
    });
  }

  /**
   * Revokes a user's workshop completion badge / habilitation.
   * @param {Object} params
   * @param {number|string} params.userId
   * @param {number|string} params.workshopId
   */
  async revokeWorkshopBadge({ userId, workshopId }) {
    const uId = Number(userId);
    const wId = Number(workshopId);
    if (!uId || isNaN(uId) || !wId || isNaN(wId)) {
      throw new Error("ID utilisateur ou atelier invalide");
    }

    return prisma.userWorkshopCompletion.deleteMany({
      where: {
        userId: uId,
        workshopId: wId,
      },
    });
  }

  /**
   * Awards workshop completion & badge to the user inside a transaction when available.
   * Clears any pending workshop interest by default (`removeInterest: true`).
   *
   * @param {number|string} userId
   * @param {number|string} workshopId
   * @param {string} [awardedBy="Atelier Fabtrack"]
   * @param {Object} [options]
   * @param {boolean} [options.removeInterest=true]
   * @param {Date|null} [options.awardedAt=null]
   * @param {boolean} [options.requireWorkshop=true]
   * @param {boolean} [options.logAutomatic=true]
   */
  async awardWorkshopBadge(userId, workshopId, awardedBy = "Atelier Fabtrack", options = {}) {
    const uId = Number(userId);
    const wId = Number(workshopId);
    if (!uId || isNaN(uId) || !wId || isNaN(wId)) {
      throw new Error("ID utilisateur ou atelier invalide");
    }

    const {
      removeInterest = true,
      awardedAt = null,
      requireWorkshop = true,
      logAutomatic = true,
    } = options;

    const completionDate =
      awardedAt instanceof Date && !Number.isNaN(awardedAt.getTime()) ? awardedAt : new Date();

    const runAward = async (tx) => {
      let foundWorkshop = null;
      if (requireWorkshop) {
        foundWorkshop = await tx.workshop.findUnique({
          where: { id: wId },
          include: { access: true },
        });

        if (!foundWorkshop) {
          throw new Error("Atelier introuvable");
        }
      }

      const upsertedCompletion = await tx.userWorkshopCompletion.upsert({
        where: {
          userId_workshopId: {
            userId: uId,
            workshopId: wId,
          },
        },
        create: {
          userId: uId,
          workshopId: wId,
          ...(awardedAt ? { awardedAt: completionDate } : {}),
          awardedBy,
        },
        update: {
          awardedAt: completionDate,
          awardedBy,
        },
        include: {
          user: true,
          workshop: {
            include: { access: true },
          },
        },
      });

      if (removeInterest) {
        await tx.userWorkshopInterest.deleteMany({
          where: {
            userId: uId,
            workshopId: wId,
          },
        });
      }

      return {
        completion: upsertedCompletion,
        workshop: foundWorkshop || (upsertedCompletion && upsertedCompletion.workshop) || null,
      };
    };

    const { completion, workshop } =
      typeof prisma.$transaction === "function"
        ? await prisma.$transaction(runAward)
        : await runAward(prisma);

    if (logAutomatic && workshop) {
      const userName = completion && completion.user
        ? `${completion.user.name} ${completion.user.surname}`
        : `Contributeur #${uId}`;
      const accessText = workshop.access ? ` (Habilitation débloquée : ${workshop.access.name})` : "";
      logger.logThat(`Badge d'atelier "${workshop.name}" automatiquement attribué à ${userName}${accessText}`);
    }

    return { completion, workshop };
  }
}

module.exports = new WorkshopService();
