// ******************************************************************************
// This router handles the front end routes
// ******************************************************************************

var express = require("express");
var router = express.Router();

const isLoggedIn = require("../middleware/checkSession.js");
router.use(isLoggedIn);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ******************************************************************************
// Route handling the main admin page
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

  if (projectid == "null") {
    // if project does not exist in the db, create the project

    const project = await prisma.project.create({
      data: {
        url: documentation,
        projecttypeId: Number(projecttype),
      },
    });
    projectid = project.id;
  } else {
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
  }

  // now we have all the information we need to create the history entry
  const history = await prisma.history.create({
    data: {
      userId: Number(userid),
      userprojectId: Number(userprojectid),
      comments: comments,
    },
  });

  req.session.notification = "Success: User is now in the lab!";
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

module.exports = router;
