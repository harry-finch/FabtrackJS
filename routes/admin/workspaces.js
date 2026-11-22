const { createReferenceCrudRouter } = require("../../utilities/referenceCrudFactory.js");
const { createWorkspaceSchema, updateWorkspaceSchema } = require("../../schemas/index.js");

module.exports = createReferenceCrudRouter({
  modelName: "workspace",
  idField: "workspaceid",
  basePath: "/admin/workspaces",
  viewName: "admin/manage-workspaces",
  listKey: "workspaces",
  resourceLabel: "Workspace",
  createSchema: createWorkspaceSchema,
  updateSchema: updateWorkspaceSchema,
  extraFields: ["location"],
  messages: {
    deleteError: "Error: Failed to delete workspace (check related history or categories)",
  },
});
