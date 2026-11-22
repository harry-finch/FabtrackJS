/**
 * Robust, accessible, multi-table sorting for FabtrackJS (R-028)
 */
function sortTable(n, tableElem) {
  const table = tableElem || document.querySelector("table");
  if (!table) return;

  const tbody = table.querySelector("tbody");
  if (!tbody) return;

  const rows = Array.from(tbody.querySelectorAll("tr"));
  if (rows.length <= 1) return;

  // Determine current sort direction on table
  const currentDir =
    table.getAttribute("data-sort-dir") === "asc" && table.getAttribute("data-sort-col") === String(n)
      ? "desc"
      : "asc";

  table.setAttribute("data-sort-col", String(n));
  table.setAttribute("data-sort-dir", currentDir);

  function parseCell(cell) {
    if (!cell) return "";
    const raw = cell.textContent.trim();
    // Try parsing as number (handling currencies like '€', '$' and stock like '18 / min: 5')
    const cleaned = raw.replace(/[€$]/g, "").trim().split("/")[0].trim();
    const num = parseFloat(cleaned);
    if (!isNaN(num) && /^-?\d+(\.\d+)?$/.test(cleaned)) {
      return num;
    }
    return raw.toLowerCase();
  }

  rows.sort((rowA, rowB) => {
    const cellsA = rowA.children;
    const cellsB = rowB.children;

    if (!cellsA[n] || !cellsB[n]) return 0;

    const valA = parseCell(cellsA[n]);
    const valB = parseCell(cellsB[n]);

    let comparison = 0;
    if (typeof valA === "number" && typeof valB === "number") {
      comparison = valA - valB;
    } else {
      comparison = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: "base" });
    }

    return currentDir === "asc" ? comparison : -comparison;
  });

  // Re-append sorted rows to tbody
  rows.forEach((row) => tbody.appendChild(row));

  // Update table header indicators and ARIA sort state
  const headers = table.querySelectorAll("th");
  headers.forEach((th, idx) => {
    th.classList.remove("sorted-asc", "sorted-desc");
    const icon = th.querySelector(".sort-icon");
    if (icon) icon.remove();

    const headerSortIdx = th.hasAttribute("data-sort") ? parseInt(th.getAttribute("data-sort"), 10) : idx;

    if (headerSortIdx === n) {
      th.classList.add(currentDir === "asc" ? "sorted-asc" : "sorted-desc");
      th.setAttribute("aria-sort", currentDir === "asc" ? "ascending" : "descending");
      const indicator = document.createElement("span");
      indicator.className = "sort-icon ms-1 small text-primary";
      indicator.setAttribute("aria-hidden", "true");
      indicator.textContent = currentDir === "asc" ? "▲" : "▼";
      th.appendChild(indicator);
    } else if (th.hasAttribute("data-sort")) {
      th.setAttribute("aria-sort", "none");
    }
  });
}

function initSortableHeaders(root) {
  const container = root || document;
  container.querySelectorAll("th[data-sort]").forEach((th) => {
    th.style.cursor = "pointer";
    if (!th.hasAttribute("tabindex")) {
      th.setAttribute("tabindex", "0");
    }
    if (!th.hasAttribute("role")) {
      th.setAttribute("role", "button");
    }
    if (!th.hasAttribute("aria-sort")) {
      th.setAttribute("aria-sort", "none");
    }

    if (th.dataset && th.dataset.sortBound === "true") {
      return;
    }
    if (th.dataset) {
      th.dataset.sortBound = "true";
    }

    const triggerSort = () => {
      const colIndex = parseInt(th.getAttribute("data-sort"), 10);
      if (Number.isNaN(colIndex)) return;
      const table = th.closest("table");
      sortTable(colIndex, table);
    };

    th.addEventListener("click", triggerSort);
    th.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        triggerSort();
      }
    });
  });
}

// Make sortTable & initSortableHeaders globally accessible
window.sortTable = sortTable;
window.initSortableHeaders = initSortableHeaders;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initSortableHeaders(document));
} else {
  initSortableHeaders(document);
}
