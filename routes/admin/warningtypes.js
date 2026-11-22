const { createReferenceCrudRouter } = require("../../utilities/referenceCrudFactory.js");
const { createWarningtypeSchema, updateWarningtypeSchema } = require("../../schemas/index.js");
const { sanitizeWarningIcon } = require("../../utilities/xssHelpers.js");

const sanitizeWarningtypeData = ({ name, icon }) => ({
  name: name.trim(),
  icon: icon && icon.trim() ? sanitizeWarningIcon(icon) : null,
});

module.exports = createReferenceCrudRouter({
  modelName: "warningtype",
  idField: "warningtypeid",
  basePath: "/admin/warningtypes",
  viewName: "admin/manage-warningtypes",
  listKey: "warningtypes",
  resourceLabel: "Warning type",
  createSchema: createWarningtypeSchema,
  updateSchema: updateWarningtypeSchema,
  extraFields: ["icon"],
  sanitizeCreateData: sanitizeWarningtypeData,
  sanitizeUpdateData: sanitizeWarningtypeData,
  messages: {
    deleteError: "Error: Failed to delete warning type (check linked warnings)",
  },
});
