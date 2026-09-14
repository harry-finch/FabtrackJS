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
  // 3. Form Submissions Feedback & Double-submission prevention
  // ---------------------------------------------------------------------------
  document.addEventListener("submit", (e) => {
    const form = e.target;
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
