const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const logger = require("../utilities/simpleLogger.js");
const dateService = require("./dateService.js");

/**
 * Service managing machine access verifications and machine usage sessions (tracking & 3D printing)
 */
class MachineUsageService {
  /**
   * Verify if a scanned card / RFID corresponds to a registered Fablab user
   * who is currently checked-in (present) in the lab.
   *
   * @param {Object} params
   * @param {string} params.rfid - Card UID / RFID tag
   * @param {number} [params.machineId] - Optional machine ID to check access
   * @returns {Promise<Object>}
   */
  async verifyUserPresenceByCard({ rfid, machineId }) {
    if (!rfid || typeof rfid !== "string" || !rfid.trim()) {
      return {
        success: false,
        code: "INVALID_RFID",
        canUnlock: false,
        isPresent: false,
        message: "Code RFID / UID de la carte invalide ou absent.",
      };
    }

    const cleanRfid = rfid.trim();

    // 1. Find user by RFID
    const user = await prisma.user.findFirst({
      where: {
        rfid: cleanRfid,
        deletedAt: null,
      },
      include: {
        usertype: true,
      },
    });

    if (!user) {
      return {
        success: false,
        code: "USER_NOT_FOUND",
        canUnlock: false,
        isPresent: false,
        rfid: cleanRfid,
        message: "Badge non reconnu dans Fabtrack. Veuillez associer votre badge auprès d'un médiateur.",
      };
    }

    // 2. Check terms acceptance
    if (!user.termsAccepted) {
      return {
        success: false,
        code: "TERMS_NOT_ACCEPTED",
        canUnlock: false,
        isPresent: false,
        user: {
          id: user.id,
          name: user.name,
          surname: user.surname,
          email: user.email,
          usertype: user.usertype ? user.usertype.name : null,
        },
        message: `Accès refusé : ${user.name} ${user.surname} n'a pas encore signé la charte d'utilisation du lab.`,
      };
    }

    // 3. Check active check-in presence in the lab (History departure is null)
    const activeVisit = await prisma.history.findFirst({
      where: {
        userId: user.id,
        departure: null,
      },
      orderBy: {
        arrival: "desc",
      },
      include: {
        workspace: true,
      },
    });

    if (!activeVisit) {
      return {
        success: false,
        code: "NOT_CHECKED_IN",
        canUnlock: false,
        isPresent: false,
        user: {
          id: user.id,
          name: user.name,
          surname: user.surname,
          email: user.email,
          usertype: user.usertype ? user.usertype.name : null,
        },
        message: `Usager ${user.name} ${user.surname} reconnu, mais non enregistré comme présent dans le lab. Veuillez badger à la borne tactile d'accueil avant d'utiliser une machine.`,
      };
    }

    // 4. Check machine access level if machineId is supplied
    let machineInfo = null;
    let hasAccess = true;
    let accessMessage = null;

    if (machineId) {
      const machine = await prisma.machine.findUnique({
        where: { id: Number(machineId) },
        include: { access: true, machinetype: true },
      });

      if (machine) {
        machineInfo = {
          id: machine.id,
          name: machine.name,
          make: machine.make,
          model: machine.model,
          type: machine.machinetype ? machine.machinetype.name : null,
          accessRequired: machine.access ? machine.access.name : "Accès libre",
        };
      }
    }

    return {
      success: true,
      code: "OK",
      canUnlock: true,
      isPresent: true,
      user: {
        id: user.id,
        name: user.name,
        surname: user.surname,
        email: user.email,
        usertype: user.usertype ? user.usertype.name : null,
        isExpert: user.isExpert,
      },
      visit: {
        id: activeVisit.id,
        arrival: activeVisit.arrival,
        workspaceId: activeVisit.workspaceId,
        workspaceName: activeVisit.workspace ? activeVisit.workspace.name : null,
      },
      machine: machineInfo,
      message: `Accès autorisé. Bienvenue ${user.name} !`,
    };
  }

  /**
   * Helper to resolve a user by rfid or userId
   */
  async _resolveUser({ rfid, userId }) {
    if (userId) {
      return prisma.user.findUnique({
        where: { id: Number(userId) },
        include: { usertype: true },
      });
    }
    if (rfid) {
      return prisma.user.findFirst({
        where: { rfid: rfid.trim(), deletedAt: null },
        include: { usertype: true },
      });
    }
    return null;
  }

