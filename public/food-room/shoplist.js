// --- Backend Integration Required ---
// Remove demo data. Fetch selected bookings, shopping list, and master shopping list from backend API when available.
// Example fetch (to be implemented):
// fetch('/api/shoplist').then(res => res.json()).then(data => { renderSelectedBookings(data.selected); renderShoppingList(data.shopping); renderMasterShoppingList(data.master); });

function renderSelectedBookings(selected = []) {
  const el = document.getElementById('selectedBookings');
  if (!selected.length) {
    el.innerHTML = '<span class="text-muted">No bookings selected.</span>';
    return;
  }
  el.innerHTML = selected.map(b => `${b.class} | ${b.recipe} | P${b.period} | ${b.date}`).join('<br>');
}

function renderShoppingList(list = []) {
  const el = document.getElementById('shoppingList');
  if (!list.length) {
    el.innerHTML = '<span class="text-muted">No shopping list items.</span>';
    return;
  }
  el.innerHTML = '<ul>' + list.map(i => `<li>${i}</li>`).join('') + '</ul>';
}

function renderMasterShoppingList(master = []) {
  const el = document.getElementById('masterShoppingList');
  if (!master.length) {
    el.innerHTML = '<span class="text-muted">No master shopping list items.</span>';
    return;
  }
  el.innerHTML = '<ul>' + master.map(i => `<li>${i}</li>`).join('') + '</ul>';
}

// Example usage (to be replaced with real data):
// renderSelectedBookings([]);
// renderShoppingList([]);
// renderMasterShoppingList([]);
