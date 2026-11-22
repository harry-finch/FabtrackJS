const { prisma: defaultPrisma } = require("../utilities/db");
const defaultLogger = require("../utilities/simpleLogger.js");

/**
 * Service gérant les opérations financières sur les soldes usagers (régularisation de dette, crédit positif, ajustement admin)
 * avec vérifications atomiques et journalisation d'audit.
 */
class BalanceService {
  /**
   * @param {Object} [deps] Surcharges optionnelles pour les tests unitaires
   */
  constructor({ prisma, logger } = {}) {
    this.prisma = prisma || defaultPrisma;
    this.logger = logger || defaultLogger;
  }

  /**
   * Acquitte la dette d'un usager uniquement si son solde est strictement négatif (< 0).
   * Empêche la remise à zéro accidentelle d'un solde créditeur (> 0).
   *
   * @param {Object} params
   * @param {number|string} params.userId
   * @param {string} [params.actorUsername]
   * @returns {Promise<Object>}
   */
  async clearUserDebt({ userId, actorUsername }) {
    const parsedId = Number(userId);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return {
        success: false,
        code: "INVALID_USER",
        message: "Identifiant utilisateur invalide.",
      };
    }

    const user = await this.prisma.user.findFirst({
      where: { id: parsedId, deletedAt: null },
      select: { id: true, name: true, surname: true, balance: true },
    });

    if (!user) {
      return {
        success: false,
        code: "USER_NOT_FOUND",
        message: "Utilisateur introuvable.",
      };
    }

    const currentBalance = Number(user.balance || 0);
    if (currentBalance > 0) {
      return {
        success: false,
        code: "POSITIVE_BALANCE",
        message: `Impossible d'effacer la dette : ${user.name} ${user.surname} dispose d'un solde positif (${currentBalance.toFixed(2)} €).`,
      };
    }

    if (currentBalance === 0) {
      return {
        success: false,
        code: "NO_DEBT",
        message: `Aucune dette à régulariser pour ${user.name} ${user.surname} (solde déjà à 0,00 €).`,
      };
    }

    const updated = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        deletedAt: null,
        balance: { lt: 0 },
      },
      data: {
        balance: 0.0,
      },
    });

    if (updated.count === 0) {
      return {
        success: false,
        code: "CONFLICT",
        message: "Le solde de ce contributeur a été modifié simultanément. Veuillez réessayer.",
      };
    }

    const actor = actorUsername || "Staff";
    this.logger.logThat(
      `[SOLDE] Dette acquittée pour ${user.name} ${user.surname} (#${user.id}) : ${currentBalance.toFixed(2)} € -> 0.00 € par ${actor}`,
    );

    return {
      success: true,
      previousBalance: currentBalance,
      newBalance: 0,
      message: "Success: Dette réglée !",
    };
  }

  /**
   * Crédite le solde d'un usager d'un montant strictement positif (> 0).
   *
   * @param {Object} params
   * @param {number|string} params.userId
   * @param {number|string} params.amount
   * @param {string} [params.actorUsername]
   * @returns {Promise<Object>}
   */
  async creditUserBalance({ userId, amount, actorUsername }) {
    const parsedId = Number(userId);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return {
        success: false,
        code: "INVALID_USER",
        message: "Identifiant utilisateur invalide.",
      };
    }

    const cleanAmount = Number(amount);
    if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
      return {
        success: false,
        code: "INVALID_AMOUNT",
        message: "Le montant à créditer doit être strictement positif (> 0).",
      };
    }

    const user = await this.prisma.user.findFirst({
      where: { id: parsedId, deletedAt: null },
      select: { id: true, name: true, surname: true, balance: true },
    });

    if (!user) {
      return {
        success: false,
        code: "USER_NOT_FOUND",
        message: "Utilisateur introuvable.",
      };
    }

    const roundedAmount = Number(cleanAmount.toFixed(2));
    const previousBalance = Number(user.balance || 0);

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        balance: { increment: roundedAmount },
      },
      select: { id: true, balance: true },
    });

    const newBalance = Number(updated.balance);
    const actor = actorUsername || "Staff";
    this.logger.logThat(
      `[SOLDE] Crédit de +${roundedAmount.toFixed(2)} € pour ${user.name} ${user.surname} (#${user.id}) : ${previousBalance.toFixed(2)} € -> ${newBalance.toFixed(2)} € par ${actor}`,
    );

    return {
      success: true,
      amount: roundedAmount,
      previousBalance,
      newBalance,
      message: "Success: Account credited!",
    };
  }

  /**
   * Applique un ajustement manuel signé (débit ou crédit) réservé aux administrateurs, avec motif journalisé.
   *
   * @param {Object} params
   * @param {number|string} params.userId
   * @param {number|string} params.delta
   * @param {string} params.reason
   * @param {string} [params.actorUsername]
   * @returns {Promise<Object>}
   */
  async adjustUserBalance({ userId, delta, reason, actorUsername }) {
    const parsedId = Number(userId);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return {
        success: false,
        code: "INVALID_USER",
        message: "Identifiant utilisateur invalide.",
      };
    }

    const cleanDelta = Number(delta);
    if (!Number.isFinite(cleanDelta) || cleanDelta === 0) {
      return {
        success: false,
        code: "INVALID_AMOUNT",
        message: "Le montant de l'ajustement ne peut pas être nul.",
      };
    }

    const cleanReason = typeof reason === "string" ? reason.trim() : "";
    if (cleanReason.length < 3) {
      return {
        success: false,
        code: "INVALID_REASON",
        message: "Un motif d'au moins 3 caractères est obligatoire pour tout ajustement de solde.",
      };
    }

    const user = await this.prisma.user.findFirst({
      where: { id: parsedId, deletedAt: null },
      select: { id: true, name: true, surname: true, balance: true },
    });

    if (!user) {
      return {
        success: false,
        code: "USER_NOT_FOUND",
        message: "Utilisateur introuvable.",
      };
    }

    const roundedDelta = Number(cleanDelta.toFixed(2));
    const previousBalance = Number(user.balance || 0);

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        balance: { increment: roundedDelta },
      },
      select: { id: true, balance: true },
    });

    const newBalance = Number(updated.balance);
    const signPrefix = roundedDelta > 0 ? "+" : "";
    const actor = actorUsername || "Admin";
    this.logger.logThat(
      `[SOLDE] Ajustement admin (${signPrefix}${roundedDelta.toFixed(2)} €) pour ${user.name} ${user.surname} (#${user.id}) : ${previousBalance.toFixed(2)} € -> ${newBalance.toFixed(2)} € par ${actor} (Motif : ${cleanReason})`,
    );

    return {
      success: true,
      delta: roundedDelta,
      previousBalance,
      newBalance,
      reason: cleanReason,
      message: `Success: Solde ajusté (${signPrefix}${roundedDelta.toFixed(2)} €).`,
    };
  }
}

const balanceService = new BalanceService();
balanceService.BalanceService = BalanceService;

module.exports = balanceService;
