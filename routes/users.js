const express = require("express");
const moment = require("moment");
const { PrismaClient } = require("@prisma/client");
const logger = require("../utilities/simpleLogger.js");
const { v4: uuidv4 } = require("uuid");
const nodemailer = require("nodemailer");

const asyncHandler = require("../middleware/asyncHandler.js");
const clearNotification = require("../middleware/clearNotification.js");
const isLoggedIn = require("../middleware/checkSession.js");
const isAdmin = require("../middleware/checkAdmin.js");
const dateService = require("../services/dateService.js");
const { isNull } = require("util");

const prisma = new PrismaClient();
const router = express.Router();

router.use(isLoggedIn); // Ensure user is logged in

// Nodemailer config
const transporter = nodemailer.createTransport({
  host: process.env.HOST,
  port: Number(process.env.PORT),
  auth: {
    user: process.env.USR,
    pass: process.env.PASSWD,
  },
});

// Helper Functions
function formatDateTime(date) {
  return dateService.formatDateTime(date);
}

function removeDuplicates(array) {
  return Array.from(new Set(array.map(JSON.stringify))).map(JSON.parse);
}

// ******************************************************************************
// Route to manage ALL user accounts (Admin Only)
// ******************************************************************************

router.get(
  "/manage",
  isAdmin, // Ensure user has admin role
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/users/manage";

    const users = await prisma.user.findMany({
      orderBy: { id: "desc" },
      include: { usertype: true },
    });

    res.render("admin/manage-users", { users });
  }),
);

// ******************************************************************************
// Route creating a new user
// ******************************************************************************

router.post(
  "/create",
  clearNotification,
  asyncHandler(async (req, res) => {
    if (req.session.role === "staff") {
      req.session.notification = "Warning: L'enregistrement d'un nouvel utilisateur doit être fait par un médiateur.";
      return res.redirect("/fabtrack");
    }

    const { newname, newsurname, newemail, newusertype, newbirthyear, newcomments, newrfid, newnewsletter } = req.body;
    const cleanRfid = newrfid && newrfid.trim() ? newrfid.trim() : null;

    const token = uuidv4();

    try {
      const user = await prisma.user.create({
        data: {
          name: newname,
          surname: newsurname,
          email: newemail,
          usertypeId: Number(newusertype),
          birthYear: Number(newbirthyear),
          comment: newcomments,
          token: token,
          rfid: cleanRfid,
          newsletter: newnewsletter === "true" || newnewsletter === "on" || newnewsletter === true,
        },
      });

      logger.logThat(`User ${user.name} ${user.surname} created by ${req.session.username}`);

      // Send notification email to user
      const notif = await transporter.sendMail({
        from: process.env.MAILFROM,
        to: process.env.ADMIN,
        subject: "Fablab registration: please agree to our terms and conditions",
        text: `<a href="${process.env.HOSTURL}/agreement/${token}">I agree to the terms and conditions!</a>`,
      });

      // DEBUG: Etherreal link to email
      console.log("Preview URL: %s", nodemailer.getTestMessageUrl(notif));

      req.session.notification = "Warning: User needs to agree to the terms and conditions before accessing the lab.";

      res.redirect("/users/manage");
    } catch (e) {
      console.error("Error creating user:", e);
      let errorMsg = "Error: Unable to create user. Please try again.";
      if (e.code === "P2002") {
        if (e.meta && e.meta.target && e.meta.target.includes("rfid")) {
          errorMsg = "Error: Ce badge RFID est déjà associé à un autre utilisateur.";
        } else {
          errorMsg = "Error: Un utilisateur avec cet email existe déjà.";
        }
      }
      req.session.notification = errorMsg;
      res.redirect(req.session.lastPage || "/users/manage");
    }
  }),
);

// ******************************************************************************
// Route to delete a user (Admin Only)
// ******************************************************************************

router.get(
  "/delete/:id",
  isAdmin,
  clearNotification,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await prisma.user.delete({
      where: { id: Number(id) },
    });

    logger.logThat(`User ${user.name} ${user.surname} deleted by ${req.session.username}`);

    req.session.notification = `Success: User ${user.name} ${user.surname} has been deleted.`;
    res.redirect(req.session.lastPage);
  }),
);

// ******************************************************************************
// Route to edit a user profile
// ******************************************************************************

