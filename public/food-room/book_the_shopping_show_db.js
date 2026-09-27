// Scroll to and highlight the first row in the DB table with matching booking_id
window.scrollToDesiredServingsRow = function(bookingId) {
  const table = document.querySelector('#desired-servings-ingredients-table-container table');
  if (!table) return;
  const rows = Array.from(table.querySelectorAll('tbody tr'));
  let found = false;
  for (const row of rows) {
    const cell = row.querySelector('td');
    if (cell && cell.textContent == bookingId) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.style.transition = 'background 0.7s';
      row.style.background = '#fff59d';
      setTimeout(() => { row.style.background = ''; }, 1200);
      found = true;
      break;
    }
  }
  if (!found) {
    alert('No matching row found in Desired Servings Ingredients table for booking_id ' + bookingId);
  }
};
// book_the_shopping_show_db.js
// Show all rows from desired_servings_ingredients at the bottom of the Book the Shopping page


// Debug DB table rendering removed.