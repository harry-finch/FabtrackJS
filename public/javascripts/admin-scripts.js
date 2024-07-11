async function deleteUser(id) {
  let url = window.location.origin + "/users/delete/" + id;
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      "Content-type": "application/json",
    },
  });
  location.reload();
  showNotification();
}

async function sendMailAgain(mail) {}
