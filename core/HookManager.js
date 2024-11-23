class HookManager {
  constructor() {
    this.hooks = {};
  }

  addHook(event, callback, priority = 10) {
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
}

module.exports = new HookManager();
