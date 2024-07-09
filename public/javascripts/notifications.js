function showNotification() {
  const toastLiveMessage = document.getElementById("liveToastMessage");
  const toastBootstrap = bootstrap.Toast.getOrCreateInstance(toastLiveMessage);
  const notificationType = document
    .getElementsByClassName("toast-body")[0]
    .innerHTML.split(":")[0];

  switch (notificationType) {
    case "Error":
      toastLiveMessage.classList.remove("text-bg-secondary");
      toastLiveMessage.classList.add("text-bg-danger");
      toastBootstrap.show();
      break;

    case "Warning":
      toastLiveMessage.classList.remove("text-bg-secondary");
      toastLiveMessage.classList.add("text-bg-warning");
      toastBootstrap.show();
      break;

    case "Success":
      toastLiveMessage.classList.remove("text-bg-success");
      toastLiveMessage.classList.add("text-bg-danger");
      toastBootstrap.show();
      break;
  }
}

showNotification();
