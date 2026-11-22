const express = require("express");

const asyncHandler = require("../middleware/asyncHandler.js");
const clearNotification = require("../middleware/clearNotification.js");
const isAdmin = require("../middleware/checkAdmin.js");
const { invalidateCache } = require("../middleware/cacheHelper.js");
const { validateBody, validateParams } = require("../middleware/validate.js");
const { idParamSchema } = require("../schemas/index.js");
const { prisma } = require("./db.js");
const logger = require("./simpleLogger.js");

/**
 * Builds the default Prisma create/update payload from req.body and extraFields.
 * @param {Object} body
 * @param {string[]} extraFields
 * @returns {Object}
 */
function buildDefaultPayload(body, extraFields) {
  const data = {
    name: typeof body.name === "string" ? body.name.trim() : body.name,
  };

  for (const field of extraFields) {
    const val = body[field];
    data[field] = typeof val === "string" && val.trim() ? val.trim() : null;
  }

  return data;
}

/**
 * Creates a standardized admin CRUD Express router for simple reference tables.
 * Handles GET ["/", "/manage"], POST /delete/:id, POST /create, POST /update
 * with isAdmin guard, clearNotification, Zod validation, cache invalidation,
 * session.lastPage tracking, and audit logging.
 *
 * @param {Object} config
 * @param {string} config.modelName - Prisma delegate name (e.g. "access", "location")
 * @param {string} config.idField - Request body field name holding the record ID on update (e.g. "accessid")
 * @param {string} config.basePath - Mount prefix (e.g. "/admin/accesslevels")
 * @param {string} config.viewName - EJS view name (e.g. "admin/manage-access")
 * @param {string} config.listKey - Template variable name for the list (e.g. "access")
 * @param {string} config.resourceLabel - Human-readable label for flash messages & logs
 * @param {Object} config.createSchema - Zod schema for POST /create
 * @param {Object} config.updateSchema - Zod schema for POST /update
 * @param {string[]} [config.extraFields=[]] - Additional nullable trimmed string fields
 * @param {Object} [config.orderBy={ id: "asc" }] - Prisma orderBy clause for listing
 * @param {Function} [config.sanitizeCreateData] - Optional custom payload builder for create
 * @param {Function} [config.sanitizeUpdateData] - Optional custom payload builder for update
 * @param {string} [config.logLabel] - Optional override for audit log prefix
 * @param {Object} [config.messages] - Optional flash message overrides
 * @returns {import("express").Router}
 */
function createReferenceCrudRouter({
  modelName,
  idField,
  basePath,
  viewName,
  listKey,
  resourceLabel,
  createSchema,
  updateSchema,
  extraFields = [],
  orderBy = { id: "asc" },
  sanitizeCreateData,
  sanitizeUpdateData,
  logLabel,
  messages = {},
}) {
  if (!modelName || !idField || !basePath || !viewName || !listKey || !resourceLabel) {
    throw new Error("createReferenceCrudRouter: missing required configuration options");
  }

  const router = express.Router();
  router.use(isAdmin);

  const normalizedBase = basePath.replace(/\/+$/, "");
  const managePath = `${normalizedBase}/manage`;
  const effectiveLogLabel = logLabel || resourceLabel;
  const lowerLabel = resourceLabel.toLowerCase();

  const msg = {
    deleteSuccess: (name) => `Success: ${resourceLabel} ${name} deleted`,
    deleteError: `Error: Failed to delete ${lowerLabel}`,
    createSuccess: (name) => `Success: ${resourceLabel} ${name} created`,
    createError: `Error: Failed to create ${lowerLabel}`,
    updateSuccess: (name) => `Success: ${resourceLabel} ${name} updated`,
    updateError: `Error: Failed to update ${lowerLabel}`,
    ...messages,
  };

  // GET / and /manage
  router.get(
    ["/", "/manage"],
    clearNotification,
    asyncHandler(async (req, res) => {
      req.session.lastPage = managePath;

      const items = await prisma[modelName].findMany({
        orderBy,
      });

      res.render(viewName, {
        [listKey]: items,
      });
    }),
  );

  // POST /delete/:id
  router.post(
    "/delete/:id",
    validateParams(idParamSchema, { redirectUrl: (req) => req.session.lastPage || managePath }),
    asyncHandler(async (req, res) => {
      const { id } = req.params;

      try {
        const result = await prisma[modelName].delete({
          where: { id: Number(id) },
        });

        invalidateCache(req);
        logger.logThat(`${effectiveLogLabel} ${result.name} deleted by ${req.session.username}`);
        req.session.notification = msg.deleteSuccess(result.name);
      } catch (error) {
        console.error(`Error deleting ${lowerLabel}:`, error);
        req.session.notification = msg.deleteError;
      }

      res.redirect(req.session.lastPage || managePath);
    }),
  );

  // POST /create
  router.post(
    "/create",
    validateBody(createSchema, { redirectUrl: managePath }),
    asyncHandler(async (req, res) => {
      const data =
        typeof sanitizeCreateData === "function"
          ? sanitizeCreateData(req.body)
          : buildDefaultPayload(req.body, extraFields);

      try {
        await prisma[modelName].create({ data });

        invalidateCache(req);
        logger.logThat(`${effectiveLogLabel} ${req.body.name} created by ${req.session.username}`);
        req.session.notification = msg.createSuccess(req.body.name);
      } catch (error) {
        console.error(`Error creating ${lowerLabel}:`, error);
        req.session.notification = msg.createError;
      }

      res.redirect(managePath);
    }),
  );

  // POST /update
  router.post(
    "/update",
    validateBody(updateSchema, { redirectUrl: managePath }),
    asyncHandler(async (req, res) => {
      const targetId = Number(req.body[idField]);
      const data =
        typeof sanitizeUpdateData === "function"
          ? sanitizeUpdateData(req.body)
          : buildDefaultPayload(req.body, extraFields);

      try {
        await prisma[modelName].update({
          where: { id: targetId },
          data,
        });

        invalidateCache(req);
        logger.logThat(`${effectiveLogLabel} ${req.body.name} updated by ${req.session.username}`);
        req.session.notification = msg.updateSuccess(req.body.name);
      } catch (error) {
        console.error(`Error updating ${lowerLabel}:`, error);
        req.session.notification = msg.updateError;
      }

      res.redirect(managePath);
    }),
  );

  return router;
}

module.exports = {
  createReferenceCrudRouter,
};
