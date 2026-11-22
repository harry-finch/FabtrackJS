const { prisma: defaultPrisma } = require("../utilities/db");
const defaultLogger = require("../utilities/simpleLogger.js");
const defaultDateService = require("./dateService.js");

/**
 * Service managing machine access verifications and machine usage sessions (tracking & 3D printing)
 */
class MachineUsageService {
  /**
   * @param {Object} [deps] Optional dependency overrides for unit testing
   */
  constructor({ prisma, logger, dateService } = {}) {
    this.prisma = prisma || defaultPrisma;
    this.logger = logger || defaultLogger;
    this.dateService = dateService || defaultDateService;
  }

  /**
   * Compute midnight local timestamp for the current day.
   * Used to restrict NFC presence checks to check-ins made today.
   *
   * @returns {Date}
   */
  _getStartOfToday() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start;
  }

  /**
   * Build a minimal public user representation without PII (no email, rfid, token, balance).
   *
   * @param {Object} user
   * @param {Object} [options]
   * @param {boolean} [options.includeIsExpert=false]
   * @returns {Object}
   */
  _formatPublicUser(user, { includeIsExpert = false } = {}) {
    const formatted = {
      id: user.id,
      name: user.name,
      surname: user.surname,
      usertype: user.usertype ? user.usertype.name : null,
    };
    if (includeIsExpert) {
      formatted.isExpert = Boolean(user.isExpert);
    }
    return formatted;
  }

  /**
   * Find an active check-in session (History.departure === null) started today.
   *
   * @param {number} userId
   * @returns {Promise<Object|null>}
   */
  async _findActiveTodayVisit(userId) {
    return this.prisma.history.findFirst({
      where: {
        userId,
        departure: null,
        arrival: { gte: this._getStartOfToday() },
      },
      orderBy: {
        arrival: "desc",
      },
      include: {
        workspace: true,
      },
    });
  }

  /**
   * Resolve or validate a historyId so an API caller cannot attach an activity
   * to another user's visit (IDOR protection).
   *
   * @param {Object} params
   * @param {number} params.userId
   * @param {number|null|undefined} params.historyId
   * @returns {Promise<{ valid: boolean, historyId: number|null }>}
   */
  async _resolveValidatedHistoryId({ userId, historyId }) {
    if (historyId) {
      const visit = await this.prisma.history.findFirst({
        where: {
          id: Number(historyId),
          userId,
        },
        select: { id: true },
      });
      if (!visit) {
        return { valid: false, historyId: null };
      }
      return { valid: true, historyId: visit.id };
    }

    const activeVisit = await this._findActiveTodayVisit(userId);
    return { valid: true, historyId: activeVisit ? activeVisit.id : null };
  }

  /**
   * Evaluate machine access permission (Arbitration 1A, without SQL migration):
   * - If no active Workshop is linked to machine.accessId => free access
   * - Otherwise user must have UserWorkshopCompletion on one of those active workshops OR user.isExpert === true
   *
   * @param {Object} user
   * @param {Object} machine
   * @returns {Promise<{ hasAccess: boolean, requiredWorkshops: Array<{ id: number, name: string }> }>}
   */
  async _checkMachineAccess(user, machine) {
    if (!machine.accessId) {
      return { hasAccess: true, requiredWorkshops: [] };
    }

    const requiredWorkshops = await this.prisma.workshop.findMany({
      where: {
        accessId: machine.accessId,
        active: true,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (requiredWorkshops.length === 0) {
      return { hasAccess: true, requiredWorkshops: [] };
    }

    if (user.isExpert) {
      return { hasAccess: true, requiredWorkshops };
    }

    const completion = await this.prisma.userWorkshopCompletion.findFirst({
      where: {
        userId: user.id,
        workshopId: {
          in: requiredWorkshops.map((w) => w.id),
        },
      },
      select: { id: true },
    });

    return {
      hasAccess: Boolean(completion),
      requiredWorkshops,
    };
  }

  /**
   * Verify if a scanned card / RFID corresponds to a registered Fablab user
   * who is currently checked-in today, without active warning, and authorized on the machine.
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

    // 1. Find user by RFID (excluding soft-deleted accounts)
    const user = await this.prisma.user.findFirst({
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
        user: this._formatPublicUser(user),
        message: `Accès refusé : ${user.name} ${user.surname} n'a pas encore signé la charte d'utilisation du lab.`,
      };
    }

    // 3. Check active check-in presence today (History departure is null & arrival >= today 00:00)
    const activeVisit = await this._findActiveTodayVisit(user.id);

    if (!activeVisit) {
      return {
        success: false,
        code: "NOT_CHECKED_IN",
        canUnlock: false,
        isPresent: false,
        user: this._formatPublicUser(user),
        message: `Contributeur ${user.name} ${user.surname} reconnu, mais non enregistré comme présent aujourd'hui dans le lab. Veuillez badger à la borne tactile d'accueil avant d'utiliser une machine.`,
      };
    }

    // 4. Block access if the user has any active warning (Arbitration 2A)
    const activeWarnings = await this.prisma.warning.findMany({
      where: {
        userId: user.id,
        active: true,
      },
      include: {
        warningtype: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (activeWarnings.length > 0) {
      return {
        success: false,
        code: "ACTIVE_WARNING",
        canUnlock: false,
        isPresent: true,
        user: this._formatPublicUser(user, { includeIsExpert: true }),
        warnings: activeWarnings.map((w) => ({
          id: w.id,
          type: w.warningtype ? w.warningtype.name : null,
          comments: w.comments || null,
          createdAt: w.createdAt,
        })),
        message: `Accès bloqué : ${user.name} ${user.surname} possède un avertissement actif. Veuillez vous adresser à un médiateur.`,
      };
    }

    // 5. Check machine existence & workshop access level if machineId is supplied
    let machineInfo = null;
    if (machineId !== undefined && machineId !== null && machineId !== "") {
      const parsedMachineId = Number(machineId);
      const machine = await this.prisma.machine.findUnique({
        where: { id: parsedMachineId },
        include: { access: true, machinetype: true },
      });

      if (!machine) {
        return {
          success: false,
          code: "MACHINE_NOT_FOUND",
          canUnlock: false,
          isPresent: true,
          user: this._formatPublicUser(user, { includeIsExpert: true }),
          message: `Machine #${machineId} introuvable.`,
        };
      }

      machineInfo = {
        id: machine.id,
        name: machine.name,
        make: machine.make,
        model: machine.model,
        type: machine.machinetype ? machine.machinetype.name : null,
        accessRequired: machine.access ? machine.access.name : "Accès libre",
      };

      const { hasAccess, requiredWorkshops } = await this._checkMachineAccess(user, machine);
      if (!hasAccess) {
        return {
          success: false,
          code: "MACHINE_ACCESS_DENIED",
          canUnlock: false,
          isPresent: true,
          hasAccess: false,
          user: this._formatPublicUser(user, { includeIsExpert: true }),
          machine: machineInfo,
          requiredWorkshops: requiredWorkshops.map((w) => w.name),
          message: `Accès refusé : ${user.name} ${user.surname} n'a pas encore validé l'atelier requis pour ${machine.name}.`,
        };
      }
    }

    return {
      success: true,
      code: "OK",
      canUnlock: true,
      isPresent: true,
      user: this._formatPublicUser(user, { includeIsExpert: true }),
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
   * Helper to resolve an active (non soft-deleted) user by rfid or userId.
   *
   * @param {Object} params
   * @param {string} [params.rfid]
   * @param {number} [params.userId]
   * @returns {Promise<Object|null>}
   */
  async _resolveUser({ rfid, userId }) {
    if (userId) {
      return this.prisma.user.findFirst({
        where: { id: Number(userId), deletedAt: null },
        include: { usertype: true },
      });
    }
    if (rfid && typeof rfid === "string" && rfid.trim()) {
      return this.prisma.user.findFirst({
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

    if (!user.termsAccepted) {
      return {
        success: false,
        code: "TERMS_NOT_ACCEPTED",
        message: `Accès refusé : ${user.name} ${user.surname} n'a pas encore signé la charte d'utilisation du lab.`,
      };
    }

    const machine = await this.prisma.machine.findUnique({
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

    const historyCheck = await this._resolveValidatedHistoryId({ userId: user.id, historyId });
    if (!historyCheck.valid) {
      return {
        success: false,
        code: "INVALID_HISTORY",
        message: "La visite spécifiée (historyId) est invalide ou n'appartient pas à cet utilisateur.",
      };
    }

    const startDateTime = startedAt ? new Date(startedAt) : new Date();

    const activity = await this.prisma.activity.create({
      data: {
        userId: user.id,
        resourceId: machine.id,
        resourceType: "MACHINE",
        machineId: machine.id,
        historyId: historyCheck.historyId,
        startedAt: startDateTime,
        endedAt: null, // Session currently in progress
        gcodeName: gcodeName ? String(gcodeName).trim() : null,
        filamentQuantity: filamentQuantity != null ? Number(filamentQuantity) : null,
        filamentType: filamentType ? String(filamentType).trim() : null,
        printDuration: printDuration != null ? parseInt(printDuration, 10) : null,
        comments: comments ? String(comments).trim() : null,
      },
    });

    this.logger.logThat(
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
    let resolvedUser = null;
    if (userId || (rfid && typeof rfid === "string" && rfid.trim())) {
      resolvedUser = await this._resolveUser({ rfid, userId });
      if (!resolvedUser) {
        return {
          success: false,
          code: "USER_NOT_FOUND",
          message: "Utilisateur ou badge RFID introuvable.",
        };
      }
    }

    let activity = null;

    if (activityId) {
      const candidate = await this.prisma.activity.findUnique({
        where: { id: Number(activityId) },
        include: {
          user: {
            select: { id: true, name: true, surname: true },
          },
        },
      });

      if (!candidate || candidate.resourceType !== "MACHINE" || candidate.endedAt !== null) {
        return {
          success: false,
          code: "ACTIVITY_NOT_FOUND",
          message: "Session machine ouverte introuvable pour cet identifiant.",
        };
      }

      if (resolvedUser && candidate.userId !== resolvedUser.id) {
        return {
          success: false,
          code: "UNAUTHORIZED_SESSION",
          message: "Cette session machine appartient à un autre utilisateur.",
        };
      }

      activity = candidate;
    } else if (machineId) {
      // Find latest ongoing session for this machine (scoped to user if provided)
      const where = {
        resourceId: Number(machineId),
        resourceType: "MACHINE",
        endedAt: null,
      };

      if (resolvedUser) {
        where.userId = resolvedUser.id;
      }

      activity = await this.prisma.activity.findFirst({
        where,
        orderBy: { startedAt: "desc" },
        include: {
          user: {
            select: { id: true, name: true, surname: true },
          },
        },
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
    const startRef = activity.startedAt || activity.createdAt;
    if (startRef && endDateTime.getTime() < new Date(startRef).getTime()) {
      return {
        success: false,
        code: "INVALID_DATE_RANGE",
        message: "La date de fin ('endedAt') doit être postérieure ou égale à la date de début de la session.",
      };
    }

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

    const updated = await this.prisma.activity.update({
      where: { id: activity.id },
      data: updateData,
      include: {
        user: {
          select: { id: true, name: true, surname: true },
        },
      },
    });

    const start = updated.startedAt || updated.createdAt;
    const durationMinutes = Math.max(1, Math.round((endDateTime.getTime() - new Date(start).getTime()) / 60000));
    const durationFormatted = this.dateService.formatDuration(start, endDateTime);

    const machine = await this.prisma.machine.findUnique({ where: { id: updated.resourceId } });

    this.logger.logThat(
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
        printDurationFormatted: updated.printDuration ? this.dateService.formatDurationSeconds(updated.printDuration) : null,
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

    if (!user.termsAccepted) {
      return {
        success: false,
        code: "TERMS_NOT_ACCEPTED",
        message: `Accès refusé : ${user.name} ${user.surname} n'a pas encore signé la charte d'utilisation du lab.`,
      };
    }

    const machine = await this.prisma.machine.findUnique({
      where: { id: Number(machineId) },
    });
    if (!machine) {
      return {
        success: false,
        code: "MACHINE_NOT_FOUND",
        message: `Machine #${machineId} introuvable.`,
      };
    }

    const startDate = startedAt ? new Date(startedAt) : new Date();
    const endDate = endedAt ? new Date(endedAt) : null;

    if (endDate && endDate.getTime() < startDate.getTime()) {
      return {
        success: false,
        code: "INVALID_DATE_RANGE",
        message: "La date de fin ('endedAt') doit être postérieure ou égale à la date de début ('startedAt').",
      };
    }

    const historyCheck = await this._resolveValidatedHistoryId({ userId: user.id, historyId });
    if (!historyCheck.valid) {
      return {
        success: false,
        code: "INVALID_HISTORY",
        message: "La visite spécifiée (historyId) est invalide ou n'appartient pas à cet utilisateur.",
      };
    }

    const activity = await this.prisma.activity.create({
      data: {
        userId: user.id,
        resourceId: machine.id,
        resourceType: "MACHINE",
        machineId: machine.id,
        historyId: historyCheck.historyId,
        startedAt: startDate,
        endedAt: endDate,
        gcodeName: gcodeName ? String(gcodeName).trim() : null,
        filamentQuantity: filamentQuantity != null ? Number(filamentQuantity) : null,
        filamentType: filamentType ? String(filamentType).trim() : null,
        printDuration: printDuration != null ? parseInt(printDuration, 10) : null,
        comments: comments ? String(comments).trim() : null,
      },
      include: {
        user: {
          select: { id: true, name: true, surname: true },
        },
      },
    });

    const durationMinutes = endDate
      ? Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 60000))
      : null;
    const durationFormatted = endDate ? this.dateService.formatDuration(startDate, endDate) : null;

    this.logger.logThat(
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
        printDurationFormatted: activity.printDuration ? this.dateService.formatDurationSeconds(activity.printDuration) : null,
        comments: activity.comments,
        status: endDate ? "COMPLETED" : "IN_PROGRESS",
      },
    };
  }

  /**
   * Get formatted usage history for a specific machine.
   * Limits User columns to { id, name, surname } by default (optionally adding email for admin UI).
   *
   * @param {number} machineId
   * @param {number} [limit=50]
   * @param {Object} [options]
   * @param {boolean} [options.includeEmail=false]
   * @returns {Promise<Array<Object>>}
   */
  async getMachineUsageHistory(machineId, limit = 50, { includeEmail = false } = {}) {
    const parsedMachineId = Number(machineId);
    if (!Number.isInteger(parsedMachineId) || parsedMachineId <= 0) {
      throw new Error("Identifiant de machine (machineId) invalide.");
    }

    const parsedLimit = Number.parseInt(limit, 10);
    const safeLimit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 50;

    const userSelect = {
      id: true,
      name: true,
      surname: true,
    };
    if (includeEmail) {
      userSelect.email = true;
    }

    const rawActivities = await this.prisma.activity.findMany({
      where: {
        resourceId: parsedMachineId,
        resourceType: "MACHINE",
      },
      include: {
        user: {
          select: userSelect,
        },
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
      take: safeLimit,
    });

    return rawActivities.map((act) => {
      const effectiveStart = act.startedAt || act.createdAt;
      const effectiveEnd = act.endedAt;
      const durationFormatted = effectiveEnd ? this.dateService.formatDuration(effectiveStart, effectiveEnd) : null;

      return {
        id: act.id,
        createdAt: act.createdAt,
        formattedDate: this.dateService.formatDateTime(act.createdAt),
        startedAt: effectiveStart,
        formattedStartedAt: effectiveStart ? this.dateService.formatDateTime(effectiveStart) : null,
        endedAt: effectiveEnd,
        formattedEndedAt: effectiveEnd ? this.dateService.formatDateTime(effectiveEnd) : null,
        durationFormatted,
        gcodeName: act.gcodeName || null,
        filamentQuantity: act.filamentQuantity ? Number(act.filamentQuantity) : null,
        filamentType: act.filamentType || null,
        printDuration: act.printDuration || null,
        printDurationFormatted: act.printDuration ? this.dateService.formatDurationSeconds(act.printDuration) : null,
        user: act.user || null,
        workspace: act.history && act.history.workspace ? act.history.workspace.name : "-",
        project:
          act.history && act.history.userproject && act.history.userproject.project
            ? act.history.userproject.project
            : null,
        departure: act.history && act.history.departure ? this.dateService.formatDateTime(act.history.departure) : null,
        comments: act.comments || (act.history ? act.history.comments : null),
        status: effectiveEnd ? "COMPLETED" : act.startedAt ? "IN_PROGRESS" : "LEGACY",
      };
    });
  }

  /**
   * Computes exact machine usage statistics via SQL aggregation (no 100-row cap).
   *
   * @param {number} machineId
   * @returns {Promise<{ totalSessions: number, uniqueUsers: number, lastUsed: string }>}
   */
  async getMachineUsageStats(machineId) {
    const parsedMachineId = Number(machineId);
    if (!Number.isInteger(parsedMachineId) || parsedMachineId <= 0) {
      return { totalSessions: 0, uniqueUsers: 0, lastUsed: "Jamais" };
    }

    const baseWhere = {
      resourceId: parsedMachineId,
      resourceType: "MACHINE",
    };

    const [totalSessions, distinctUsers, latestActivity] = await Promise.all([
      this.prisma.activity.count({ where: baseWhere }),
      this.prisma.activity.findMany({
        where: { ...baseWhere, userId: { not: null } },
        select: { userId: true },
        distinct: ["userId"],
      }),
      this.prisma.activity.findFirst({
        where: baseWhere,
        orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
        select: { startedAt: true, createdAt: true },
      }),
    ]);

    const lastDate = latestActivity ? latestActivity.startedAt || latestActivity.createdAt : null;

    return {
      totalSessions,
      uniqueUsers: Array.isArray(distinctUsers) ? distinctUsers.length : 0,
      lastUsed: lastDate ? this.dateService.formatDateTime(lastDate) : "Jamais",
    };
  }
}

const machineUsageService = new MachineUsageService();
machineUsageService.MachineUsageService = MachineUsageService;

module.exports = machineUsageService;
