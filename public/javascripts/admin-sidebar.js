/**
 * FabtrackJS - Persistent Admin Sidebar Quick Filter (R-033)
 * Filters sidebar navigation links live and automatically expands
 * the Configuration & Référentiels section when searching.
 */
(() => {
  "use strict";

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function initAdminSidebar() {
    const filterInput = document.getElementById("adminSidebarFilter");
    const sidebar = document.getElementById("adminSidebarOffcanvas");
    if (!filterInput || !sidebar) return;

    const groups = Array.from(sidebar.querySelectorAll(".fab-sb-group"));
    const configCollapseEl = document.getElementById("adminConfigCollapse");
    const noResultsEl = document.getElementById("adminSidebarNoResults");

    filterInput.addEventListener("input", () => {
      const query = normalizeText(filterInput.value);
      let visibleTotal = 0;

      // Auto-expand Configuration & Référentiels when searching
      if (configCollapseEl && query.length > 0 && !configCollapseEl.classList.contains("show")) {
        configCollapseEl.classList.add("show");
      }

      groups.forEach((group) => {
        const links = Array.from(group.querySelectorAll(".fab-sb-link"));
        let visibleInGroup = 0;

        links.forEach((link) => {
          const haystack = normalizeText(
            (link.getAttribute("data-sb-label") || "") + " " + (link.textContent || ""),
          );
          const matches = !query || haystack.includes(query);
          link.classList.toggle("d-none", !matches);
          if (matches) {
            visibleInGroup++;
            visibleTotal++;
          }
        });

        group.classList.toggle("d-none", visibleInGroup === 0);
      });

      if (noResultsEl) {
        noResultsEl.classList.toggle("d-none", visibleTotal > 0);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdminSidebar);
  } else {
    initAdminSidebar();
  }
})();
