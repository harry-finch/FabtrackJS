const fs = require("fs");
const path = require("path");
const hookManager = require("./HookManager");

const loadedPlugins = [];

function loadPlugins() {
  const pluginsDir = path.join(__dirname, "../plugins");
  if (!fs.existsSync(pluginsDir)) return;
  const pluginFiles = fs.readdirSync(pluginsDir);

  pluginFiles.forEach((file) => {
    if (file.startsWith(".") || !file.endsWith(".js")) return;
    const pluginPath = path.join(pluginsDir, file);
    try {
      const plugin = require(pluginPath);
      const envKey = plugin.envKey || "ENABLE_PLUGIN_UE";
      const isEnabledByEnv =
        process.env[envKey] !== undefined
          ? process.env[envKey] !== "false" && process.env[envKey] !== "0"
          : true;
      const isExplicitlyEnabled = plugin.enabled !== false && isEnabledByEnv;

      plugin.enabled = isExplicitlyEnabled;
      hookManager.registerPlugin(plugin);
      if (!loadedPlugins.includes(plugin)) {
        loadedPlugins.push(plugin);
      }

      if (typeof plugin.register === "function") {
        console.log(`Loading plugin: ${plugin.name} version ${plugin.version} (enabled: ${isExplicitlyEnabled})`);
        plugin.register(hookManager);
      } else {
        console.error(`Invalid plugin: ${file} (missing 'register' function)`);
      }
    } catch (err) {
      console.error(`Error loading plugin ${file}:`, err);
    }
  });
}

/**
 * Runs optional async DB bootstrap hooks declared by plugins (e.g. ensuring default project types)
 * explicitly at server startup rather than synchronously during module import.
 */
async function runPluginBootstrap() {
  for (const plugin of loadedPlugins) {
    if (typeof plugin.bootstrap === "function") {
      try {
        await plugin.bootstrap();
      } catch (err) {
        console.error(`[pluginLoader] Bootstrap failed for plugin ${plugin.id || plugin.name}:`, err);
      }
    }
  }
}

loadPlugins.runPluginBootstrap = runPluginBootstrap;

module.exports = loadPlugins;
