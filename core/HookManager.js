class HookManager {
  constructor() {
    this.hooks = {};
  }

  addHook(event, callback, priority = 10) {
    if (typeof callback !== "function") {
      throw new TypeError(`Listener for '${event}' must be a function. Received: ${typeof callback}`);
    }

    if (!this.hooks[event]) {
      this.hooks[event] = [];
    }

    this.hooks[event].push({ callback, priority });
    this.hooks[event].sort((a, b) => a.priority - b.priority);
  }

  triggerHook(event, ...args) {
    if (this.hooks[event]) {
      return this.hooks[event].map((hook) => hook.callback(...args));
    }
    return [];
  }

  async triggerAsyncHook(event, ...args) {
    if (this.hooks[event]) {
      const results = [];
      for (const listener of this.hooks[event]) {
        results.push(await listener.callback(...args)); // Collect results
      }
      return results; // Return results of all listeners
    }
    return [];
  }
}

module.exports = new HookManager();
