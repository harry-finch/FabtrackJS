const { createReferenceCrudRouter } = require("../../utilities/referenceCrudFactory.js");
const { createLocationSchema, updateLocationSchema } = require("../../schemas/index.js");

module.exports = createReferenceCrudRouter({
  modelName: "location",
  idField: "locationid",
  basePath: "/admin/locations",
  viewName: "admin/manage-locations",
  listKey: "locations",
  resourceLabel: "Location",
  createSchema: createLocationSchema,
  updateSchema: updateLocationSchema,
  extraFields: ["description"],
  messages: {
    deleteError: "Error: Failed to delete location (check linked machines)",
  },
});
