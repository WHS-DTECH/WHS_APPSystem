// --- Backend Integration Required ---
// Remove demo data. Fetch days, periods, and grid from backend API when available.
// Example fetch (to be implemented):
// fetch('/api/catering-grid').then(res => res.json()).then(data => renderCalendarGrid(data));

function renderCalendarGrid(days = [], periods = [], grid = []) {
  const table = document.getElementById('calendarGridTable');
  if (!days.length || !periods.length || !grid.length) {
    table.innerHTML = '<tr><td class="text-muted">No catering grid data found.</td></tr>';
    return;
  }
  let html = '<tr><th>Period / Day</th>' + days.map(d=>`<th>${d}</th>`).join('') + '</tr>';
  for (let p=0; p<periods.length; ++p) {
    html += `<tr><td>Period ${periods[p]}</td>`;
    for (let d=0; d<days.length; ++d) {
      const cell = grid[p][d];
      if (cell) {
        html += `<td><b>${cell.class}</b><br>${cell.recipe}<br><span style='font-size:0.95em;'>${cell.teacher}</span></td>`;
      } else {
        html += '<td></td>';
      }
    }
    html += '</tr>';
  }
  table.innerHTML = html;
}

function renderSelectedBooking() {
  document.getElementById('selectedBooking').innerHTML = `Class: 100HOSP<br>Teacher: Maryke Diplock<br>Recipe: Perfect Pavlova Recipe | Chelsea Sugar (ID: 77)<br>Serving Size: 12`;
}
function renderRecipeDetails() {
  document.getElementById('recipeDetails').innerHTML = `<a href="#">Perfect Pavlova Recipe | Chelsea Sugar (ID: 77)</a><br><b>Ingredients:</b><br>- No ingredients found.`;
}

// Example usage (to be replaced with real data):
// renderCalendarGrid([], [], []);
