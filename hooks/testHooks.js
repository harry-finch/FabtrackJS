const hookManager = require("../core/HookManager");

module.exports = () => {
  hookManager.addHook("testItem", (item) => {
    console.log(`Test Hook: Successfully tested item: ${item}`);
  });
};
