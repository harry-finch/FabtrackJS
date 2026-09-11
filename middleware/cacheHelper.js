function invalidateCache(req) {
  if (req && req.session) {
    req.session.invalidateCache = true;
    req.session.availableWorkspaces = null;
    req.session.usertypes = null;
    req.session.projecttypes = null;
    req.session.machinetypes = null;
    req.session.warningtypes = null;
    req.session.categories = null;
    req.session.locations = null;
    req.session.access = null;
    req.session.machines = null;
    req.session.equipment = null;
  }
}

module.exports = { invalidateCache };
