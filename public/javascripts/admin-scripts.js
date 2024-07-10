async function deleteStaff(id) {
  let url = window.location.origin + "/admin/staff/delete/" + id;
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      "Content-type": "application/json",
    },
  });
  location.reload();
  showNotification();
}

async function enableStaff(id) {
  let url = window.location.origin + "/admin/staff/enable/" + id;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-type": "application/json",
    },
  });
  location.reload();
  showNotification();
}

async function disableStaff(id) {
  let url = window.location.origin + "/admin/staff/disable/" + id;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-type": "application/json",
    },
  });
  location.reload();
  showNotification();
}

async function makeStaffAdmin(id) {
  let url = window.location.origin + "/admin/staff/promote/" + id;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-type": "application/json",
    },
  });
  location.reload();
  showNotification();
}

async function makeStaffUser(id) {
  let url = window.location.origin + "/admin/staff/demote/" + id;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-type": "application/json",
    },
  });
  location.reload();
  showNotification();
}

async function deleteType(id) {
  let url = window.location.origin + "/admin/usertypes/delete/" + id;
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      "Content-type": "application/json",
    },
  });
  location.reload();
  showNotification();
}

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
