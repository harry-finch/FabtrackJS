async function deleteUser(id) {
  let url = "http://localhost:8080/users/delete/" + id;
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      "Content-type": "application/json",
    },
  });
  location.reload();
}

async function deleteBabyfoot(id) {
  let url = "http://localhost:8080/babyfoot/delete/" + id;
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      "Content-type": "application/json",
    },
  });
  location.reload();
}

async function endGame(id) {
  let url = "http://localhost:8080/game/end/" + id;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-type": "application/json",
    },
  });
  location.reload();
}
