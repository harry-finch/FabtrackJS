module.exports = {
  userRow: function (userId, userName, userEmail) {
    return (
      "<tr><td>" + userName + "</td><td>" + userEmail + '</td><td><button onclick="deleteUser(' + userId + ')">SUPPR</button></td></tr>'
    );
  },

  babyfootRow: function (babyfootId, babyfootLocation) {
    return "<tr><td>" + babyfootLocation + '</td><td><button onclick="deleteBabyfoot(' + babyfootId + ')">SUPPR</button></td></tr>';
  },

  gameRow: function (gameId, babyfootLocation) {
    return "<tr><td>Partie en cours : " + babyfootLocation + '</td><td><button onclick="endGame(' + gameId + ')">END</button></td></tr>';
  },
};
