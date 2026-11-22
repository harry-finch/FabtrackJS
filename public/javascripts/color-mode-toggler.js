/*!
 * Color mode controller for FabtrackJS (Option B Fab Design System — R-031)
 * Supports segmented [data-bs-theme-value="auto|light|dark"] controls & live fabtrack:themechange events.
 */

(() => {
  "use strict";

  const getStoredTheme = () => localStorage.getItem("theme");
  const setStoredTheme = (theme) => localStorage.setItem("theme", theme);

  const getPreferredTheme = () => {
    const storedTheme = getStoredTheme();
    if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "auto") {
      return storedTheme;
    }
    return "auto";
  };

  const setTheme = (theme) => {
    const effectiveTheme =
      theme === "auto"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme;
    document.documentElement.setAttribute("data-bs-theme", effectiveTheme);
    if (typeof window.CustomEvent === "function") {
      window.dispatchEvent(
        new window.CustomEvent("fabtrack:themechange", {
          detail: { theme: effectiveTheme, preference: theme },
        }),
      );
    }
  };

  setTheme(getPreferredTheme());

  const showActiveTheme = (theme) => {
    document.querySelectorAll("[data-bs-theme-value]").forEach((element) => {
      const isMatch = element.getAttribute("data-bs-theme-value") === theme;
      element.classList.toggle("active", isMatch);
      element.setAttribute("aria-pressed", isMatch ? "true" : "false");
    });
  };

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const storedTheme = getStoredTheme();
    if (storedTheme !== "light" && storedTheme !== "dark") {
      setTheme("auto");
    }
  });

  window.addEventListener("DOMContentLoaded", () => {
    showActiveTheme(getPreferredTheme());

    document.querySelectorAll("[data-bs-theme-value]").forEach((toggle) => {
      toggle.addEventListener("click", () => {
        const theme = toggle.getAttribute("data-bs-theme-value");
        if (!theme) return;
        setStoredTheme(theme);
        setTheme(theme);
        showActiveTheme(theme);
      });
    });
  });
})();
