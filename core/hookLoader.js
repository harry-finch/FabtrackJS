const fs = require("fs");
const path = require("path");

function loadHooks() {
  const hooksDir = path.join(__dirname, "../hooks");
  const hookFiles = fs.readdirSync(hooksDir);

  hookFiles.forEach((file) => {
    const registerHooks = require(path.join(hooksDir, file));
    if (typeof registerHooks === "function") {
      registerHooks(); // Call the function to register hooks
      console.log(`Loaded hooks from: ${file}`);
    }
  });
}

module.exports = loadHooks;
