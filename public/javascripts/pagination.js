function parseSafeHttpUrl(rawUrl) {
  if (typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || /[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

function renderCellContent(td, cellValue) {
  td.textContent = "";

  if (cellValue === null || cellValue === undefined) {
    return;
  }

  if (typeof cellValue === "string" || typeof cellValue === "number" || typeof cellValue === "boolean") {
    td.textContent = String(cellValue);
    return;
  }

  if (typeof cellValue === "object") {
    if (cellValue.type === "link") {
      const safeHref = parseSafeHttpUrl(cellValue.url);
      if (safeHref) {
        const link = document.createElement("a");
        link.href = safeHref;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        if (cellValue.className) {
          link.className = String(cellValue.className);
        }
        if (cellValue.title) {
          link.title = String(cellValue.title);
        }
        if (cellValue.iconClass) {
          const icon = document.createElement("i");
          icon.className = String(cellValue.iconClass);
          link.appendChild(icon);
        }
        const label = cellValue.label !== undefined && cellValue.label !== null ? String(cellValue.label) : safeHref;
        link.appendChild(document.createTextNode(label));
        td.appendChild(link);
      } else {
        const fallback = document.createElement("span");
        fallback.className = cellValue.fallbackClassName ? String(cellValue.fallbackClassName) : "text-muted small";
        fallback.textContent = cellValue.fallbackText !== undefined && cellValue.fallbackText !== null
          ? String(cellValue.fallbackText)
          : "-";
        td.appendChild(fallback);
      }
      return;
    }

    if (cellValue.type === "text" || cellValue.type === "badge") {
      const span = document.createElement("span");
      if (cellValue.className) {
        span.className = String(cellValue.className);
      } else if (cellValue.type === "badge") {
        span.className = "badge";
      }
      span.textContent = cellValue.text !== undefined && cellValue.text !== null ? String(cellValue.text) : "";
      td.appendChild(span);
      return;
    }

    if (cellValue.type === "tooltipIcon") {
      const span = document.createElement("span");
      span.setAttribute("data-bs-toggle", "tooltip");
      span.setAttribute("data-bs-placement", cellValue.placement ? String(cellValue.placement) : "top");
      span.setAttribute("data-bs-custom-class", cellValue.customClass ? String(cellValue.customClass) : "custom-tooltip");
      span.setAttribute("data-bs-title", cellValue.title !== undefined && cellValue.title !== null ? String(cellValue.title) : "");
      const icon = document.createElement("i");
      icon.className = cellValue.iconClass ? String(cellValue.iconClass) : "fa-solid fa-comment-dots text-primary";
      span.appendChild(icon);
      td.appendChild(span);
      return;
    }
  }
}

function addPagination(tableId, data, itemsPerPage = 10) {
  const table = document.getElementById(tableId);
  const tableBody = table.querySelector("tbody");
  const showMoreButton = document.createElement("button");
  showMoreButton.textContent = "Show More";
  showMoreButton.classList.add("btn", "btn-secondary", "w-100"); // Add Bootstrap classes for styling

  let currentPage = 1;

  function displayData() {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = data.slice(startIndex, endIndex);

    // Get classes from headers to replicate style for whole columns
    let headerClassList = [];
    const headerCells = document.querySelectorAll("#" + tableId + " th");
    headerCells.forEach((cell) => {
      headerClassList.push(cell.classList);
    });

    pageData.forEach((item) => {
      const row = tableBody.insertRow();

      let i = 0;
      for (const col in item) {
        if (!Object.prototype.hasOwnProperty.call(item, col)) continue;
        const newCell = row.insertCell();
        renderCellContent(newCell, item[col]);
        if (headerClassList[i] && headerClassList[i].value) {
          newCell.className = headerClassList[i].value;
        }
        i++;
      }
    });

    // Hide the button if there's no more data to load
    if (endIndex >= data.length) {
      showMoreButton.style.display = "none";
    } else {
      showMoreButton.style.display = "block";
      showMoreButton.textContent =
        "Show more (" + (data.length - endIndex).toString() + ")";
    }

    // Load tooltips if any
    if (typeof loadTooltips === "function") {
      loadTooltips();
    }
  }

  showMoreButton.addEventListener("click", () => {
    currentPage++;
    displayData();
  });

  table.parentNode.insertBefore(showMoreButton, table.nextSibling); // Insert button after the table

  // Initial display
  displayData();
}
