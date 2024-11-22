var express = require("express");
var router = express.Router();

const asyncHandler = require("../../middleware/asyncHandler.js");
const clearNotification = require("../../middleware/clearNotification.js");
const isAdmin = require("../../middleware/checkAdmin.js");
router.use(isAdmin);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const logger = require("../../utilities/simpleLogger.js");

// Define multer config for file uploads
const multer = require("multer");
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Save files to the "uploads/" folder
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname); // Create unique file names
  },
});

const upload = multer({ storage: storage });

// ******************************************************************************
// Route to manage machine types (3D printer, laser cutter...)
// ******************************************************************************

router.get(
  "/manage-types",
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/machines/manage-types";

    const machinetypes = await prisma.machineType.findMany({});

    res.render("admin/manage-machinetypes", {
      machinetypes,
    });
  }),
);

// ******************************************************************************
// Route to delete a machine type
// ******************************************************************************

router.get(
  "/delete-type/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await prisma.machineType.delete({
      where: { id: Number(id) },
    });

    logger.logThat("Machine type " + result.name + " deleted by " + req.session.username);

    req.session.notification = "Success: Machine type " + result.name + " deleted";
    res.redirect(req.session.lastPage);
  }),
);

// ******************************************************************************
// Route to create a machine type
// ******************************************************************************

router.post(
  "/create-type",
  asyncHandler(async (req, res) => {
    const { name } = req.body;

    const machinetype = await prisma.machineType.create({
      data: { name: name },
    });

    logger.logThat("Machine type " + name + " created by " + req.session.username);

    req.session.notification = "Success: Machine type " + name + " created";
    res.redirect("/admin/machines/manage-types");
  }),
);

// ******************************************************************************
// Route to update a machine type
// ******************************************************************************

router.post(
  "/update-type",
  asyncHandler(async (req, res) => {
    const { machinetypeid, name } = req.body;

    const access = await prisma.machinetype.update({
      where: { id: Number(machinetypeid) },
      data: { name: name },
    });

    logger.logThat("Machine type " + name + " update by " + req.session.username);
    req.session.notification = "Success: Machine type " + name + " updated";
    res.redirect("/admin/machines/manage-types");
  }),
);

// ******************************************************************************
// Route to manage machines
// ******************************************************************************

router.get(
  "/manage",
  clearNotification,
  asyncHandler(async (req, res) => {
    const machines = await prisma.machine.findMany({
      include: {
        machinetype: true,
        location: true,
        access: true,
      },
    });

    req.session.lastPage = "/admin/machines/manage";
    res.render("admin/manage-machines", { machines });
  }),
);

// ******************************************************************************
// Route to create a machine
// ******************************************************************************

router.post(
  "/create",
  upload.single("machinePicture"),
  asyncHandler(async (req, res) => {
    const {
      name,
      machinetypeId,
      make,
      model,
      serialNumber,
      internalReference,
      locationId,
      purchaseDate,
      lastMaintenance,
      warrantyExpiry,
      picture,
      documentation,
      accessId,
    } = req.body;

    let picturePath = null;
    if (req.file) {
      picturePath = req.file.path; // Get the path to the uploaded file
    }

    try {
      const newMachine = await prisma.machine.create({
        data: {
          name,
          machinetypeId,
          make,
          model,
          serialNumber,
          internalReference: internalReference || null,
          locationId: locationId || null,
          purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
          lastMaintenance: lastMaintenance ? new Date(lastMaintenance) : null,
          warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
          picture: picture || null,
          documentation: documentation || null,
          accessId,
        },
      });

      logger.logThat("Machine " + machine.name + " created by " + req.session.username);
      req.session.notification = "Success: Machine " + machine.name + " created";

      res.redirect("/admin/machines/manage");
    } catch (error) {
      console.error("Error creating machine:", error);
      req.session.notification = "Error: Failed to create machine. Please check the input values and try again.";
      res.redirect("/admin/machines/manage");
    }
  }),
);

module.exports = router;
