const express = require("express");
const router = express.Router();

const asyncHandler = require("../../middleware/asyncHandler.js");
const clearNotification = require("../../middleware/clearNotification.js");
const isAdmin = require("../../middleware/checkAdmin.js");
const { isApiOrAjaxRequest } = require("../../middleware/requireRoles.js");
const { validateBody } = require("../../middleware/validate.js");
const { updateStaffSchema } = require("../../schemas/staff.schema.js");
const staffAdminService = require("../../services/staffAdminService.js");
const { prisma } = require("../../utilities/db.js");

router.use(isAdmin);

function buildActor(req) {
  return {
    staffId: req.session.staffId,
    username: req.session.username,
  };
}

function buildHostUrl(req, res) {
  return `${req.protocol}://${req.get("host")}${res.locals.basePath || ""}`;
}

function sendStaffResult(req, res, result, fallbackUrl = "/admin/staff/manage") {
  if (isApiOrAjaxRequest(req)) {
    if (result.success) {
      return res.status(200).json(result);
    }
    const status =
      result.code === "STAFF_NOT_FOUND"
        ? 404
        : result.code === "SELF_ACTION_FORBIDDEN" || result.code === "LAST_ADMIN_PROTECTED"
          ? 403
          : 400;
    return res.status(status).json(result);
  }

  req.session.notification = result.success ? result.message : `Error: ${result.message}`;
  return res.redirect(req.session.lastPage || fallbackUrl);
}

// ******************************************************************************
// Route redirecting /admin/staff to /admin/staff/manage
// ******************************************************************************

router.get("/", (req, res) => {
  res.redirect("/admin/staff/manage");
});

// ******************************************************************************
// Route to manage staff accounts (Admin Only)
// ******************************************************************************

router.get(
  "/manage",
  clearNotification,
  asyncHandler(async (req, res) => {
    req.session.lastPage = "/admin/staff/manage";

    const staff = await prisma.staff.findMany({
      orderBy: {
        id: "desc",
      },
    });

    res.render("admin/manage-staff", {
      users: staff,
    });
  }),
);

// ******************************************************************************
// Route to edit a staff account (Admin Only)
// ******************************************************************************

router.get(
  "/edit/:id",
  clearNotification,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await prisma.staff.findUnique({
      where: {
        id: Number(id),
      },
    });

    if (!user) {
      req.session.notification = "Error: Compte staff introuvable.";
      return res.redirect("/admin/staff/manage");
    }

    res.render("admin/edit-staff", {
      user,
    });
  }),
);

// ******************************************************************************
// Route to enable a staff account (Admin Only)
// ******************************************************************************

router.post(
  "/enable/:id",
  asyncHandler(async (req, res) => {
    const result = await staffAdminService.enableStaff({
      targetId: req.params.id,
      actor: buildActor(req),
      hostUrl: buildHostUrl(req, res),
    });
    return sendStaffResult(req, res, result);
  }),
);

// ******************************************************************************
// Route to disable a staff account (Admin Only)
// ******************************************************************************

router.post(
  "/disable/:id",
  asyncHandler(async (req, res) => {
    const result = await staffAdminService.disableStaff({
      targetId: req.params.id,
      actor: buildActor(req),
    });
    return sendStaffResult(req, res, result);
  }),
);

// ******************************************************************************
// Route making a staff admin (Admin Only)
// ******************************************************************************

router.post(
  "/promote/:id",
  asyncHandler(async (req, res) => {
    const result = await staffAdminService.promoteStaff({
      targetId: req.params.id,
      actor: buildActor(req),
    });
    return sendStaffResult(req, res, result);
  }),
);

// ******************************************************************************
// Route making a staff a regular user (Admin Only)
// ******************************************************************************

router.post(
  "/demote/:id",
  asyncHandler(async (req, res) => {
    const result = await staffAdminService.demoteStaff({
      targetId: req.params.id,
      actor: buildActor(req),
    });
    return sendStaffResult(req, res, result);
  }),
);

// ******************************************************************************
// Route to delete a staff (Admin Only)
// ******************************************************************************

router.post(
  "/delete/:id",
  asyncHandler(async (req, res) => {
    const result = await staffAdminService.deleteStaff({
      targetId: req.params.id,
      actor: buildActor(req),
    });
    return sendStaffResult(req, res, result);
  }),
);

// ******************************************************************************
// Route to update a staff account (Admin Only)
// ******************************************************************************

router.post(
  "/update",
  validateBody(updateStaffSchema, { redirectUrl: "/admin/staff/manage" }),
  asyncHandler(async (req, res) => {
    const result = await staffAdminService.updateStaff({
      data: req.validatedBody || req.body,
      actor: buildActor(req),
      hostUrl: buildHostUrl(req, res),
    });
    return sendStaffResult(req, res, result, "/admin/staff/manage");
  }),
);

module.exports = router;
