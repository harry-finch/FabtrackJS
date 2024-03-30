async function deleteStaff(id) {
  let url = window.location.origin + "/staff/delete/" + id;
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      "Content-type": "application/json",
    },
  });
  location.reload();
}

async function enableStaff(id) {
  let url = window.location.origin + "/staff/enable/" + id;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-type": "application/json",
    },
  });
  location.reload();
}

async function disableStaff(id) {
  let url = window.location.origin + "/staff/disable/" + id;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-type": "application/json",
    },
  });
  location.reload();
}

async function makeStaffAdmin(id) {
  let url = window.location.origin + "/staff/promote/" + id;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-type": "application/json",
    },
  });
  location.reload();
}

async function makeStaffUser(id) {
  let url = window.location.origin + "/staff/demote/" + id;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-type": "application/json",
    },
  });
  location.reload();
}
