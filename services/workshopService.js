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
   * Automatically awards workshop completion & badge to the user.
   * Also clears any pending workshop interest.
   */
  async awardWorkshopBadge(userId, workshopId, awardedBy = "Atelier Fabtrack") {
    const uId = Number(userId);
    const wId = Number(workshopId);
    if (!uId || isNaN(uId) || !wId || isNaN(wId)) {
      throw new Error("ID utilisateur ou atelier invalide");
    }

    const { completion, workshop } = await prisma.$transaction(async (tx) => {
      const foundWorkshop = await tx.workshop.findUnique({
        where: { id: wId },
        include: { access: true },
      });

      if (!foundWorkshop) {
        throw new Error("Atelier introuvable");
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
          awardedBy,
        },
        update: {
          awardedAt: new Date(),
          awardedBy,
        },
        include: {
          user: true,
          workshop: {
            include: { access: true },
          },
        },
      });

      await tx.userWorkshopInterest.deleteMany({
        where: {
          userId: uId,
          workshopId: wId,
        },
      });

      return { completion: upsertedCompletion, workshop: foundWorkshop };
    });

    const userName = completion.user ? `${completion.user.name} ${completion.user.surname}` : `Contributeur #${uId}`;
    const accessText = workshop.access ? ` (Habilitation débloquée : ${workshop.access.name})` : "";
    logger.logThat(`Badge d'atelier "${workshop.name}" automatiquement attribué à ${userName}${accessText}`);

    return { completion, workshop };
  }
}

module.exports = new WorkshopService();
