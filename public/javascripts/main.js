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
  // 2. Soft Internal Navigation & Global CSP-Safe Delegated Click Actions
  // ---------------------------------------------------------------------------
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented) return;
    if (!e.target || typeof e.target.closest !== "function") return;

    // Delegated CSP-safe actions (replaces legacy inline onclick=... attributes)
    const sortHeader = e.target.closest("th[data-sort]");
    if (sortHeader && typeof window.sortTable === "function") {
      const colIdx = Number(sortHeader.getAttribute("data-sort"));
      if (!Number.isNaN(colIdx)) {
        window.sortTable(colIdx);
      }
      return;
    }

    const backBtn = e.target.closest('[data-action="history-back"]');
    if (backBtn) {
      if (window.history && window.history.length > 1) {
        window.history.back();
      } else {
        window.location.assign(typeof window.getAppBaseUrl === "function" ? window.getAppBaseUrl("") : "/");
      }
      return;
    }

    const cancelEditBtn = e.target.closest('[data-action="cancel-edit"]');
    if (cancelEditBtn && typeof window.cancelEdit === "function") {
      window.cancelEdit();
      return;
    }

    const clickTargetEl = e.target.closest("[data-click-target]");
    if (clickTargetEl) {
      const targetId = clickTargetEl.getAttribute("data-click-target");
      const targetEl = targetId ? document.getElementById(targetId) : null;
      if (targetEl && typeof targetEl.click === "function") {
        targetEl.click();
      }
      return;
    }

    const selectOnClickEl = e.target.closest('[data-select-on-click="true"]');
    if (selectOnClickEl && typeof selectOnClickEl.select === "function") {
      selectOnClickEl.select();
      return;
    }

    const copyBtn = e.target.closest("[data-copy-text]");
    if (copyBtn) {
      const text = copyBtn.getAttribute("data-copy-text") || "";
      if (typeof window.copyToClipboard === "function") {
        window.copyToClipboard(text);
      } else if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard.writeText(text).catch(() => {});
      }
      return;
    }

    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

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

    // Centralized Bootstrap confirmation modal via data-confirm attribute (R-027)
    if (form && typeof form.getAttribute === "function") {
      const confirmMessage = form.getAttribute("data-confirm");
      if (confirmMessage) {
        if (form.dataset && form.dataset.confirmed === "true") {
          delete form.dataset.confirmed;
        } else {
          e.preventDefault();
          if (typeof window.fabtrackConfirm === "function") {
            const confirmVariant = form.getAttribute("data-confirm-variant") || "danger";
            const confirmTitle = form.getAttribute("data-confirm-title") || "";
            const confirmLabel = form.getAttribute("data-confirm-label") || "";
            window
              .fabtrackConfirm({
                title: confirmTitle,
                message: confirmMessage,
                confirmLabel: confirmLabel,
                variant: confirmVariant,
              })
              .then((accepted) => {
                if (!accepted) return;
                if (form.dataset) {
                  form.dataset.confirmed = "true";
                }
                if (typeof form.requestSubmit === "function") {
                  form.requestSubmit();
                } else {
                  ensureCsrfOnForm(form);
                  if (window.HTMLFormElement && window.HTMLFormElement.prototype && window.HTMLFormElement.prototype.submit) {
                    window.HTMLFormElement.prototype.submit.call(form);
                  } else if (typeof form.submit === "function") {
                    form.submit();
                  }
                }
              });
          }
          return;
        }
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

  // ---------------------------------------------------------------------------
  // 4. Global CSP-Safe Delegated Change Actions
  // ---------------------------------------------------------------------------
  document.addEventListener("change", (e) => {
    const target = e.target;
    if (!target || typeof target.getAttribute !== "function") return;
    if (target.getAttribute("data-auto-submit") === "true" && target.form) {
      target.form.submit();
    }
  });
})();
