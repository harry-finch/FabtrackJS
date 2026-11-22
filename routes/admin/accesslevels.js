const { createReferenceCrudRouter } = require("../../utilities/referenceCrudFactory.js");
const { createAccessLevelSchema, updateAccessLevelSchema } = require("../../schemas/index.js");

const sanitizeAccessData = ({ name, description }) => ({
  name: name.trim(),
  description: typeof description === "string" ? description.trim() : "",
});

module.exports = createReferenceCrudRouter({
  modelName: "access",
  idField: "accessid",
  basePath: "/admin/accesslevels",
  viewName: "admin/manage-access",
  listKey: "access",
  resourceLabel: "Access level",
  createSchema: createAccessLevelSchema,
  updateSchema: updateAccessLevelSchema,
  extraFields: ["description"],
  sanitizeCreateData: sanitizeAccessData,
  sanitizeUpdateData: sanitizeAccessData,
  messages: {
    deleteError: "Error: Failed to delete access level (check linked machines)",
  },
});
