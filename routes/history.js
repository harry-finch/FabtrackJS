var express = require("express");
var router = express.Router();

const asyncHandler = require("../middleware/asyncHandler.js");
const isLoggedIn = require("../middleware/checkSession.js");
const { invalidateCache } = require("../middleware/cacheHelper.js");

router.use(isLoggedIn);

const { PrismaClient, ResourceType, ConsumableStatus } = require("@prisma/client");
const prisma = new PrismaClient();

// Helper to update consumable stock and status
async function consumeItem(consumableId, quantity) {
  const consumable = await prisma.consumable.findUnique({
    where: { id: Number(consumableId) },
  });
  if (!consumable) return null;

  const newStock = Math.max(0, consumable.stock - Number(quantity));
  let newStatus = ConsumableStatus.AVAILABLE;
  if (newStock <= 0) {
    newStatus = ConsumableStatus.OUT_OF_STOCK;
  } else if (newStock <= consumable.reorderThreshold) {
    newStatus = ConsumableStatus.LOW_STOCK;
  }

  await prisma.consumable.update({
    where: { id: consumable.id },
    data: {
      stock: newStock,
      status: newStatus,
    },
  });

  return consumable;
}

// ******************************************************************************
// Route to create a history entry (arrival)
// ******************************************************************************

router.post(
  "/create",
  asyncHandler(async (req, res) => {
    let { userid, projecttype, projectid, userprojectid, documentation, comments } = req.body;

    const parsedUserId = Number(userid);
    if (!parsedUserId || isNaN(parsedUserId)) {
      req.session.notification = "Error: Invalid user selected.";
      return res.redirect("/fabtrack");
    }

    // Checking if the user is already here to avoid conflicts
    const alreadyHere = await prisma.history.findMany({
      where: {
        userId: parsedUserId,
        departure: null,
      },
    });

    if (alreadyHere.length === 0) {
      if (!projectid || projectid === "null" || projectid === "") {
        if (documentation && documentation.trim() !== "") {
          // If project does not exist in the db, create the project
          const project = await prisma.project.create({
            data: {
              url: documentation.trim(),
              projecttypeId: projecttype ? Number(projecttype) : 1,
            },
          });
          projectid = project.id;
        }
      }

      // Associate project with user if not already linked
      if (projectid && projectid !== "null" && (!userprojectid || userprojectid === "null" || userprojectid === "")) {
        const existingUP = await prisma.userProject.findFirst({
          where: {
            userId: parsedUserId,
            projectId: Number(projectid),
          },
        });

        if (existingUP) {
          userprojectid = existingUP.id;
        } else {
          const userproject = await prisma.userProject.create({
            data: {
              userId: parsedUserId,
              projectId: Number(projectid),
            },
          });
          userprojectid = userproject.id;
        }
      }

      const activeWorkspaceId = req.session.selectedWorkspace && req.session.selectedWorkspace.id > 0
        ? req.session.selectedWorkspace.id
        : null;

      await prisma.history.create({
        data: {
          userId: parsedUserId,
          userprojectId: userprojectid && userprojectid !== "null" ? Number(userprojectid) : null,
          comments: comments || null,
          workspaceId: activeWorkspaceId,
        },
      });

      req.session.notification = "Success: User is now in the lab!";
    } else {
      req.session.notification = "Error: User is already in the lab!";
    }
    res.redirect("/fabtrack");
  }),
);

// ******************************************************************************
// Route to close a history entry (departure)
// ******************************************************************************

router.get(
  "/exit/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const now = new Date();

    await prisma.history.update({
      where: {
        id: Number(id),
      },
      data: {
        departure: now,
      },
    });

    req.session.notification = "Success: User has left the lab!";
    res.redirect("/fabtrack");
  }),
);

// ******************************************************************************
// Route to delete a history entry
// ******************************************************************************

router.get(
  "/delete/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
      await prisma.history.delete({
        where: { id: Number(id) },
      });
      req.session.notification = "Success: History entry deleted.";
    } catch (error) {
      console.error("Error deleting history entry:", error);
      req.session.notification = "Error: Failed to delete history entry.";
    }

    res.redirect(req.session.lastPage || "/admin/view-history");
  }),
);

// ******************************************************************************
// Route to update a history entry
// ******************************************************************************

