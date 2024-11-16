const workspaceLinks = document.getElementsByClassName("workspace-link");

// Iterate through the workspace links and attach event listeners
Array.from(workspaceLinks).forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault(); // Prevent default link behavior

    const selectedWorkspaceId = link.dataset.workspaceid;

    fetch("/fabtrack/switchworkspace", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ workspaceId: selectedWorkspaceId }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        // Optionally, reload the page or update specific parts of the UI
        location.reload();
      })
      .catch((error) => {
        console.error("Error switching workspace:", error);
        // Handle the error gracefully
      });
  });
});
