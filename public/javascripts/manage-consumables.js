/**
 * Dynamic behavior for Manage Consumables page
 */
document.addEventListener("DOMContentLoaded", function () {
  // 1. "New Consumable" Modal Trigger
  const btnNewConsumable = document.getElementById("btnNewConsumable");
  if (btnNewConsumable) {
    btnNewConsumable.addEventListener("click", function () {
      const modalEl = document.getElementById("createConsumableModal");
      if (modalEl && window.bootstrap) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
      }
    });
  }

  // 2. Helper functions to fill modals
  function populateEditModal(data) {
    if (!data) return;
    const idInput = document.getElementById("editConsumableId");
    const nameInput = document.getElementById("editName");
    const costInput = document.getElementById("editCost");
    const stockInput = document.getElementById("editStock");
    const thresholdInput = document.getElementById("editThreshold");
    const categorySelect = document.getElementById("editCategoryId");

    if (idInput) idInput.value = data.id || "";
    if (nameInput) nameInput.value = data.name || "";
    if (costInput) costInput.value = data.cost || "";
    if (stockInput) stockInput.value = data.stock !== undefined ? data.stock : "0";
    if (thresholdInput) thresholdInput.value = data.threshold !== undefined ? data.threshold : "5";
    if (categorySelect) categorySelect.value = data.categoryId || "";
  }

  function populateRestockModal(data) {
    if (!data) return;
    const idInput = document.getElementById("restockConsumableId");
    const nameDisplay = document.getElementById("restockConsumableName");
    const stockDisplay = document.getElementById("restockCurrentStock");
    const qtyInput = document.getElementById("restockQuantity");

    if (idInput) idInput.value = data.id || "";
    if (nameDisplay) nameDisplay.textContent = data.name || "-";
    if (stockDisplay) stockDisplay.textContent = data.stock !== undefined ? data.stock : "0";
    if (qtyInput) qtyInput.value = 10;
  }

  // 3. Delegated click handlers (fires synchronously on user click)
  document.addEventListener("click", function (e) {
    // Check for Edit button
    const editBtn = e.target.closest(".btn-edit");
    if (editBtn) {
      const data = {
        id: editBtn.getAttribute("data-id") || "",
        name: editBtn.getAttribute("data-name") || "",
        cost: editBtn.getAttribute("data-cost") || "",
        stock: editBtn.getAttribute("data-stock") || "0",
        threshold: editBtn.getAttribute("data-threshold") || "5",
        categoryId: editBtn.getAttribute("data-category-id") || "",
      };
      populateEditModal(data);
      const modalEl = document.getElementById("editConsumableModal");
      if (modalEl && window.bootstrap) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
      }
      return;
    }

    // Check for Restock (Livraison) button
    const restockBtn = e.target.closest(".btn-restock");
    if (restockBtn) {
      const data = {
        id: restockBtn.getAttribute("data-id") || "",
        name: restockBtn.getAttribute("data-name") || "",
        stock: restockBtn.getAttribute("data-stock") || "0",
      };
      populateRestockModal(data);
      const modalEl = document.getElementById("restockModal");
      if (modalEl && window.bootstrap) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
      }
      return;
    }
  });

  // 4. Bootstrap modal event listeners as robust fallback
  const editModalEl = document.getElementById("editConsumableModal");
  if (editModalEl) {
    editModalEl.addEventListener("show.bs.modal", function (event) {
      const btn = event.relatedTarget ? (event.relatedTarget.closest(".btn-edit") || event.relatedTarget) : null;
      if (btn && btn.getAttribute("data-id")) {
        populateEditModal({
          id: btn.getAttribute("data-id") || "",
          name: btn.getAttribute("data-name") || "",
          cost: btn.getAttribute("data-cost") || "",
          stock: btn.getAttribute("data-stock") || "0",
          threshold: btn.getAttribute("data-threshold") || "5",
          categoryId: btn.getAttribute("data-category-id") || "",
        });
      }
    });
  }

  const restockModalEl = document.getElementById("restockModal");
  if (restockModalEl) {
    restockModalEl.addEventListener("show.bs.modal", function (event) {
      const btn = event.relatedTarget ? (event.relatedTarget.closest(".btn-restock") || event.relatedTarget) : null;
      if (btn && btn.getAttribute("data-id")) {
        populateRestockModal({
          id: btn.getAttribute("data-id") || "",
          name: btn.getAttribute("data-name") || "",
          stock: btn.getAttribute("data-stock") || "0",
        });
      }
    });
  }

  // 5. Category filter pills
  const filterBtns = document.querySelectorAll(".filter-category-btn");
  filterBtns.forEach((btn) => {
    btn.addEventListener("click", function () {
      filterBtns.forEach((b) => b.classList.remove("active"));
      this.classList.add("active");

      const selectedCat = this.getAttribute("data-category");
      const rows = document.querySelectorAll("#consumablesTable tbody tr");

      rows.forEach((row) => {
        const rowCat = row.getAttribute("data-cat-id");
        if (selectedCat === "all" || rowCat === selectedCat) {
          row.style.display = "";
        } else {
          row.style.display = "none";
        }
      });
    });
  });
});
