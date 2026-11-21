const { prisma: defaultPrisma } = require("../utilities/db");
const defaultMailService = require("./mailService.js");
const defaultLogger = require("../utilities/simpleLogger.js");
const { ALLOWED_STAFF_ROLES } = require("../schemas/staff.schema.js");

/**
 * Service gérant la gestion des comptes staff par les administrateurs
 * avec liste blanche de rôles, protection anti-auto-lockout et protection du dernier admin actif.
 */
class StaffAdminService {
  /**
   * @param {Object} [deps] Surcharges optionnelles pour les tests unitaires
   */
  constructor({ prisma, mailService, logger } = {}) {
    this.prisma = prisma || defaultPrisma;
    this.mailService = mailService || defaultMailService;
    this.logger = logger || defaultLogger;
  }

  /**
   * Vérifie si la cible correspond au compte de l'administrateur courant.
   *
   * @param {Object} targetStaff
   * @param {Object} [actor]
   * @returns {boolean}
   */
  _isSelf(targetStaff, actor = {}) {
    if (actor.staffId && Number(actor.staffId) === Number(targetStaff.id)) {
      return true;
    }
    if (actor.username && targetStaff.name && actor.username === targetStaff.name) {
      return true;
    }
    return false;
  }

  /**
   * Compte le nombre d'administrateurs actuellement actifs (role === "admin" && approved === true).
   *
   * @returns {Promise<number>}
   */
  async _countActiveAdmins() {
    return this.prisma.staff.count({
      where: {
        role: "admin",
        approved: true,
      },
    });
  }

  /**
   * Valide si l'action administrative (désactivation, rétrogradation, suppression) est autorisée.
   *
   * @param {Object} targetStaff
   * @param {Object} actor
   * @param {string} actionVerb
   * @returns {Promise<{ allowed: boolean, code?: string, message?: string }>}
   */
  async _checkAdminRemovalAllowed(targetStaff, actor, actionVerb) {
    if (this._isSelf(targetStaff, actor)) {
      return {
        allowed: false,
        code: "SELF_ACTION_FORBIDDEN",
        message: `Action impossible : vous ne pouvez pas ${actionVerb} votre propre compte administrateur.`,
      };
    }

    if (targetStaff.role === "admin" && targetStaff.approved) {
      const activeAdminCount = await this._countActiveAdmins();
      if (activeAdminCount <= 1) {
        return {
          allowed: false,
          code: "LAST_ADMIN_PROTECTED",
          message: "Action impossible : le dernier administrateur actif ne peut pas être retiré ou désactivé.",
        };
      }
    }

    return { allowed: true };
  }

  async _findTarget(targetId) {
    const parsedId = Number(targetId);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return { error: { success: false, code: "INVALID_ID", message: "Identifiant de compte staff invalide." } };
    }
    const staff = await this.prisma.staff.findUnique({ where: { id: parsedId } });
    if (!staff) {
      return { error: { success: false, code: "STAFF_NOT_FOUND", message: "Compte staff introuvable." } };
    }
    return { staff };
  }

  async enableStaff({ targetId, actor = {}, hostUrl }) {
    const { staff: staffBefore, error } = await this._findTarget(targetId);
    if (error) return error;

    const result = await this.prisma.staff.update({
      where: { id: staffBefore.id },
      data: { approved: true },
    });

    if (!staffBefore.approved && hostUrl) {
      this.mailService
        .sendStaffApprovedNotification({
          staff: result,
          adminUsername: actor.username,
          hostUrl,
        })
        .catch((err) => console.error("[staffAdminService/enable] Failed to send staff approved email:", err));
    }

    this.logger.logThat(`User ${result.name} enabled by ${actor.username || "Admin"}`);
    return { success: true, staff: result, message: "Success: User is now enabled" };
  }

  async disableStaff({ targetId, actor = {} }) {
    const { staff: targetStaff, error } = await this._findTarget(targetId);
    if (error) return error;

    const check = await this._checkAdminRemovalAllowed(targetStaff, actor, "désactiver");
    if (!check.allowed) {
      return { success: false, code: check.code, message: check.message };
    }

    const result = await this.prisma.staff.update({
      where: { id: targetStaff.id },
      data: { approved: false },
    });

    this.logger.logThat(`User ${result.name} disabled by ${actor.username || "Admin"}`);
    return { success: true, staff: result, message: "Success: User is now disabled" };
  }

  async promoteStaff({ targetId, actor = {} }) {
    const { staff: targetStaff, error } = await this._findTarget(targetId);
    if (error) return error;

    const result = await this.prisma.staff.update({
      where: { id: targetStaff.id },
      data: { role: "admin" },
    });

    this.logger.logThat(`User ${result.name} made admin by ${actor.username || "Admin"}`);
    return { success: true, staff: result, message: "Success: User is now admin" };
  }

  async demoteStaff({ targetId, actor = {} }) {
    const { staff: targetStaff, error } = await this._findTarget(targetId);
    if (error) return error;

    const check = await this._checkAdminRemovalAllowed(targetStaff, actor, "rétrograder");
    if (!check.allowed) {
      return { success: false, code: check.code, message: check.message };
    }

    const result = await this.prisma.staff.update({
      where: { id: targetStaff.id },
      data: { role: "user" },
    });

    this.logger.logThat(`User ${result.name} made simple user by ${actor.username || "Admin"}`);
    return { success: true, staff: result, message: "Success: User is now just a user again" };
  }

  async deleteStaff({ targetId, actor = {} }) {
    const { staff: targetStaff, error } = await this._findTarget(targetId);
    if (error) return error;

    const check = await this._checkAdminRemovalAllowed(targetStaff, actor, "supprimer");
    if (!check.allowed) {
      return { success: false, code: check.code, message: check.message };
    }

    const result = await this.prisma.staff.delete({
      where: { id: targetStaff.id },
    });

    this.logger.logThat(`User ${result.name} has been deleted by ${actor.username || "Admin"}`);
    return { success: true, staff: result, message: "Success: User has been deleted" };
  }

  async updateStaff({ data, actor = {}, hostUrl }) {
    const { id, username, email, role, approved } = data;

    if (!ALLOWED_STAFF_ROLES.includes(role)) {
      return {
        success: false,
        code: "INVALID_ROLE",
        message: "Rôle staff invalide. Valeurs autorisées : admin, user, staff.",
      };
    }

    const { staff: staffBefore, error } = await this._findTarget(id);
    if (error) return error;

    const losesAdminPrivilege = staffBefore.role === "admin" && (role !== "admin" || !approved);
    if (losesAdminPrivilege) {
      const verb = role !== "admin" ? "rétrograder" : "désactiver";
      const check = await this._checkAdminRemovalAllowed(staffBefore, actor, verb);
      if (!check.allowed) {
        return { success: false, code: check.code, message: check.message };
      }
    }

    const result = await this.prisma.staff.update({
      where: { id: staffBefore.id },
      data: {
        name: username,
        email,
        role,
        approved: Boolean(approved),
      },
    });

    if (approved && !staffBefore.approved && hostUrl) {
      this.mailService
        .sendStaffApprovedNotification({
          staff: result,
          adminUsername: actor.username,
          hostUrl,
        })
        .catch((err) => console.error("[staffAdminService/update] Failed to send staff approved email:", err));
    }

    this.logger.logThat(`User ${result.name} has been updated by ${actor.username || "Admin"}`);
    return { success: true, staff: result, message: "Success: User has been updated" };
  }
}

const staffAdminService = new StaffAdminService();
staffAdminService.StaffAdminService = StaffAdminService;

module.exports = staffAdminService;
