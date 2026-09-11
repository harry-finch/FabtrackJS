// Switching between registering and user creation forms
document.getElementById("registerbutton").addEventListener("click", (event) => {
  document.getElementById("newuser").style.display = "block";
  document.getElementById("register").style.display = "none";
});

document.getElementById("newuserbutton").addEventListener("click", (event) => {
  document.getElementById("newuser").style.display = "none";
  document.getElementById("register").style.display = "block";
});

(async () => {
  // Fetch the needed data from the API
  const response = await fetch("/api/list/autocomplete-lists");
  const data = await response.json();

  // User search autocomplete
  var nameInput = document.getElementById("name");
  var names = data.userlist;
  var allowedChars = new RegExp(/^[a-zA-Z\s]+$/);

  autocomplete({
    input: nameInput,
    minLength: 1,
    emptyMsg: "No names found",
    fetch: function (text, callback) {
      text = text.toLowerCase().trim();
      callback(
        names.filter(function (candidate) {
          return candidate.fullname.toLowerCase().indexOf(text) !== -1;
        }),
      );
    },
    render: function (item, value) {
      var itemElement = document.createElement("div");
      if (allowedChars.test(value)) {
        var regex = new RegExp(value, "gi");
        itemElement.innerHTML = item.fullname.replace(regex, function (match) {
          return `<strong>${match}</strong>`;
        });
      } else {
        itemElement.textContent = item.fullname;
      }
      return itemElement;
    },
    onSelect: function (item) {
      // When clicking, entering or tabbing on the selected name
      // set the value of the field and the user index field
      // as well as set the link to edit the user profile

      nameInput.value = item.fullname;
      document.getElementById("userid").value = item.id;
      document.getElementById("urlprofile").href = "/users/edit/" + item.id;
      console.log(item.projects);
    },
  });

  // Project documentation search autocomplete
  var docInput = document.getElementById("documentation");
  var projects = data.projectlist;
  var userprojects = data.userprojectlist;

  nameInput.addEventListener("change", () => {
    const userId = Number(document.getElementById("userid").value);

    // Update the 'group' property of projects based on user association
    projects.forEach((project) => {
      const isUserAssociated = userprojects.some((up) => up.userid === userId && up.projectid === project.id);
      project.group = isUserAssociated ? "current user projects" : "all other projects";
    });

    // Sort projects, placing 'user' projects first
    projects.sort((a, b) => {
      if (a.group === "current user projects" && b.group !== "current user projects") return -1;
      if (a.group !== "current user projects" && b.group === "current user projects") return 1;
      return a.id - b.id; // Secondary sort by ID or another stable property
    });

    // Manually update the autocomplete data
    docAutocomplete.data = projects;
  });

  const docAutocomplete = new autocomplete({
    input: docInput,
    showOnFocus: true,
    emptyMsg: "No documentation found, type new URL to create project",
    fetch: function (text, callback) {
      text = text.toLowerCase().trim();
      callback(
        projects.filter(function (candidate) {
          return candidate.url.toLowerCase().indexOf(text) !== -1;
        }),
      );
    },
    render: function (item, value) {
      var itemElement = document.createElement("div");
      if (allowedChars.test(value)) {
        var regex = new RegExp(value, "gi");
        itemElement.innerHTML = item.url.replace(regex, function (match) {
          return `<strong>${match}</strong>`;
        });
      } else {
        itemElement.textContent = item.url;
      }
      return itemElement;
    },
    onSelect: function (item) {
      // When clicking, entering or tabbing on the selected documentation
      // set the value of the field and the documentation index field
      // as well as set the link to documentation and the project type
      // and finally, also set the userproject combination

      docInput.value = item.url;
      document.getElementById("projectid").value = item.id;
      document.getElementById("urldocumentation").href = item.url;
      const projectTypeEl = document.getElementById("projecttype");
      if (projectTypeEl) {
        projectTypeEl.value = item.type;
        checkAcademicProjectType();
      }
      const ueSelect = document.getElementById("teachingUnitId");
      if (ueSelect && item.teachingUnitId) {
        ueSelect.value = item.teachingUnitId;
      }

      const foundElem = userprojects.find(
        (elem) => elem.userid === Number(document.getElementById("userid").value) && elem.projectid === item.id,
      );
      document.getElementById("userprojectid").value = foundElem ? foundElem.id : "null";
    },
  });

  // Dynamic appearance of Teaching Units (UE) field for academic projects
  const projectTypeSelect = document.getElementById("projecttype");
  const ueRow = document.getElementById("ueRow");
  const ueSelect = document.getElementById("teachingUnitId");

  function checkAcademicProjectType() {
    if (!projectTypeSelect || !ueRow) return;
    const selectedOpt = projectTypeSelect.options[projectTypeSelect.selectedIndex];
    const isAcademic =
      selectedOpt &&
      (selectedOpt.text.toLowerCase().includes("academic") ||
        selectedOpt.text.toLowerCase().includes("académique") ||
        selectedOpt.value === "2");

    if (isAcademic) {
      ueRow.style.display = "";
      if (ueSelect) ueSelect.setAttribute("required", "required");
    } else {
      ueRow.style.display = "none";
      if (ueSelect) {
        ueSelect.removeAttribute("required");
        ueSelect.value = "";
      }
    }
  }

  if (projectTypeSelect) {
    projectTypeSelect.addEventListener("change", checkAcademicProjectType);
  }
})();

