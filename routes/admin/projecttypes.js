const { createReferenceCrudRouter } = require("../../utilities/referenceCrudFactory.js");
const { createProjecttypeSchema, updateProjecttypeSchema } = require("../../schemas/index.js");

module.exports = createReferenceCrudRouter({
  modelName: "projecttype",
  idField: "projecttypeid",
  basePath: "/admin/projecttypes",
  viewName: "admin/manage-projecttypes",
  listKey: "projecttypes",
  resourceLabel: "Motif de visite",
  logLabel: "Projecttype",
  createSchema: createProjecttypeSchema,
  updateSchema: updateProjecttypeSchema,
  messages: {
    deleteSuccess: (name) => "Succès : Motif de visite « " + name + " » supprimé",
    deleteError: "Erreur : Impossible de supprimer ce motif de visite (vérifiez les visites associées)",
    createSuccess: (name) => "Succès : Motif de visite « " + name + " » créé",
    createError: "Erreur : Impossible de créer le motif de visite",
    updateSuccess: (name) => "Succès : Motif de visite « " + name + " » mis à jour",
    updateError: "Erreur : Impossible de mettre à jour le motif de visite",
  },
});
