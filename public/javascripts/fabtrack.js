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
      document.getElementById("projecttype").selectedIndex = item.type;

      const foundElem = userprojects.find(
        (elem) => elem.userid === Number(document.getElementById("userid").value) && elem.projectid === item.id,
      );
      document.getElementById("userprojectid").value = foundElem ? foundElem.id : "null";
    },
  });
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
    modalLink.href = "warning/deactivate/" + warningid;
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

// Add an event listener to the dropdown to capture the selected cost
const consumableSelect = document.getElementById("consumable");
consumableSelect.addEventListener("change", () => {
  const selectedOption = consumableSelect.options[consumableSelect.selectedIndex];
  const selectedCost = selectedOption.dataset.cost;

  // Store the selected cost in a hidden input field within your form
  const costInput = document.getElementById("cost"); // Assuming you have a hidden input with id="cost"
  costInput.value = selectedCost;
});