const activityManager = document.getElementById("activityManager");
if (activityManager) {
  activityManager.addEventListener("show.bs.modal", (event) => {
    // Button that triggered the modal
    const button = event.relatedTarget;
    // Extract info from data-bs-* attributes
    const historyid = button.getAttribute("data-bs-historyid");
    const userid = button.getAttribute("data-bs-userid");
    const user = button.getAttribute("data-bs-user");

    // Update the modal's content.
    const modalTitle = activityManager.querySelector(".modal-title");
    const historyInput = document.getElementById("activityhistoryid");
    const userInput = document.getElementById("activityuserid");

    modalTitle.innerHTML = `<i class="fa-solid fa-puzzle-piece"></i> New activity for ${user}`;
    historyInput.value = historyid;
    userInput.value = userid;

    // Reset all selection inputs
    const machineSelect = document.getElementById("machineId");
    const equipmentSelect = document.getElementById("equipmentId");
    if (machineSelect) machineSelect.selectedIndex = 0;
    if (equipmentSelect) equipmentSelect.selectedIndex = 0;
    if (quantityInput) quantityInput.value = 1;
    clearConsumableSelection();
  });
}

const warningDeactivator = document.getElementById("warningDeactivator");
if (warningDeactivator) {
  warningDeactivator.addEventListener("show.bs.modal", (event) => {
    // Button that triggered the modal
    const button = event.relatedTarget;
    // Extract info from data-bs-* attributes
    const warningid = button.getAttribute("data-bs-warningid");
    const warninguser = button.getAttribute("data-bs-warninguser");
    const warningcomments = button.getAttribute("data-bs-warningcomments");
    const warningtype = button.getAttribute("data-bs-warningtype");

    // Update the modal's content.
    const modalTitle = warningDeactivator.querySelector(".modal-title");
    const modalCode = warningDeactivator.querySelector(".modal-body code");
    const modalLink = warningDeactivator.querySelector(".modal-footer a");

    modalTitle.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Warning for ${warninguser}</h5>`;
    modalCode.innerHTML = warningcomments;
    modalLink.href = "/warning/deactivate/" + warningid;
  });
}

const clearBalance = document.getElementById("clearBalance");
if (clearBalance) {
  clearBalance.addEventListener("show.bs.modal", (event) => {
    // Button that triggered the modal
    const button = event.relatedTarget;
    // Extract info from data-bs-* attributes
    const username = button.getAttribute("data-bs-username");
    const userid = button.getAttribute("data-bs-userid");
    const balance = button.getAttribute("data-bs-balance");

    // Update the modal's content.
    const modalTitle = clearBalance.querySelector(".modal-title");
    const modalCode = clearBalance.querySelector(".modal-body code");
    const modalLink = clearBalance.querySelector(".modal-footer a");

    modalTitle.innerHTML = `<i class="fa-solid fa-money-bill-wave"></i> Clear debt for ${username}</h5>`;
    modalCode.innerHTML = "User balance is " + balance + " €";
    modalLink.href = "/history/cleardebt/" + userid;
  });
}

// ==============================================================================
// Consumable Autocomplete & Live Estimation for Activity Manager
// ==============================================================================
const consumablesDataEl = document.getElementById("consumablesData");
let consumablesList = [];
if (consumablesDataEl) {
  try {
    consumablesList = JSON.parse(consumablesDataEl.textContent);
  } catch (e) {
    console.error("Failed to parse consumables JSON:", e);
  }
}

const consumableSearchInput = document.getElementById("consumableSearch");
const hiddenConsumableInput = document.getElementById("consumable");
const clearConsumableBtn = document.getElementById("clearConsumableBtn");
const quantityInput = document.getElementById("quantity");
const costInput = document.getElementById("cost");
const quantityLabel = document.getElementById("quantityLabel");
const liveCostRow = document.getElementById("consumableLiveCostRow");
const liveCostAmount = document.getElementById("liveCostAmount");
const liveUnitPrice = document.getElementById("liveUnitPrice");

let selectedConsumableItem = null;

function updateConsumableLiveCalc() {
  if (!selectedConsumableItem) {
    if (liveCostRow) liveCostRow.style.display = "none";
    if (quantityLabel) quantityLabel.textContent = "Quantité";
    if (costInput) costInput.value = "";
    return;
  }

  const unitCost = parseFloat(selectedConsumableItem.cost) || 0.0;
  const unit = selectedConsumableItem.unit || "u";
  const qty = parseFloat(quantityInput ? quantityInput.value : 1) || 0;

  if (costInput) costInput.value = unitCost;
  if (quantityLabel) quantityLabel.textContent = `Quantité (${unit})`;

  const total = (qty * unitCost).toFixed(2);
  if (liveCostAmount) liveCostAmount.textContent = `${total} €`;
  if (liveUnitPrice)
    liveUnitPrice.textContent = `${unitCost < 0.1 ? unitCost.toFixed(4) : unitCost.toFixed(2)} € / ${unit}`;
  if (liveCostRow) liveCostRow.style.display = "";
}

function clearConsumableSelection() {
  selectedConsumableItem = null;
  if (consumableSearchInput) consumableSearchInput.value = "";
  if (hiddenConsumableInput) hiddenConsumableInput.value = "";
  if (clearConsumableBtn) clearConsumableBtn.style.display = "none";
  updateConsumableLiveCalc();
}

if (clearConsumableBtn) {
  clearConsumableBtn.addEventListener("click", () => {
    clearConsumableSelection();
    if (consumableSearchInput) consumableSearchInput.focus();
  });
}

if (consumableSearchInput && typeof autocomplete === "function") {
  consumableSearchInput.addEventListener("input", () => {
    if (!consumableSearchInput.value.trim()) {
      clearConsumableSelection();
    }
  });

  autocomplete({
    input: consumableSearchInput,
    minLength: 0,
    showOnFocus: true,
    preventSubmit: 2, // Do not submit form on Enter when picking an item
    emptyMsg: "Aucun consommable trouvé",
    fetch: function (text, callback) {
      text = text.toLowerCase().trim();
      if (!text) {
        callback(consumablesList);
        return;
      }
      const filtered = consumablesList.filter(function (item) {
        const nameMatch = item.name && item.name.toLowerCase().indexOf(text) !== -1;
        const catMatch = item.categoryName && item.categoryName.toLowerCase().indexOf(text) !== -1;
        const unitMatch = item.unit && item.unit.toLowerCase().indexOf(text) !== -1;
        return nameMatch || catMatch || unitMatch;
      });
      callback(filtered);
    },
    render: function (item, value) {
      const itemElement = document.createElement("div");
      itemElement.className = "d-flex justify-content-between align-items-center py-2 px-2 border-bottom";

      const costNum = Number(item.cost);
      const costFormatted = costNum < 0.1 ? costNum.toFixed(4) : costNum.toFixed(2);

      let displayName = item.name;
      if (value && value.trim()) {
        try {
          const escaped = value.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const regex = new RegExp(`(${escaped})`, "gi");
          displayName = displayName.replace(regex, "<strong>$1</strong>");
        } catch (e) {
          displayName = item.name;
        }
      }

      const categoryBadge = item.categoryName
        ? `<span class="badge bg-secondary-subtle text-secondary-emphasis border me-1">${item.categoryName}</span>`
        : "";

      itemElement.innerHTML = `
        <div class="me-2 text-truncate">
          <div class="fw-semibold text-body">${displayName}</div>
          <div class="small text-muted">${categoryBadge}${costFormatted} € / ${item.unit}</div>
        </div>
        <div class="text-end text-nowrap ms-2">
          <span class="badge ${item.stock <= 0 ? "bg-danger-subtle text-danger" : "bg-light text-dark"} border">
            Stock: ${item.stock} ${item.unit}
          </span>
        </div>
      `;
      return itemElement;
    },
    onSelect: function (item) {
      consumableSearchInput.value = item.name;
      if (hiddenConsumableInput) hiddenConsumableInput.value = item.id;
      selectedConsumableItem = item;
      if (clearConsumableBtn) clearConsumableBtn.style.display = "inline-block";
      updateConsumableLiveCalc();
    },
  });
}

if (quantityInput) {
  quantityInput.addEventListener("input", updateConsumableLiveCalc);
}
