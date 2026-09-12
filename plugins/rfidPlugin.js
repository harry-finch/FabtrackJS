const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const logger = require("../utilities/simpleLogger.js");

// Anti-bounce memory map: { [rfid]: timestamp }
const lastScans = new Map();
const ANTI_BOUNCE_MS = 3500; // 3.5 seconds

module.exports = {
  id: "rfid",
  name: "Plugin Borne RFID",
  version: "1.0.0",
  envKey: "ENABLE_PLUGIN_RFID",
  description: "Permet le pointage automatique entrée / sortie sur borne tactile avec un lecteur de cartes RFID (badge UID).",

  register(hookManager) {
    // Hook to process RFID scan
    hookManager.addHook("rfid:scan", async ({ rfid, workspaceId, staffUsername }) => {
      if (!rfid || typeof rfid !== "string") {
        return { success: false, code: "INVALID_RFID", message: "Code RFID invalide ou absent." };
      }

      const cleanRfid = rfid.trim();
      if (!cleanRfid) {
        return { success: false, code: "INVALID_RFID", message: "Code RFID vide." };
      }

      const now = Date.now();

      // Anti-bounce protection
      const lastScanTime = lastScans.get(cleanRfid);
      if (lastScanTime && (now - lastScanTime < ANTI_BOUNCE_MS)) {
        return {
          success: false,
          code: "DEBOUNCE",
          message: "Scan déjà en cours de prise en compte, veuillez patienter quelques secondes.",
        };
      }
      lastScans.set(cleanRfid, now);

      // Clean up old entries from lastScans to avoid memory leaks
      if (lastScans.size > 1000) {
        for (const [k, v] of lastScans.entries()) {
          if (now - v > 60000) lastScans.delete(k);
        }
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
          message: "Badge non reconnu. Veuillez vous rapprocher d'un médiateur pour vous inscrire ou associer votre carte.",
        };
      }

      // Check if user is currently checked-in in this workspace (departure is null)
      const currentVisit = await prisma.history.findFirst({
        where: {
          userId: user.id,
          departure: null,
          workspaceId: workspaceId ? Number(workspaceId) : undefined,
        },
        orderBy: {
          arrival: "desc",
        },
      });

      if (currentVisit) {
        // --- CHECK-OUT ---
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

        logger.logThat(`RFID Check-out: ${user.name} ${user.surname} (RFID: ${cleanRfid}) checked out after ${durationMinutes} min by ${staffUsername || "kiosk"}`);

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
        const arrivalTime = new Date();
        const newVisit = await prisma.history.create({
          data: {
            userId: user.id,
            arrival: arrivalTime,
            workspaceId: workspaceId ? Number(workspaceId) : null,
          },
        });

        logger.logThat(`RFID Check-in: ${user.name} ${user.surname} (RFID: ${cleanRfid}) checked in by ${staffUsername || "kiosk"}`);

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
