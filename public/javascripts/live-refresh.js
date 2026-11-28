/**
 * FabtrackJS - Partial Kiosk & Admin Table Refresh + Native SSE Realtime Sync (R-032)
 * - Lot 1: AJAX kiosk actions + partial GET /fabtrack/present-table swap (zero full page reload)
 * - Lot 2: SSE-driven DOMParser partial table refresh on operational admin pages
 *          (preserves filters, search, pagination, active sort; never interrupts open modals or typing)
 */
(() => {
  "use strict";

  if (window.__fabtrackLiveRefreshLoaded) return;
  window.__fabtrackLiveRefreshLoaded = true;

  let kioskRefreshInFlight = null;
  let adminRefreshInFlight = null;
  let eventSource = null;

  function resolveUrl(relPath) {
    if (typeof window.getAppBaseUrl === "function") {
      return window.getAppBaseUrl(relPath);
    }
    return relPath.startsWith("/") ? relPath : "/" + relPath;
  }

  function initTooltipsIn(container) {
    if (!container || typeof window.bootstrap === "undefined" || !window.bootstrap.Tooltip) return;
    container.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
      try {
        window.bootstrap.Tooltip.getOrCreateInstance(el);
      } catch (_err) {
        // Ignore tooltip init errors
      }
    });
  }

  function disposeTooltipsIn(container) {
    if (!container || typeof window.bootstrap === "undefined" || !window.bootstrap.Tooltip) return;
    container.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
      try {
        const inst = window.bootstrap.Tooltip.getInstance(el);
        if (inst) inst.dispose();
      } catch (_err) {
        // Ignore dispose errors
      }
    });
  }

  function updateRealtimeBadge(state) {
    const badge = document.getElementById("fabRealtimeStatus");
    if (!badge) return;
    badge.classList.remove("d-none");
    badge.textContent = "";

    const dot = document.createElement("span");
    dot.className = "fab-status-dot";
    if (state === "connected") {
      dot.style.backgroundColor = "#198754";
      badge.title = "Synchronisation temps réel active (SSE)";
      badge.appendChild(dot);
      badge.appendChild(document.createTextNode("En direct"));
    } else if (state === "reconnecting") {
      dot.style.backgroundColor = "#f59f00";
      badge.title = "Reconnexion au flux temps réel en cours";
      badge.appendChild(dot);
      badge.appendChild(document.createTextNode("Reconnexion…"));
    } else {
      badge.classList.add("d-none");
    }
  }

  function isUserEditingOrModalOpen() {
    if (document.querySelector(".modal.show")) return true;
    const active = document.activeElement;
    if (!active) return false;
    const tag = active.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || active.isContentEditable;
  }

  /**
   * Lot 1: Refresh the kiosk present-users table via GET /fabtrack/present-table
   */
  async function refreshKioskPresentTable() {
    const container = document.getElementById("kioskPresentContainer");
    if (!container) return false;

    if (kioskRefreshInFlight) {
      return kioskRefreshInFlight;
    }

    const existingTable = container.querySelector("#present-users-table");
    const prevSortCol = existingTable ? existingTable.getAttribute("data-sort-col") : null;
    const prevSortDir = existingTable ? existingTable.getAttribute("data-sort-dir") : null;

    kioskRefreshInFlight = (async () => {
      try {
        const res = await fetch(resolveUrl("fabtrack/present-table"), {
          method: "GET",
          headers: {
            Accept: "text/html",
            "X-Requested-With": "XMLHttpRequest",
          },
          cache: "no-store",
        });
        if (!res.ok) return false;

        const html = await res.text();
        disposeTooltipsIn(container);
        container.innerHTML = html;

        if (typeof window.initSortableHeaders === "function") {
          window.initSortableHeaders(container);
        }

        // Re-apply active sort state if user had sorted the table
        const newTable = container.querySelector("#present-users-table");
        if (newTable && prevSortCol !== null && typeof window.sortTable === "function") {
          const colIdx = parseInt(prevSortCol, 10);
          if (!Number.isNaN(colIdx)) {
            if (prevSortDir === "desc") {
              newTable.setAttribute("data-sort-col", String(colIdx));
              newTable.setAttribute("data-sort-dir", "asc");
            }
            window.sortTable(colIdx, newTable);
          }
        }

        initTooltipsIn(container);
        return true;
      } catch (err) {
        console.error("[live-refresh] Failed to refresh kiosk present table:", err);
        return false;
      } finally {
        kioskRefreshInFlight = null;
      }
    })();

    return kioskRefreshInFlight;
  }

  /**
   * Lot 2: Refresh operational admin sections/tables via fetch + DOMParser without full reload.
   * Supports explicit [data-live-refresh-region] containers (so KPI cards, badges, empty states,
   * and tables stay synchronized even when a table disappears into an empty state — R-040)
   * with fallback to .table-responsive containers on other admin pages.
   */
  function swapContainerPreservingSort(currContainer, nextContainer) {
    const currTable = currContainer.querySelector("table");
    const prevSortCol = currTable ? currTable.getAttribute("data-sort-col") : null;
    const prevSortDir = currTable ? currTable.getAttribute("data-sort-dir") : null;

    disposeTooltipsIn(currContainer);
    currContainer.innerHTML = nextContainer.innerHTML;

    if (typeof window.initSortableHeaders === "function") {
      window.initSortableHeaders(currContainer);
    }
    const swappedTable = currContainer.querySelector("table");
    if (swappedTable && prevSortCol !== null && typeof window.sortTable === "function") {
      const colIdx = parseInt(prevSortCol, 10);
      if (!Number.isNaN(colIdx)) {
        if (prevSortDir === "desc") {
          swappedTable.setAttribute("data-sort-col", String(colIdx));
          swappedTable.setAttribute("data-sort-dir", "asc");
        }
        window.sortTable(colIdx, swappedTable);
      }
    }
    initTooltipsIn(currContainer);
  }

  async function refreshAdminTables() {
    if (isUserEditingOrModalOpen()) return false;
    const currentRegions = document.querySelectorAll("[data-live-refresh-region]");
    const currentTables = document.querySelectorAll(".table-responsive");
    if (currentRegions.length === 0 && currentTables.length === 0) return false;

    if (adminRefreshInFlight) {
      return adminRefreshInFlight;
    }

    adminRefreshInFlight = (async () => {
      try {
        const res = await fetch(window.location.href, {
          method: "GET",
          headers: {
            Accept: "text/html",
            "X-Requested-With": "XMLHttpRequest",
          },
          cache: "no-store",
        });
        if (!res.ok || isUserEditingOrModalOpen()) return false;

        const html = await res.text();
        const parser = new window.DOMParser();
        const nextDoc = parser.parseFromString(html, "text/html");

        if (currentRegions.length > 0) {
          let updatedCount = 0;
          currentRegions.forEach((currRegion) => {
            const key = currRegion.getAttribute("data-live-refresh-region");
            if (!key) return;
            const nextRegion = nextDoc.querySelector(`[data-live-refresh-region="${key}"]`);
            if (!nextRegion) return;
            swapContainerPreservingSort(currRegion, nextRegion);
            updatedCount += 1;
          });
          return updatedCount > 0;
        }

        const nextTables = nextDoc.querySelectorAll(".table-responsive");
        if (nextTables.length !== currentTables.length) return false;

        currentTables.forEach((currWrap, idx) => {
          swapContainerPreservingSort(currWrap, nextTables[idx]);
        });

        return true;
      } catch (err) {
        console.error("[live-refresh] Failed to refresh admin table:", err);
        return false;
      } finally {
        adminRefreshInFlight = null;
      }
    })();

    return adminRefreshInFlight;
  }

  /**
   * Intercept kiosk forms tagged with data-ajax-kiosk="true" so actions run via fetch()
   * and refresh the present table in place without full page reload.
   */
  document.addEventListener("submit", async (e) => {
    if (e.defaultPrevented) return;
    const form = e.target;
    if (!form || typeof form.getAttribute !== "function") return;
    if (form.getAttribute("data-ajax-kiosk") !== "true") return;

    e.preventDefault();

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const actionAttr = form.getAttribute("action") || "";
      const targetUrl = actionAttr.startsWith("http")
        ? actionAttr
        : resolveUrl(actionAttr.replace(/^\/+/, ""));

      const bodyParams = new window.URLSearchParams(new window.FormData(form));
      const res = await fetch(targetUrl, {
        method: (form.getAttribute("method") || "POST").toUpperCase(),
        headers: {
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: bodyParams.toString(),
      });

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        // Graceful fallback if route returned standard HTML/redirect
        await refreshKioskPresentTable();
        return;
      }

      const data = await res.json();
      const toastType = data.type || (data.ok || data.success ? "success" : "error");
      if (data.message && typeof window.showAppToast === "function") {
        window.showAppToast(data.message, toastType);
      }

      if (data.ok || data.success) {
        // Close parent modal if submitted from a modal
        const parentModal = form.closest(".modal");
        if (parentModal && typeof window.bootstrap !== "undefined" && window.bootstrap.Modal) {
          const modalInst = window.bootstrap.Modal.getInstance(parentModal);
          if (modalInst) modalInst.hide();
        }

        if (form.getAttribute("data-reset-on-success") === "true") {
          form.reset();
          const uidEl = form.querySelector("#userid");
          if (uidEl) uidEl.value = "null";
          const pidEl = form.querySelector("#projectid");
          if (pidEl) pidEl.value = "null";
          const upidEl = form.querySelector("#userprojectid");
          if (upidEl) upidEl.value = "null";
        }

        await refreshKioskPresentTable();
      }
    } catch (err) {
      console.error("[live-refresh] Kiosk AJAX submit error:", err);
      if (typeof window.showAppToast === "function") {
        window.showAppToast("Erreur de communication avec le serveur.", "error");
      }
    } finally {
      if (form.dataset) {
        delete form.dataset.submitting;
      }
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  function detectLivePageMode() {
    if (document.getElementById("kioskPresentContainer")) {
      return { mode: "kiosk", channels: "kiosk" };
    }
    const path = window.location ? window.location.pathname : "";
    const liveAdminPatterns = [
      "/admin/view-history",
      "/admin/equipment",
      "/admin/consumables",
      "/admin/inventory",
      "/admin/machines",
      "/admin/users",
      "/admin/warnings",
      "/admin/repair-cafe",
      "/admin/workshops",
    ];
    if (
      liveAdminPatterns.some((p) => path.includes(p)) &&
      (document.querySelector("[data-live-refresh-region]") || document.querySelector(".table-responsive"))
    ) {
      return { mode: "admin", channels: "admin" };
    }
    return null;
  }

  function connectEventStream() {
    if (typeof window.EventSource !== "function") return;
    const pageMode = detectLivePageMode();
    if (!pageMode) return;

    const streamUrl = resolveUrl(`events/stream?channels=${encodeURIComponent(pageMode.channels)}`);
    eventSource = new window.EventSource(streamUrl);

    eventSource.addEventListener("connected", () => {
      updateRealtimeBadge("connected");
    });

    eventSource.addEventListener("open", () => {
      updateRealtimeBadge("connected");
    });

    eventSource.addEventListener("invalidate", () => {
      if (pageMode.mode === "kiosk") {
        refreshKioskPresentTable();
      } else if (pageMode.mode === "admin") {
        refreshAdminTables();
      }
    });

    eventSource.addEventListener("error", () => {
      updateRealtimeBadge("reconnecting");
    });

    window.addEventListener("beforeunload", () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    });
  }

  window.refreshKioskPresentTable = refreshKioskPresentTable;
  window.refreshAdminTables = refreshAdminTables;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", connectEventStream);
  } else {
    connectEventStream();
  }
})();