  /**
   * Start a machine usage session (Heure de début)
   */
  async startMachineUsage({
    rfid,
    userId,
    machineId,
    startedAt,
    historyId,
    gcodeName,
    filamentQuantity,
    filamentType,
    printDuration,
    comments,
  }) {
    const user = await this._resolveUser({ rfid, userId });
    if (!user) {
      return {
        success: false,
        code: "USER_NOT_FOUND",
        message: "Utilisateur introuvable avec les identifiants fournis.",
      };
    }

    const machine = await prisma.machine.findUnique({
      where: { id: Number(machineId) },
      include: { machinetype: true },
    });
    if (!machine) {
      return {
        success: false,
        code: "MACHINE_NOT_FOUND",
        message: `Machine #${machineId} introuvable.`,
      };
    }

    // Resolve active visit if historyId is not specified
    let targetHistoryId = historyId ? Number(historyId) : null;
    if (!targetHistoryId) {
      const activeVisit = await prisma.history.findFirst({
        where: { userId: user.id, departure: null },
        orderBy: { arrival: "desc" },
      });
      if (activeVisit) {
        targetHistoryId = activeVisit.id;
      }
    }

    const startDateTime = startedAt ? new Date(startedAt) : new Date();

    const activity = await prisma.activity.create({
      data: {
        userId: user.id,
        resourceId: machine.id,
        resourceType: "MACHINE",
        historyId: targetHistoryId,
        startedAt: startDateTime,
        endedAt: null, // Session currently in progress
        gcodeName: gcodeName ? String(gcodeName).trim() : null,
        filamentQuantity: filamentQuantity != null ? Number(filamentQuantity) : null,
        filamentType: filamentType ? String(filamentType).trim() : null,
        printDuration: printDuration != null ? parseInt(printDuration, 10) : null,
        comments: comments ? String(comments).trim() : null,
      },
    });

    logger.logThat(
      `Session machine démarrée : ${machine.name} (#${machine.id}) par ${user.name} ${user.surname} (#${user.id})`
    );

    return {
      success: true,
      activityId: activity.id,
      message: "Session machine démarrée avec succès.",
      usage: {
        id: activity.id,
        machineId: machine.id,
        machineName: machine.name,
        userId: user.id,
        userName: `${user.name} ${user.surname}`,
        startedAt: activity.startedAt,
        status: "IN_PROGRESS",
      },
    };
  }

