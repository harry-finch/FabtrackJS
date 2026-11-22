const { createReferenceCrudRouter } = require("../../utilities/referenceCrudFactory.js");
const { createUsertypeSchema, updateUsertypeSchema } = require("../../schemas/index.js");

module.exports = createReferenceCrudRouter({
  modelName: "usertype",
  idField: "usertypeid",
  basePath: "/admin/usertypes",
  viewName: "admin/manage-usertypes",
  listKey: "usertypes",
  resourceLabel: "Usertype",
  createSchema: createUsertypeSchema,
  updateSchema: updateUsertypeSchema,
  messages: {
    deleteError: "Error: Failed to delete usertype (check linked users)",
  },
});
