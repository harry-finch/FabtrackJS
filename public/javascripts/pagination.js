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
      for (var col in item) {
        const newCell = row.insertCell();
        newCell.innerHTML = item[col];
        headerClassList[i].value
          ? newCell.classList.add(headerClassList[i].value)
          : console.log("no class");
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
    loadTooltips();
  }

  showMoreButton.addEventListener("click", () => {
    currentPage++;
    displayData();
  });

  table.parentNode.insertBefore(showMoreButton, table.nextSibling); // Insert button after the table

  // Initial display
  displayData();
}
