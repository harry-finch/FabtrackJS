// ******************************************************************************
// This router handles the history routes
// ******************************************************************************

var express = require("express");
var router = express.Router();

const isLoggedIn = require("../middleware/checkSession.js");
router.use(isLoggedIn);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ******************************************************************************
// Route handling the creation of a history entry
// ******************************************************************************

router.post("/create", async (req, res) => {
  var {
    userid,
    projecttype,
    projectid,
    userprojectid,
    documentation,
    comments,
  } = req.body;

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
      const userproject = await prisma.userproject.create({
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
        workspaceId: req.session.selectedWorkspace
          ? req.session.selectedWorkspace.id
          : null,
      },
    });

    req.session.notification = "Success: User is now in the lab!";
  } else {
    req.session.notification = "Error: User is already in the lab!";
  }
  res.redirect("/fabtrack");
});

router.get("/exit/:id", async (req, res) => {
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
});

router.get("/project/unarchive/:id", async (req, res) => {
  const { id } = req.params;

  const project = await prisma.project.update({
    where: { id: Number(id) },
    data: { active: true },
  });

  req.session.notification = "Success: Project unarchived!";
  res.redirect(req.session.lastPage);
});

router.get("/project/archive/:id", async (req, res) => {
  const { id } = req.params;

  const project = await prisma.project.update({
    where: { id: Number(id) },
    data: { active: false },
  });

  req.session.notification = "Success: Project archived!";
  res.redirect(req.session.lastPage);
});

router.post("/activity", async (req, res) => {
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

  const activity = await prisma.activity.create({
    data: {
      historyId: Number(historyid),
      consumableId: Number(consumableid),
      quantity: Number(quantity),
    },
  });

  req.session.notification = "Success: Activity added to user account!";
  res.redirect(req.session.lastPage);
});

router.get("/cleardebt/:id", async (req, res) => {
  const { id } = req.params;

  const user = await prisma.user.update({
    where: { id: Number(id) },
    data: { balance: 0.0 },
  });

  req.session.notification = "Success: Debt paid!";
  res.redirect(req.session.lastPage);
});

router.post("/credit", async (req, res) => {
  const { userid, money } = req.body;

  const user = await prisma.user.update({
    where: { id: Number(userid) },
    data: { balance: { increment: Number(money) } },
  });

  req.session.notification = "Success: Account credited!";
  res.redirect(req.session.lastPage);
});

module.exports = router;
