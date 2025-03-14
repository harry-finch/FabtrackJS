var express = require("express");
var router = express.Router();

const asyncHandler = require("../middleware/asyncHandler.js");
const isLoggedIn = require("../middleware/checkSession.js");
router.use(isLoggedIn);

const { PrismaClient, ResourceType } = require("@prisma/client");
const prisma = new PrismaClient();

// ******************************************************************************
// Route to create a history entry (arrival)
// ******************************************************************************

router.post(
  "/create",
  asyncHandler(async (req, res) => {
    var { userid, projecttype, projectid, userprojectid, documentation, comments } = req.body;

    // Checking if the user is already here to avoid conflicts
    const alreadyHere = await prisma.history.findMany({
      where: {
        userId: Number(userid),
        departure: null,
      },
    });

    if (alreadyHere.length == 0) {
      if (projectid == "null") {
        // if project does not exist in the db, create the project
        const project = await prisma.project.create({
          data: {
            url: documentation,
            projecttypeId: Number(projecttype),
          },
        });
        projectid = project.id;
      }

      // at this point the project already exists, but we have to check if the project is already associated with user
      // and if not, create the combination
      if (userprojectid == "null") {
        const userproject = await prisma.userProject.create({
          data: {
            userId: Number(userid),
            projectId: Number(projectid),
          },
        });

        userprojectid = userproject.id;
      }

      // now we have all the information we need to create the history entry
      const history = await prisma.history.create({
        data: {
          userId: Number(userid),
          userprojectId: Number(userprojectid),
          comments: comments,
          workspaceId: req.session.selectedWorkspace ? req.session.selectedWorkspace.id : null,
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
    const now = new Date().toISOString();

    const history = await prisma.history.update({
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
// Route to unarchive a project
// ******************************************************************************

router.get(
  "/project/unarchive/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const project = await prisma.project.update({
      where: { id: Number(id) },
      data: { active: true },
    });

    req.session.notification = "Success: Project unarchived!";
    res.redirect(req.session.lastPage);
  }),
);

// ******************************************************************************
// Route to archive a project
// ******************************************************************************

router.get(
  "/project/archive/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const project = await prisma.project.update({
      where: { id: Number(id) },
      data: { active: false },
    });

    req.session.notification = "Success: Project archived!";
    res.redirect(req.session.lastPage);
  }),
);

// ******************************************************************************
// Route to add an activity associated with a history entry
// ******************************************************************************

router.post(
  "/activity",
  asyncHandler(async (req, res) => {
    const historyid = req.body.activityhistoryid;
    const userid = req.body.activityuserid;
    const consumableid = req.body.consumable;
    const quantity = req.body.quantity;

    const consumable = await prisma.consumable.findUnique({
      where: { id: Number(consumableid) },
    });
    const totalPrice = Number(consumable.cost) * Number(quantity);

    const user = await prisma.user.update({
      where: { id: Number(userid) },
      data: { balance: { decrement: totalPrice } },
    });

    // *** TODO: add equipment and machine support ***
    const activity = await prisma.activity.create({
      data: {
        resourceId: Number(consumableid),
        resourceType: ResourceType.CONSUMABLE,
        quantity: Number(quantity),
      },
    });

    req.session.notification = "Success: Activity added to user account!";
    res.redirect(req.session.lastPage);
  }),
);

// ******************************************************************************
// Route to clear a user's debt
// ******************************************************************************

router.get(
  "/cleardebt/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await prisma.user.update({
      where: { id: Number(id) },
      data: { balance: 0.0 },
    });

    req.session.notification = "Success: Debt paid!";
    res.redirect(req.session.lastPage);
  }),
);

// ******************************************************************************
// Route to credit a user's account
// ******************************************************************************

router.post(
  "/credit",
  asyncHandler(async (req, res) => {
    const { userid, money } = req.body;

    const user = await prisma.user.update({
      where: { id: Number(userid) },
      data: { balance: { increment: Number(money) } },
    });

    req.session.notification = "Success: Account credited!";
    res.redirect(req.session.lastPage);
  }),
);

module.exports = router;
