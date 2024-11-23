const fs = require("fs");
const path = require("path");
const hookManager = require("./HookManager"); // Import the hookManager here

function loadPlugins() {
  const pluginsDir = path.join(__dirname, "../plugins");
  const pluginFiles = fs.readdirSync(pluginsDir);

  pluginFiles.forEach((file) => {
    const pluginPath = path.join(pluginsDir, file);
    const plugin = require(pluginPath);

    if (typeof plugin.register === "function") {
      console.log(`Loading plugin: ${plugin.name} version ${plugin.version}`);
      plugin.register(hookManager); // Pass hookManager to the plugin
    } else {
      console.error(`Invalid plugin: ${file} (missing 'register' function)`);
    }
  });
}

module.exports = loadPlugins;