router.post(
  "/update",
  asyncHandler(async (req, res) => {
    const { historyid, arrival, departure, workspaceId, comments } = req.body;

    try {
      await prisma.history.update({
        where: { id: Number(historyid) },
        data: {
          arrival: arrival ? new Date(arrival) : undefined,
          departure: departure ? new Date(departure) : null,
          workspaceId: workspaceId ? Number(workspaceId) : null,
          comments: comments || null,
        },
      });

      req.session.notification = "Success: History entry updated.";
    } catch (error) {
      console.error("Error updating history entry:", error);
      req.session.notification = "Error: Failed to update history entry.";
    }

    res.redirect(req.session.lastPage || "/admin/view-history");
  }),
);

// ******************************************************************************
// Route to unarchive a project
// ******************************************************************************

router.get(
  "/project/unarchive/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    await prisma.project.update({
      where: { id: Number(id) },
      data: { active: true },
    });

    req.session.notification = "Success: Project unarchived!";
    res.redirect(req.session.lastPage || "/fabtrack");
  }),
);

// ******************************************************************************
// Route to archive a project
// ******************************************************************************

router.get(
  "/project/archive/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    await prisma.project.update({
      where: { id: Number(id) },
      data: { active: false },
    });

    req.session.notification = "Success: Project archived!";
    res.redirect(req.session.lastPage || "/fabtrack");
  }),
);

// ******************************************************************************
// Route to add an activity associated with a history entry (Machines / Equipment / Consumables)
// ******************************************************************************

router.post(
  "/activity",
  asyncHandler(async (req, res) => {
    const { activityhistoryid, activityuserid, machineId, equipmentId, consumable, quantity } = req.body;

    const histId = activityhistoryid && activityhistoryid !== "null" ? Number(activityhistoryid) : null;
    const usrId = activityuserid && activityuserid !== "null" ? Number(activityuserid) : null;

    let recordedCount = 0;

    // 1. Machine Usage
    if (machineId && machineId !== "" && machineId !== "null") {
      await prisma.activity.create({
        data: {
          historyId: histId,
          userId: usrId,
          resourceId: Number(machineId),
          resourceType: ResourceType.MACHINE,
        },
      });
      recordedCount++;
    }

    // 2. Equipment Borrow
    if (equipmentId && equipmentId !== "" && equipmentId !== "null") {
      await prisma.activity.create({
        data: {
          historyId: histId,
          userId: usrId,
          resourceId: Number(equipmentId),
          resourceType: ResourceType.EQUIPMENT,
        },
      });
      recordedCount++;
    }

    // 3. Consumable Usage
    if (consumable && consumable !== "" && consumable !== "null") {
      const qty = parseInt(quantity, 10) || 1;
      const consumed = await consumeItem(consumable, qty);

      if (consumed) {
        const totalPrice = Number(consumed.cost) * qty;

        // Decrement user balance if user is specified
        if (usrId) {
          await prisma.user.update({
            where: { id: usrId },
            data: { balance: { decrement: totalPrice } },
          });
        }

        await prisma.activity.create({
          data: {
            historyId: histId,
            userId: usrId,
            resourceId: Number(consumable),
            resourceType: ResourceType.CONSUMABLE,
            quantity: qty,
          },
        });
        recordedCount++;
      }
    }

    if (recordedCount > 0) {
      req.session.notification = "Success: Lab activity recorded successfully!";
    } else {
      req.session.notification = "Warning: No resource was selected for this activity.";
    }

    res.redirect(req.session.lastPage || "/fabtrack");
  }),
);

// ******************************************************************************
// Route to clear a user's debt
// ******************************************************************************

router.get(
  "/cleardebt/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    await prisma.user.update({
      where: { id: Number(id) },
      data: { balance: 0.0 },
    });

    req.session.notification = "Success: Debt paid!";
    res.redirect(req.session.lastPage || "/fabtrack");
  }),
);

// ******************************************************************************
// Route to credit a user's account
// ******************************************************************************

router.post(
  "/credit",
  asyncHandler(async (req, res) => {
    const { userid, money } = req.body;

    await prisma.user.update({
      where: { id: Number(userid) },
      data: { balance: { increment: Number(money) } },
    });

    req.session.notification = "Success: Account credited!";
    res.redirect(req.session.lastPage || "/fabtrack");
  }),
);

module.exports = router;
