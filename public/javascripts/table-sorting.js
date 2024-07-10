function sortTable(n) {
  var table,
    rows,
    switching,
    i,
    x,
    xTransformed,
    y,
    yTransformed,
    shouldSwitch,
    dir,
    switchcount = 0;

  table = document.querySelector("table");
  switching = true;
  const regex = new RegExp("^[0-9]+$");

  // Set the sorting direction to ascending:
  dir = "asc";

  // Make a loop that will continue until no switching has been done:
  while (switching) {
    // Start by saying: no switching is done:
    switching = false;
    rows = table.rows;

    // Loop through all table rows (except the first, which contains table headers):
    for (i = 1; i < rows.length - 1; i++) {
      // Start by saying there should be no switching:
      shouldSwitch = false;

      // Get the two elements you want to compare, one from current row and one from the next:
      x = rows[i].getElementsByTagName("TD")[n].innerHTML.trim();
      y = rows[i + 1].getElementsByTagName("TD")[n].innerHTML.trim();

      // Test if we're dealing with numbers or words
      if (regex.test(x)) {
        xTransformed = parseInt(x);
        yTransformed = parseInt(y);
      } else {
        xTransformed = x.toLowerCase();
        yTransformed = y.toLowerCase();
      }

      // Check if the two rows should switch place, based on the direction, asc or desc:
      if (dir == "asc") {
        if (xTransformed > yTransformed) {
          // If so, mark as a switch and break the loop:
          shouldSwitch = true;
          // console.log(xTransformed + " > " + yTransformed);
          break;
        }
      } else if (dir == "desc") {
        if (xTransformed < yTransformed) {
          // If so, mark as a switch and break the loop:
          shouldSwitch = true;
          // console.log(xTransformed + " < " + yTransformed);
          break;
        }
      }
    }

    if (shouldSwitch) {
      // If a switch has been marked, make the switch and mark that a switch has been done:
      rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
      switching = true;

      // Each time a switch is done, increase this count by 1:
      switchcount++;
    } else {
      // If no switching has been done AND the direction is "asc", set the direction to "desc" and run the while loop again.
      if (switchcount == 0 && dir == "asc") {
        dir = "desc";
        switching = true;
      }
    }
  }
}
