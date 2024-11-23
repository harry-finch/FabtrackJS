module.exports = {
  name: "Register Form Plugin",
  version: "1.0.0",
  description: "Adds a field to the main register form",
  register(hookManager) {
    hookManager.addHook("registerForm", () => {
      const value = "registerForm plugin";
      console.log(value);
      return value;
    });
  },
};
