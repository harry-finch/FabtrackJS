function addPagination(tableId, data, itemsPerPage = 20) {
  const table = document.getElementById(tableId);
  const tableBody = table.querySelector("tbody");
  const showMoreButton = document.createElement("button");
  showMoreButton.textContent = "Show More";
  showMoreButton.classList.add("btn", "btn-secondary", "mt-3"); // Add Bootstrap classes for styling

  let currentPage = 1;

  function displayData() {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = data.slice(startIndex, endIndex);

    tableBody.innerHTML = ""; // Clear existing table content

    pageData.forEach((item) => {
      const row = tableBody.insertRow();
      // ... Populate table cells with item data (adapt to your specific table structure)
    });

    // Hide the button if there's no more data to load
    if (endIndex >= data.length) {
      showMoreButton.style.display = "none";
    } else {
      showMoreButton.style.display = "block";
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
