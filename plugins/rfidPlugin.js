const { prisma } = require("../utilities/db");
const logger = require("../utilities/simpleLogger.js");
const { maskRfidUid } = require("../utilities/structuredLogger.js");
const { getStartOfDay } = require("../services/visitAutoCloseService.js");
const realtimeService = require("../services/realtimeService.js");
const borneCheckinService = require("../services/borneCheckinService.js");

// Anti-bounce memory map: { [rfid]: timestamp }
const lastScans = new Map();
const ANTI_BOUNCE_MS = 3500; // 3.5 seconds

function markRfidScanTimestamp(cleanRfid) {
  if (!cleanRfid) return;
  const now = Date.now();
  lastScans.set(cleanRfid, now);
  if (lastScans.size > 1000) {
    for (const [k, v] of lastScans.entries()) {
      if (now - v > 60000) lastScans.delete(k);
    }
  }
}

module.exports = {
  id: "rfid",
  name: "Plugin Borne RFID",
  version: "1.0.0",
  envKey: "ENABLE_PLUGIN_RFID",
  description: "Permet le pointage automatique entrée / sortie sur borne tactile avec un lecteur de cartes RFID (badge UID).",
  markRfidScanTimestamp,

  register(hookManager) {
    // Hook to process RFID scan
    hookManager.addHook("rfid:scan", async ({ rfid, workspaceId, staffUsername, actorRole }) => {
      if (!rfid || typeof rfid !== "string") {
        return { success: false, code: "INVALID_RFID", message: "Code RFID invalide ou absent." };
      }

      const cleanRfid = rfid.trim();
      if (!cleanRfid) {
        return { success: false, code: "INVALID_RFID", message: "Code RFID vide." };
      }

      const now = Date.now();

      // Anti-bounce protection (guards double-taps right after a completed check-in or check-out)
      const lastScanTime = lastScans.get(cleanRfid);
      if (lastScanTime && (now - lastScanTime < ANTI_BOUNCE_MS)) {
        return {
          success: false,
          code: "DEBOUNCE",
          message: "Scan déjà en cours de prise en compte, veuillez patienter quelques secondes.",
        };
      }

      // Find user by RFID
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
          rfid: cleanRfid,
          message: "Badge non reconnu. Veuillez vous présenter à l'accueil auprès d'un membre de l'équipe.",
        };
      }

      // Check if user is currently checked-in today in this workspace (ignore forgotten open visits from prior days)
      const startOfToday = getStartOfDay(new Date());
      const currentVisit = await prisma.history.findFirst({
        where: {
          userId: user.id,
          departure: null,
          arrival: { gte: startOfToday },
          workspaceId: workspaceId ? Number(workspaceId) : undefined,
        },
        orderBy: {
          arrival: "desc",
        },
      });

      if (currentVisit) {
        // --- CHECK-OUT ---
        markRfidScanTimestamp(cleanRfid);
        const departureTime = new Date();
        const arrivalTime = new Date(currentVisit.arrival);
        const durationMinutes = Math.max(1, Math.round((departureTime.getTime() - arrivalTime.getTime()) / (1000 * 60)));
        const hours = Math.floor(durationMinutes / 60);
        const mins = durationMinutes % 60;
        const durationFormatted = hours > 0 
          ? `${hours}h${mins > 0 ? mins.toString().padStart(2, "0") : ""}`
          : `${durationMinutes} min`;

        await prisma.history.update({
          where: { id: currentVisit.id },
          data: {
            departure: departureTime,
          },
        });

        logger.logThat(`RFID Check-out: ${user.name} ${user.surname} (RFID: ${maskRfidUid(cleanRfid)}) checked out after ${durationMinutes} min by ${staffUsername || "kiosk"}`);

        realtimeService.publish("kiosk", { workspaceId: currentVisit.workspaceId || workspaceId || null, action: "rfid-checkout" });
        realtimeService.publish("admin", { entity: "history", action: "rfid-checkout" });

        return {
          success: true,
          action: "checkout",
          user: {
            id: user.id,
            name: user.name,
            surname: user.surname,
            type: user.usertype ? user.usertype.name : "",
          },
          durationMinutes,
          durationFormatted,
          message: `Au revoir ${user.name} ! Votre sortie a bien été enregistrée.`,
        };
      } else {
        // --- CHECK-IN ---
        if (!user.termsAccepted) {
          logger.logThat(`RFID Check-in refused: ${user.name} ${user.surname} (RFID: ${maskRfidUid(cleanRfid)}) - terms not accepted`);
          return {
            success: false,
            code: "TERMS_NOT_ACCEPTED",
            rfid: cleanRfid,
            user: {
              id: user.id,
              name: user.name,
              surname: user.surname,
              type: user.usertype ? user.usertype.name : "",
            },
            message: `Accès refusé : ${user.name} ${user.surname} n'a pas encore validé la charte d'utilisation. Veuillez vous présenter à l'accueil.`,
          };
        }

        // R-036: On self-service borne accounts (role === "staff"), ask the contributor to confirm
        // purpose of visit, project and optional comment before creating the visit.
        if (actorRole === "staff") {
          const ownProjects = await borneCheckinService.getContributorProjectsForBorne(user.id);
          return {
            success: true,
            action: "prompt_checkin",
            rfid: cleanRfid,
            user: {
              name: user.name,
              surname: user.surname,
              type: user.usertype ? user.usertype.name : "",
            },
            projects: ownProjects,
            message: `Bonjour ${user.name} ! Précisez le motif de votre visite puis confirmez votre entrée.`,
          };
        }

        markRfidScanTimestamp(cleanRfid);
        const arrivalTime = new Date();
        const newVisit = await prisma.history.create({
          data: {
            userId: user.id,
            arrival: arrivalTime,
            workspaceId: workspaceId ? Number(workspaceId) : null,
          },
        });

        logger.logThat(`RFID Check-in: ${user.name} ${user.surname} (RFID: ${maskRfidUid(cleanRfid)}) checked in by ${staffUsername || "kiosk"}`);

        realtimeService.publish("kiosk", { workspaceId: workspaceId ? Number(workspaceId) : null, action: "rfid-checkin" });
        realtimeService.publish("admin", { entity: "history", action: "rfid-checkin" });

        return {
          success: true,
          action: "checkin",
          visitId: newVisit.id,
          user: {
            id: user.id,
            name: user.name,
            surname: user.surname,
            type: user.usertype ? user.usertype.name : "",
          },
          message: `Bienvenue ${user.name} ! Votre entrée a bien été enregistrée.`,
        };
      }
    });

    // Hook to check if a badge is already in use
    hookManager.addHook("rfid:checkAvailability", async ({ rfid, excludeUserId }) => {
      if (!rfid) return { available: true };
      const cleanRfid = rfid.trim();
      const existing = await prisma.user.findFirst({
        where: {
          rfid: cleanRfid,
          id: excludeUserId ? { not: Number(excludeUserId) } : undefined,
          deletedAt: null,
        },
        select: { id: true, name: true, surname: true },
      });
      return {
        available: !existing,
        existingUser: existing ? `${existing.name} ${existing.surname}` : null,
      };
    });
  },
};