  /**
   * End a machine usage session (Heure de fin + télémétrie 3D optionnelle)
   */
  async endMachineUsage({
    activityId,
    machineId,
    rfid,
    userId,
    endedAt,
    gcodeName,
    filamentQuantity,
    filamentType,
    printDuration,
    comments,
  }) {
    let activity = null;

    if (activityId) {
      activity = await prisma.activity.findUnique({
        where: { id: Number(activityId) },
        include: { user: true },
      });
    } else if (machineId) {
      // Find latest ongoing session for this machine
      const where = {
        resourceId: Number(machineId),
        resourceType: "MACHINE",
        endedAt: null,
      };

      if (userId) {
        where.userId = Number(userId);
      } else if (rfid) {
        const u = await prisma.user.findFirst({ where: { rfid: rfid.trim(), deletedAt: null } });
        if (u) where.userId = u.id;
      }

      activity = await prisma.activity.findFirst({
        where,
        orderBy: { startedAt: "desc" },
        include: { user: true },
      });
    }

    if (!activity) {
      return {
        success: false,
        code: "SESSION_NOT_FOUND",
        message: "Aucune session d'utilisation en cours trouvée pour cette machine.",
      };
    }

    const endDateTime = endedAt ? new Date(endedAt) : new Date();

    const updateData = {
      endedAt: endDateTime,
    };

    if (gcodeName !== undefined && gcodeName !== null) {
      updateData.gcodeName = String(gcodeName).trim();
    }
    if (filamentQuantity !== undefined && filamentQuantity !== null) {
      updateData.filamentQuantity = Number(filamentQuantity);
    }
    if (filamentType !== undefined && filamentType !== null) {
      updateData.filamentType = String(filamentType).trim();
    }
    if (printDuration !== undefined && printDuration !== null) {
      updateData.printDuration = parseInt(printDuration, 10);
    }
    if (comments !== undefined && comments !== null) {
      updateData.comments = String(comments).trim();
    }

    const updated = await prisma.activity.update({
      where: { id: activity.id },
      data: updateData,
      include: { user: true },
    });

    const start = updated.startedAt || updated.createdAt;
    const durationMinutes = Math.max(1, Math.round((endDateTime.getTime() - new Date(start).getTime()) / 60000));
    const durationFormatted = dateService.formatDuration(start, endDateTime);

    const machine = await prisma.machine.findUnique({ where: { id: updated.resourceId } });

    logger.logThat(
      `Session machine clôturée : ${machine ? machine.name : `#${updated.resourceId}`} par ${
        updated.user ? updated.user.name + " " + updated.user.surname : "usager #" + updated.userId
      } (durée: ${durationFormatted})`
    );

    return {
      success: true,
      message: "Session machine clôturée avec succès.",
      usage: {
        id: updated.id,
        machineId: updated.resourceId,
        machineName: machine ? machine.name : null,
        userId: updated.userId,
        userName: updated.user ? `${updated.user.name} ${updated.user.surname}` : null,
        startedAt: updated.startedAt,
        endedAt: updated.endedAt,
        durationMinutes,
        durationFormatted,
        gcodeName: updated.gcodeName,
        filamentQuantity: updated.filamentQuantity ? Number(updated.filamentQuantity) : null,
        filamentType: updated.filamentType,
        printDuration: updated.printDuration,
        printDurationFormatted: updated.printDuration ? dateService.formatDurationSeconds(updated.printDuration) : null,
        comments: updated.comments,
        status: "COMPLETED",
      },
    };
  }

  /**
   * Record a complete machine usage in a single call (with start, end and 3D print info)
   */
  async recordMachineUsage({
    rfid,
    userId,
    machineId,
    historyId,
    startedAt,
    endedAt,
    gcodeName,
    filamentQuantity,
    filamentType,
    printDuration,
    comments,
  }) {
    const user = await this._resolveUser({ rfid, userId });
    if (!user) {
      return {
        success: false,
        code: "USER_NOT_FOUND",
        message: "Utilisateur introuvable avec les identifiants fournis.",
      };
    }

    const machine = await prisma.machine.findUnique({
      where: { id: Number(machineId) },
    });
    if (!machine) {
      return {
        success: false,
        code: "MACHINE_NOT_FOUND",
        message: `Machine #${machineId} introuvable.`,
      };
    }

    let targetHistoryId = historyId ? Number(historyId) : null;
    if (!targetHistoryId) {
      const activeVisit = await prisma.history.findFirst({
        where: { userId: user.id, departure: null },
        orderBy: { arrival: "desc" },
      });
      if (activeVisit) targetHistoryId = activeVisit.id;
    }

    const startDate = startedAt ? new Date(startedAt) : new Date();
    const endDate = endedAt ? new Date(endedAt) : null;

    const activity = await prisma.activity.create({
      data: {
        userId: user.id,
        resourceId: machine.id,
        resourceType: "MACHINE",
        historyId: targetHistoryId,
        startedAt: startDate,
        endedAt: endDate,
        gcodeName: gcodeName ? String(gcodeName).trim() : null,
        filamentQuantity: filamentQuantity != null ? Number(filamentQuantity) : null,
        filamentType: filamentType ? String(filamentType).trim() : null,
        printDuration: printDuration != null ? parseInt(printDuration, 10) : null,
        comments: comments ? String(comments).trim() : null,
      },
      include: { user: true },
    });

    const durationMinutes = endDate
      ? Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 60000))
      : null;
    const durationFormatted = endDate ? dateService.formatDuration(startDate, endDate) : null;

    logger.logThat(
      `Utilisation machine enregistrée : ${machine.name} (#${machine.id}) pour ${user.name} ${user.surname}`
    );

    return {
      success: true,
      activityId: activity.id,
      message: "Utilisation machine enregistrée avec succès.",
      usage: {
        id: activity.id,
        machineId: machine.id,
        machineName: machine.name,
        userId: user.id,
        userName: `${user.name} ${user.surname}`,
        startedAt: activity.startedAt,
        endedAt: activity.endedAt,
        durationMinutes,
        durationFormatted,
        gcodeName: activity.gcodeName,
        filamentQuantity: activity.filamentQuantity ? Number(activity.filamentQuantity) : null,
        filamentType: activity.filamentType,
        printDuration: activity.printDuration,
        printDurationFormatted: activity.printDuration ? dateService.formatDurationSeconds(activity.printDuration) : null,
        comments: activity.comments,
        status: endDate ? "COMPLETED" : "IN_PROGRESS",
      },
    };
  }

  /**
   * Get formatted usage history for a specific machine
   */
  async getMachineUsageHistory(machineId, limit = 100) {
    const rawActivities = await prisma.activity.findMany({
      where: {
        resourceId: Number(machineId),
        resourceType: "MACHINE",
      },
      include: {
        user: true,
        history: {
          include: {
            workspace: true,
            userproject: {
              include: { project: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return rawActivities.map((act) => {
      const effectiveStart = act.startedAt || act.createdAt;
      const effectiveEnd = act.endedAt;
      const durationFormatted = effectiveEnd ? dateService.formatDuration(effectiveStart, effectiveEnd) : null;

      return {
        id: act.id,
        createdAt: act.createdAt,
        formattedDate: dateService.formatDateTime(act.createdAt),
        startedAt: effectiveStart,
        formattedStartedAt: effectiveStart ? dateService.formatDateTime(effectiveStart) : null,
        endedAt: effectiveEnd,
        formattedEndedAt: effectiveEnd ? dateService.formatDateTime(effectiveEnd) : null,
        durationFormatted,
        gcodeName: act.gcodeName || null,
        filamentQuantity: act.filamentQuantity ? Number(act.filamentQuantity) : null,
        filamentType: act.filamentType || null,
        printDuration: act.printDuration || null,
        printDurationFormatted: act.printDuration ? dateService.formatDurationSeconds(act.printDuration) : null,
        user: act.user || null,
        workspace: act.history && act.history.workspace ? act.history.workspace.name : "-",
        project:
          act.history && act.history.userproject && act.history.userproject.project
            ? act.history.userproject.project
            : null,
        departure: act.history && act.history.departure ? dateService.formatDateTime(act.history.departure) : null,
        comments: act.comments || (act.history ? act.history.comments : null),
        status: effectiveEnd ? "COMPLETED" : act.startedAt ? "IN_PROGRESS" : "LEGACY",
      };
    });
  }
}

module.exports = new MachineUsageService();

