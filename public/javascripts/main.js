/**
 * FabtrackJS - Main Client-Side Enhancements
 * Smooth Page Transitions, Top Loading Progress Bar & UI Softening
 */
(() => {
  "use strict";

  if (window.__fabtrackMainLoaded) return;
  window.__fabtrackMainLoaded = true;

  // ---------------------------------------------------------------------------
  // 1. Top Loading Progress Bar Controller (YouTube / GitHub style)
  // ---------------------------------------------------------------------------
  let progressBar = document.getElementById("page-progress-bar");
  if (!progressBar) {
    progressBar = document.createElement("div");
    progressBar.id = "page-progress-bar";
    document.documentElement.appendChild(progressBar);
  }

  let progressTimer = null;

  function startProgressBar() {
    clearTimeout(progressTimer);
    progressBar.classList.remove("finished");
    progressBar.classList.add("active");
    progressBar.style.width = "20%";

    progressTimer = setTimeout(() => {
      progressBar.style.width = "65%";
      progressTimer = setTimeout(() => {
        progressBar.style.width = "85%";
      }, 300);
    }, 80);
  }

  function finishProgressBar() {
    clearTimeout(progressTimer);
    progressBar.style.width = "100%";
    progressBar.classList.add("finished");
    setTimeout(() => {
      progressBar.classList.remove("active", "finished");
      progressBar.style.width = "0%";
    }, 350);
  }

  // Finish progress bar on initial page load
  if (document.readyState === "complete" || document.readyState === "interactive") {
    finishProgressBar();
  } else {
    window.addEventListener("DOMContentLoaded", finishProgressBar, { once: true });
  }

  // Handle BFCache (back/forward browser navigation)
  window.addEventListener("pageshow", () => {
    finishProgressBar();
    const main = document.querySelector("main.main-container");
    if (main) {
      main.classList.remove("page-navigating-out");
    }
  });

  // ---------------------------------------------------------------------------
  // 2. Soft Internal Navigation Handler
  // ---------------------------------------------------------------------------
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!e.target || typeof e.target.closest !== "function") return;

    const link = e.target.closest("a");
    if (!link) return;

    const href = link.getAttribute("href");
    if (!href) return;

    // Ignore external, download, target=_blank, and in-page anchor links
    if (
      link.target === "_blank" ||
      link.hasAttribute("download") ||
      link.hasAttribute("data-bs-toggle") ||
      link.getAttribute("role") === "button" ||
      href.startsWith("#") ||
      href.startsWith("javascript:") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:")
    ) {
      return;
    }

    // Ignore cross-origin URLs
    if (link.origin !== window.location.origin) {
      return;
    }

    // Ignore clicking on the exact current page with anchor
    if (link.pathname === window.location.pathname && link.search === window.location.search && link.hash) {
      return;
    }

    // Subpath Auto-Correction for reverse proxy deployments (e.g. /fabtrack/)
    if (window.getAppBaseUrl && href.startsWith("/") && !href.startsWith("//")) {
      try {
        const targetUrl = window.getAppBaseUrl(href);
        const targetPath = new URL(targetUrl, window.location.origin).pathname;
        if (link.pathname !== targetPath) {
          e.preventDefault();
          startProgressBar();
          window.location.assign(targetUrl);
          return;
        }
      } catch (err) {}
    }

    // Trigger the top progress bar immediately
    startProgressBar();

    // If native View Transitions are not supported or reduced motion is preferred, use soft exit class
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const supportsViewTransition = !prefersReducedMotion && document.startViewTransition !== undefined;

    if (!supportsViewTransition && !prefersReducedMotion) {
      const main = document.querySelector("main.main-container");
      if (main) {
        main.classList.add("page-navigating-out");
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 2b. Automatic CSRF Token Injection for State-Changing Forms
  // ---------------------------------------------------------------------------
  function ensureCsrfOnForm(form) {
    if (!form || typeof form.getAttribute !== "function") return;
    const method = (form.getAttribute("method") || form.method || "GET").toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

    const token = typeof window.getCsrfToken === "function" ? window.getCsrfToken() : "";
    if (!token) return;

    // 1. Ensure hidden _csrf input for standard URL-encoded forms
    let csrfInput = form.querySelector('input[name="_csrf"]');
    if (!csrfInput) {
      csrfInput = document.createElement("input");
      csrfInput.type = "hidden";
      csrfInput.name = "_csrf";
      form.appendChild(csrfInput);
    }
    csrfInput.value = token;

    // 2. For multipart/form-data forms, also attach _csrf as query param so
    // server-side CSRF middleware can verify before multer streams the body
    const enctype = (form.getAttribute("enctype") || form.enctype || "").toLowerCase();
    if (enctype.includes("multipart/form-data")) {
      try {
        const rawAction = form.getAttribute("action") || window.location.pathname + window.location.search;
        const parsed = new URL(rawAction, window.location.href);
        if (parsed.origin === window.location.origin) {
          parsed.searchParams.set("_csrf", token);
          form.setAttribute("action", parsed.pathname + parsed.search + parsed.hash);
        }
      } catch (err) {}
    }
  }

  function injectCsrfAllForms() {
    if (typeof document.querySelectorAll !== "function") return;
    document.querySelectorAll("form").forEach(ensureCsrfOnForm);
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", injectCsrfAllForms, { once: true });
  } else {
    injectCsrfAllForms();
  }

  // ---------------------------------------------------------------------------
  // 3. Form Submissions Feedback, Centralized data-confirm & Double-submission prevention
  // ---------------------------------------------------------------------------
  document.addEventListener("submit", (e) => {
    if (e.defaultPrevented) return;

    const form = e.target;

    // Centralized confirmation dialog via data-confirm attribute (eliminates inline JS confirm() XSS)
    if (form && typeof form.getAttribute === "function") {
      const confirmMessage = form.getAttribute("data-confirm");
      if (confirmMessage && typeof window.confirm === "function" && !window.confirm(confirmMessage)) {
        e.preventDefault();
        return;
      }
    }

    // Subpath Auto-Correction for form action in reverse proxy deployments
    if (window.getAppBaseUrl && form.action) {
      try {
        const rawAction = form.getAttribute("action");
        if (rawAction && rawAction.startsWith("/") && !rawAction.startsWith("//")) {
          const targetAction = window.getAppBaseUrl(rawAction);
          const targetPath = new URL(targetAction, window.location.origin).pathname;
          if (new URL(form.action, window.location.origin).pathname !== targetPath) {
            form.action = targetAction;
          }
        }
      } catch (err) {}
    }

    // Always inject/refresh CSRF token even on forms with data-no-progress or target=_blank
    ensureCsrfOnForm(form);

    if (form.target === "_blank" || form.getAttribute("data-no-progress")) return;

    // Prevent duplicate accidental form submissions
    if (form.dataset.submitting === "true") {
      e.preventDefault();
      return;
    }
    form.dataset.submitting = "true";

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      setTimeout(() => {
        submitBtn.disabled = true;
      }, 50);
    }

    startProgressBar();
  });
})();
