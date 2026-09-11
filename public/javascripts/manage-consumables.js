/**
 * Dynamic behavior for Manage Consumables page (Option 2: Packaging & Conversion)
 */
document.addEventListener("DOMContentLoaded", function () {
  // 1. "New Consumable" Modal Trigger
  const btnNewConsumable = document.getElementById("btnNewConsumable");
  if (btnNewConsumable) {
    btnNewConsumable.addEventListener("click", function () {
      const modalEl = document.getElementById("createConsumableModal");
      if (modalEl && window.bootstrap) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
      }
    });
  }

  // Preset Buttons in Create Modal
  const presetBtns = document.querySelectorAll(".btn-preset");
  presetBtns.forEach((btn) => {
    btn.addEventListener("click", function () {
      const unit = this.getAttribute("data-unit") || "g";
      const stockUnit = this.getAttribute("data-stock-unit") || "bobine";
      const unitsPerPack = this.getAttribute("data-units-per-pack") || "1000";
      const threshold = this.getAttribute("data-threshold") || "1000";

      const unitInput = document.getElementById("createUnit");
      const stockUnitInput = document.getElementById("createStockUnit");
      const unitsPerPackInput = document.getElementById("createUnitsPerPack");
      const thresholdInput = document.getElementById("createThreshold");

      if (unitInput) unitInput.value = unit;
      if (stockUnitInput) stockUnitInput.value = stockUnit;
      if (unitsPerPackInput) unitsPerPackInput.value = unitsPerPack;
      if (thresholdInput) thresholdInput.value = threshold;
    });
  });

  // 2. Helper functions to fill modals
  function populateEditModal(data) {
    if (!data) return;
    const idInput = document.getElementById("editConsumableId");
    const nameInput = document.getElementById("editName");
    const costInput = document.getElementById("editCost");
    const stockInput = document.getElementById("editStock");
    const thresholdInput = document.getElementById("editThreshold");
    const categorySelect = document.getElementById("editCategoryId");
    const unitInput = document.getElementById("editUnit");
    const stockUnitInput = document.getElementById("editStockUnit");
    const unitsPerPackInput = document.getElementById("editUnitsPerPack");

    if (idInput) idInput.value = data.id || "";
    if (nameInput) nameInput.value = data.name || "";
    if (costInput) costInput.value = data.cost || "";
    if (stockInput) stockInput.value = data.stock !== undefined ? data.stock : "0";
    if (thresholdInput) thresholdInput.value = data.threshold !== undefined ? data.threshold : "5";
    if (categorySelect) categorySelect.value = data.categoryId || "";
    if (unitInput) unitInput.value = data.unit || "u";
    if (stockUnitInput) stockUnitInput.value = data.stockUnit || "pack";
    if (unitsPerPackInput) unitsPerPackInput.value = data.unitsPerPack || "1";
  }

  function updateRestockPreview() {
    const currentStock = parseInt(document.getElementById("restockCurrentStock")?.getAttribute("data-raw-stock") || "0", 10);
    const unitsPerPack = parseFloat(document.getElementById("restockUnitsPerPack")?.value || "1") || 1;
    const unit = document.getElementById("restockUnit")?.value || "u";
    const stockUnit = document.getElementById("restockStockUnit")?.value || "pack";

    const isPacksMode = document.getElementById("modePacks")?.checked;
    let addedUnits = 0;

    if (isPacksMode) {
      const packsCount = parseFloat(document.getElementById("restockPackages")?.value || "0") || 0;
      addedUnits = Math.round(packsCount * unitsPerPack);
    } else {
      addedUnits = parseInt(document.getElementById("restockQuantity")?.value || "0", 10) || 0;
    }

    const newStock = currentStock + addedUnits;
    const previewText = document.getElementById("restockPreviewText");
    if (previewText) {
      const packsEquiv = unitsPerPack > 1 ? ` (~${(addedUnits / unitsPerPack).toFixed(2)} ${stockUnit})` : "";
      const totalPacksEquiv = unitsPerPack > 1 ? ` (~${(newStock / unitsPerPack).toFixed(2)} ${stockUnit})` : "";
      previewText.innerHTML = `<strong>+${addedUnits.toLocaleString()} ${unit}</strong>${packsEquiv} ajoutés au stock &rarr; Nouveau stock total : <strong>${newStock.toLocaleString()} ${unit}</strong>${totalPacksEquiv}`;
    }
  }

  function populateRestockModal(data) {
    if (!data) return;
    const idInput = document.getElementById("restockConsumableId");
    const nameDisplay = document.getElementById("restockConsumableName");
    const stockDisplay = document.getElementById("restockCurrentStock");
    const packsDisplay = document.getElementById("restockCurrentPacks");
    const unitsPerPackInput = document.getElementById("restockUnitsPerPack");
    const unitInput = document.getElementById("restockUnit");
    const stockUnitInput = document.getElementById("restockStockUnit");

    const ratio = parseFloat(data.unitsPerPack) || 1;
    const stock = parseInt(data.stock, 10) || 0;
    const unit = data.unit || "u";
    const stockUnit = data.stockUnit || "pack";

    if (idInput) idInput.value = data.id || "";
    if (nameDisplay) nameDisplay.textContent = data.name || "-";
    if (stockDisplay) {
      stockDisplay.textContent = `${stock.toLocaleString()} ${unit}`;
      stockDisplay.setAttribute("data-raw-stock", stock);
    }
    if (packsDisplay) {
      packsDisplay.textContent = ratio > 1 ? `(~${(stock / ratio).toFixed(2)} ${stockUnit})` : "";
    }
    if (unitsPerPackInput) unitsPerPackInput.value = ratio;
    if (unitInput) unitInput.value = unit;
    if (stockUnitInput) stockUnitInput.value = stockUnit;

    // Update labels in delivery modal
    const labelModePacks = document.getElementById("labelModePacks");
    const labelPackagesInput = document.getElementById("labelPackagesInput");
    const labelUnitsInput = document.getElementById("labelUnitsInput");

    if (labelModePacks) {
      labelModePacks.innerHTML = `<i class="fa-solid fa-box-archive me-1"></i> Par conditionnement (${stockUnit} de ${ratio} ${unit})`;
    }
    if (labelPackagesInput) {
      labelPackagesInput.textContent = `Nombre de ${stockUnit}(s) reçues`;
    }
    if (labelUnitsInput) {
      labelUnitsInput.textContent = `Quantité directe reçue (${unit})`;
    }

    const restockPackages = document.getElementById("restockPackages");
    const restockQuantity = document.getElementById("restockQuantity");
    if (restockPackages) restockPackages.value = 1;
    if (restockQuantity) restockQuantity.value = ratio;

    // Reset to packs mode
    const modePacks = document.getElementById("modePacks");
    if (modePacks) modePacks.checked = true;
    const divPacks = document.getElementById("divRestockPacks");
    const divUnits = document.getElementById("divRestockUnits");
    if (divPacks) divPacks.style.display = "";
    if (divUnits) divUnits.style.display = "none";

    updateRestockPreview();
  }

  // Delivery Mode Toggle listeners
  const modePacks = document.getElementById("modePacks");
  const modeUnits = document.getElementById("modeUnits");
  const divPacks = document.getElementById("divRestockPacks");
  const divUnits = document.getElementById("divRestockUnits");

  if (modePacks && modeUnits) {
    modePacks.addEventListener("change", function () {
      if (divPacks) divPacks.style.display = "";
      if (divUnits) divUnits.style.display = "none";
      updateRestockPreview();
    });
    modeUnits.addEventListener("change", function () {
      if (divPacks) divPacks.style.display = "none";
      if (divUnits) divUnits.style.display = "";
      updateRestockPreview();
    });
  }

  const restockPackages = document.getElementById("restockPackages");
  const restockQuantity = document.getElementById("restockQuantity");
  if (restockPackages) restockPackages.addEventListener("input", updateRestockPreview);
  if (restockQuantity) restockQuantity.addEventListener("input", updateRestockPreview);

  // 3. Delegated click handlers
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
        unit: editBtn.getAttribute("data-unit") || "u",
        stockUnit: editBtn.getAttribute("data-stock-unit") || "pack",
        unitsPerPack: editBtn.getAttribute("data-units-per-pack") || "1",
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
        unit: restockBtn.getAttribute("data-unit") || "u",
        stockUnit: restockBtn.getAttribute("data-stock-unit") || "pack",
        unitsPerPack: restockBtn.getAttribute("data-units-per-pack") || "1",
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
          unit: btn.getAttribute("data-unit") || "u",
          stockUnit: btn.getAttribute("data-stock-unit") || "pack",
          unitsPerPack: btn.getAttribute("data-units-per-pack") || "1",
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
          unit: btn.getAttribute("data-unit") || "u",
          stockUnit: btn.getAttribute("data-stock-unit") || "pack",
          unitsPerPack: btn.getAttribute("data-units-per-pack") || "1",
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
