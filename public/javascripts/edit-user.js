document.getElementById("cancel").addEventListener("click", (event) => {
  history.back();
});

addPagination('historyTable', <%- JSON.stringify(tableData) %>);
