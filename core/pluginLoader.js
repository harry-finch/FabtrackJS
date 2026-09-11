const fs = require("fs");
const path = require("path");
const hookManager = require("./HookManager"); // Import the hookManager here

function loadPlugins() {
  const pluginsDir = path.join(__dirname, "../plugins");
  if (!fs.existsSync(pluginsDir)) return;
  const pluginFiles = fs.readdirSync(pluginsDir);

  pluginFiles.forEach((file) => {
    if (file.startsWith(".")) return;
    const pluginPath = path.join(pluginsDir, file);
    try {
      const plugin = require(pluginPath);
      const envKey = plugin.envKey || "ENABLE_PLUGIN_UE";
      const isEnabledByEnv = process.env[envKey] !== undefined ? process.env[envKey] !== "false" && process.env[envKey] !== "0" : true;
      const isExplicitlyEnabled = plugin.enabled !== false && isEnabledByEnv;

      if (!isExplicitlyEnabled) {
        console.log(`Plugin ${plugin.name || file} is disabled.`);
        return;
      }

      if (typeof plugin.register === "function") {
        console.log(`Loading plugin: ${plugin.name} version ${plugin.version}`);
        plugin.enabled = true;
        hookManager.registerPlugin(plugin);
        plugin.register(hookManager); // Pass hookManager to the plugin
      } else {
        console.error(`Invalid plugin: ${file} (missing 'register' function)`);
      }
    } catch (err) {
      console.error(`Error loading plugin ${file}:`, err);
    }
  });
}

module.exports = loadPlugins;