router.get(
  "/edit/:id",
  clearNotification,
  asyncHandler(async (req, res) => {
    if (req.session.role === "staff") {
      req.session.notification = "Warning: La consultation du profil d'un usager est réservée aux médiateurs.";
      return res.redirect("/fabtrack");
    }

    const { id } = req.params;
    req.session.lastPage = `/users/edit/${id}`;

    const user = await prisma.user.findUnique({
      where: { id: Number(id) },
      include: {
        projects: {
          include: {
            project: {
              include: { projecttype: true },
            },
          },
        },
        usertype: true,
        workshopInterests: {
          include: {
            workshop: {
              include: { access: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        workshopCompletions: {
          include: {
            workshop: {
              include: { access: true },
            },
          },
          orderBy: { awardedAt: "desc" },
        },
      },
    });

    const history = await prisma.history.findMany({
      where: { userId: Number(id) },
      include: {
        workspace: true,
        userproject: {
          include: {
            project: {
              include: { projecttype: true },
            },
          },
        },
      },
      orderBy: { arrival: "desc" },
    });

    const warnings = await prisma.warning.findMany({
      where: { userId: Number(id) },
      include: { warningtype: true },
    });

    // Format dates
    user.accountCreationDate = formatDateTime(user.createdAt);
    user.createdAt = formatDateTime(user.createdAt);
    history.forEach((entry) => {
      entry.arrival = formatDateTime(entry.arrival);
      entry.departure = entry.departure ? formatDateTime(entry.departure) : "-";
    });
    warnings.forEach((warning) => {
      warning.createdAt = formatDateTime(warning.createdAt);
    });

    // Gather all unique projects for this user (both directly assigned and from history)
    const directProjects = (user.projects || []).map((up) => up.project).filter(Boolean);
    const historyProjects = history
      .filter((entry) => entry.userproject && entry.userproject.project)
      .map((entry) => entry.userproject.project);

    const userprojects = removeDuplicates([...directProjects, ...historyProjects]);
    const projecttypes = await prisma.projecttype.findMany({ orderBy: { id: "asc" } });

    // 1. Fetch Machine Usage History for this user
    const machineActivities = await prisma.activity.findMany({
      where: {
        userId: Number(id),
        resourceType: "MACHINE",
      },
      include: {
        history: {
          include: {
            workspace: true,
            userproject: { include: { project: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const allMachines = await prisma.machine.findMany({
      include: { machinetype: true, category: true, location: true },
    });
    const machineMap = new Map(allMachines.map((m) => [m.id, m]));

    const userMachineUsage = machineActivities.map((act) => ({
      id: act.id,
      createdAt: act.createdAt,
      formattedDate: formatDateTime(act.createdAt),
      machine: machineMap.get(act.resourceId) || null,
      workspace: act.history && act.history.workspace ? act.history.workspace.name : "-",
      project: act.history && act.history.userproject && act.history.userproject.project ? act.history.userproject.project : null,
      comments: act.history ? act.history.comments : null,
    }));

    // 2. Fetch Consumable Usage (Consumption) History for this user
    const consumableActivities = await prisma.activity.findMany({
      where: {
        userId: Number(id),
        resourceType: "CONSUMABLE",
      },
      include: {
        history: {
          include: {
            workspace: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const allConsumables = await prisma.consumable.findMany({
      include: { category: true },
    });
    const consumableMap = new Map(allConsumables.map((c) => [c.id, c]));

    const userConsumptions = consumableActivities.map((act) => {
      const consumable = consumableMap.get(act.resourceId);
      const unitCost = consumable ? Number(consumable.cost) : 0;
      const qty = act.quantity || 1;
      return {
        id: act.id,
        createdAt: act.createdAt,
        formattedDate: formatDateTime(act.createdAt),
        consumable: consumable || null,
        unit: consumable && consumable.unit ? consumable.unit : "u",
        quantity: qty,
        unitCost: unitCost,
        totalCost: (unitCost * qty).toFixed(2),
        workspace: act.history && act.history.workspace ? act.history.workspace.name : "-",
      };
    });

    // 3. Compute enhanced user statistics
    const totalConsumablesCount = userConsumptions.reduce((sum, c) => sum + c.quantity, 0);
    const totalConsumablesCost = userConsumptions.reduce((sum, c) => sum + Number(c.totalCost), 0).toFixed(2);
    const uniqueMachinesCount = new Set(userMachineUsage.map((u) => (u.machine ? u.machine.id : null)).filter(Boolean)).size;
    const activeProjectsCount = userprojects.filter((p) => p.active !== false).length;

    // 4. Workshop and badges calculations
    const availableWorkshops = await prisma.workshop.findMany({
      where: { active: true },
      include: { access: true },
      orderBy: { name: "asc" },
    });

    user.workshopInterests.forEach((wi) => {
      wi.formattedDate = formatDateTime(wi.createdAt);
    });
    user.workshopCompletions.forEach((wc) => {
      wc.formattedDate = formatDateTime(wc.awardedAt);
    });

    const habilitations = [];
    const seenAccess = new Set();
    user.workshopCompletions.forEach((wc) => {
      if (wc.workshop && wc.workshop.access && !seenAccess.has(wc.workshop.access.id)) {
        seenAccess.add(wc.workshop.access.id);
        habilitations.push(wc.workshop.access);
      }
    });

    const userStats = {
      balance: Number(user.balance || 0).toFixed(2),
      balancePositive: Number(user.balance || 0) >= 0,
      totalVisits: history.length,
      lastVisit: history.length > 0 ? history[0].arrival : "Never",
      totalProjects: userprojects.length,
      activeProjects: activeProjectsCount,
      totalMachineSessions: userMachineUsage.length,
      uniqueMachinesCount: uniqueMachinesCount,
      totalConsumablesCount: totalConsumablesCount,
      totalConsumablesCost: totalConsumablesCost,
      badgesCount: (user.isExpert ? 1 : 0) + user.workshopCompletions.length,
      workshopBadgesCount: user.workshopCompletions.length,
      habilitationsCount: habilitations.length,
      habilitations: habilitations,
      isExpert: !!user.isExpert,
    };

    // 5. Compute user interests from categories of machines and consumables used
    const interestSet = new Set();
    userMachineUsage.forEach((u) => {
      if (u.machine && u.machine.category) interestSet.add(u.machine.category.name);
    });
    userConsumptions.forEach((c) => {
      if (c.consumable && c.consumable.category) interestSet.add(c.consumable.category.name);
    });
    const userInterests = Array.from(interestSet);

    res.render("fabtrack/edit-user", {
      user,
      history,
      warnings,
      userprojects,
      projecttypes,
      userMachineUsage,
      userConsumptions,
      userStats,
      userInterests,
      availableWorkshops,
    });
  }),
);

// ******************************************************************************
// Route to update a user in the database
// ******************************************************************************

router.post(
  "/update/:id",
  clearNotification,
  asyncHandler(async (req, res) => {
    if (req.session.role === "staff") {
      req.session.notification = "Warning: La modification d'un profil est réservée aux médiateurs.";
      return res.redirect("/fabtrack");
    }

    const { id } = req.params;
    const { name, surname, email, usertype, birthyear, comments, isExpert, rfid, newsletter } = req.body;
    const cleanRfid = rfid && rfid.trim() ? rfid.trim() : null;

    try {
      await prisma.user.update({
        where: { id: Number(id) },
        data: {
          name,
          surname,
          email,
          usertypeId: Number(usertype),
          birthYear: Number(birthyear),
          comment: comments,
          isExpert: isExpert === "true" || isExpert === "on" || isExpert === true,
          rfid: cleanRfid,
          newsletter: newsletter === "true" || newsletter === "on" || newsletter === true,
        },
      });

      logger.logThat(`User ${name} ${surname} updated by ${req.session.username}`);
      req.session.notification = "Success: User profile updated!";
    } catch (e) {
      console.error("Error updating user:", e);
      if (e.code === "P2002") {
        req.session.notification = "Error: Ce badge RFID ou cet email est déjà utilisé par un autre utilisateur.";
      } else {
        req.session.notification = "Error: Impossible de mettre à jour le profil.";
      }
    }

    res.redirect(req.session.lastPage || "/users/manage");
  }),
);

// ******************************************************************************
// Workshop Interests & Badges actions for User
// ******************************************************************************

router.post(
  "/:id/workshop-interest/add",
  clearNotification,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { workshopId } = req.body;

    try {
      await prisma.userWorkshopInterest.upsert({
        where: {
          userId_workshopId: {
            userId: Number(id),
            workshopId: Number(workshopId),
          },
        },
        create: {
          userId: Number(id),
          workshopId: Number(workshopId),
        },
        update: {},
      });

      req.session.notification = "Success: Intérêt pour l'atelier enregistré.";
    } catch (error) {
      console.error("Error adding workshop interest:", error);
      req.session.notification = "Error: Impossible d'enregistrer l'intérêt.";
    }

    res.redirect(`/users/edit/${id}#collapseInterests`);
  }),
);

router.get(
  "/:id/workshop-interest/remove/:workshopId",
  clearNotification,
  asyncHandler(async (req, res) => {
    const { id, workshopId } = req.params;

    try {
      await prisma.userWorkshopInterest.deleteMany({
        where: {
          userId: Number(id),
          workshopId: Number(workshopId),
        },
      });

      req.session.notification = "Success: Intérêt retiré.";
    } catch (error) {
      console.error("Error removing workshop interest:", error);
      req.session.notification = "Error: Impossible de retirer l'intérêt.";
    }

    res.redirect(`/users/edit/${id}#collapseInterests`);
  }),
);

router.post(
  "/:id/workshop-badge/award",
  clearNotification,
  asyncHandler(async (req, res) => {
    if (req.session.role !== "admin" && req.session.role !== "mediateur") {
      req.session.notification = "Error: Seuls les administrateurs et médiateurs peuvent attribuer une habilitation.";
      return res.redirect(`/users/edit/${req.params.id}`);
    }

    const { id } = req.params;
    const { workshopId, removeInterest, awardedAt, awardedBy } = req.body;
    const uId = Number(id);
    const wId = Number(workshopId);

    if (!wId || isNaN(wId)) {
      req.session.notification = "Error: Atelier ou habilitation non valide.";
      return res.redirect(`/users/edit/${id}#collapseInterests`);
    }

    let completionDate = new Date();
    if (awardedAt) {
      const parsedDate = new Date(awardedAt);
      if (!isNaN(parsedDate.getTime())) {
        completionDate = parsedDate;
      }
    }

    const whoAwarded = (awardedBy && awardedBy.trim()) ? awardedBy.trim() : (req.session.username || "Admin");

    try {
      await prisma.userWorkshopCompletion.upsert({
        where: {
          userId_workshopId: {
            userId: uId,
            workshopId: wId,
          },
        },
        create: {
          userId: uId,
          workshopId: wId,
          awardedAt: completionDate,
          awardedBy: whoAwarded,
        },
        update: {
          awardedAt: completionDate,
          awardedBy: whoAwarded,
        },
      });

      if (removeInterest === "true" || removeInterest === true || removeInterest === "on") {
        await prisma.userWorkshopInterest.deleteMany({
          where: {
            userId: uId,
            workshopId: wId,
          },
        });
      }

      req.session.notification = "Success: Atelier validé et habilitation attribuée avec succès !";
    } catch (error) {
      console.error("Error awarding workshop badge:", error);
      req.session.notification = "Error: Impossible d'attribuer l'habilitation.";
    }

    res.redirect(`/users/edit/${id}#collapseInterests`);
  }),
);

router.get(
  "/:id/workshop-badge/revoke/:workshopId",
  clearNotification,
  asyncHandler(async (req, res) => {
    if (req.session.role !== "admin" && req.session.role !== "mediateur") {
      req.session.notification = "Error: Seuls les administrateurs et médiateurs peuvent révoquer une habilitation.";
      return res.redirect(`/users/edit/${req.params.id}`);
    }

    const { id, workshopId } = req.params;

    try {
      await prisma.userWorkshopCompletion.deleteMany({
        where: {
          userId: Number(id),
          workshopId: Number(workshopId),
        },
      });

      req.session.notification = "Success: Habilitation / Badge d'atelier retiré.";
    } catch (error) {
      console.error("Error revoking workshop badge:", error);
      req.session.notification = "Error: Impossible de retirer l'habilitation.";
    }

    res.redirect(`/users/edit/${id}#collapseInterests`);
  }),
);

// ******************************************************************************
// Route to send a new email to the user (for the agreement of the terms)
// ******************************************************************************

router.get(
  "/resend/:id",
  clearNotification,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: Number(id) },
    });

    // Send notification email to admin
    const notif = await transporter.sendMail({
      from: process.env.MAILFROM,
      to: process.env.ADMIN,
      subject: "Fablab registration: please agree to our terms and conditions",
      html: `<a href="${process.env.HOSTURL}/agreement/${user.token}">I agree to the terms and conditions!</a>`,
    });

    // DEBUG: Etherreal link to email
    console.log("Preview URL: %s", nodemailer.getTestMessageUrl(notif));
    console.log("Last page is: %s", req.session.lastPage);

    req.session.notification = `Success: User ${user.name} ${user.surname} has been notified.`;
    res.redirect(req.session.lastPage);
  }),
);

module.exports = router;
