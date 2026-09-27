// Normalize condensed milk ingredient: convert fraction/range to 1, unit to 'tin', name to '420g condensed milk'
function normalizeCondensedMilk(ingredient) {
  if (/condensed milk/i.test(ingredient.name)) {
    let qty = ingredient.quantity;
    // Convert vulgar fractions to decimal
    const vulgarMap = { '¼': 0.25, '½': 0.5, '¾': 0.75 };
    qty = (qty || '').replace(/[¼½¾]/g, m => vulgarMap[m] || m);
    // If range, take the upper value
    if (qty && qty.includes('-')) {
      qty = qty.split('-').pop();
    }
    // Parse as float and round up
    let num = Math.ceil(parseFloat(qty));
    if (isNaN(num) || num < 1) num = 1;
    return {
      quantity: num,
      unit: 'tin',
      name: '420g condensed milk'
    };
  }
  return ingredient;
}
// Utility to strip trailing (weight) from food item names
function stripFoodItem(name) {
  // Remove any parenthesis and content at the end, e.g. (450g), (310ml), (optional), etc.
  let stripped = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
  // Remove leading brands (add more as needed)
  const brands = [
    /^meadow\s+fresh\s+/i,
    /^edmonds\s+/i,
    /^chelsea\s+/i,
    /^anchor\s+/i,
    /^pams\s+/i,
    /^fresha\s+/i,
    /^wattie's\s+/i,
    /^homebrand\s+/i
  ];
  brands.forEach(re => {
    stripped = stripped.replace(re, '');
  });
  return stripped.trim();
}
// Ingredient parsing and sync logic for Ingredients Directory

function parseIngredient(ingredientStr) {
  // Handles cases like '2eggs', '24Malt biscuits', '16marshmallows (best to use Explorer lollies)', '2 eggs', etc.
  // Try: [number][optional unit][optional space][food item]
  let match = ingredientStr.match(/^\s*([\d¼½¾\.\/]+)\s*([a-zA-Z]+)?\s+(.*)$/);
  let parsed;
  if (match) {
    parsed = {
      quantity: (match[1] || '').trim(),
      unit: (match[2] || '').trim(),
      name: (match[3] || '').trim()
    };
    return normalizeCondensedMilk(parsed);
  }
  // Try: [number][food item with possible parenthesis] (no space, e.g. '16marshmallows (best to use Explorer lollies)')
  match = ingredientStr.match(/^\s*([\d¼½¾\.\/]+)([a-zA-Z]+(\s*\([^)]*\))?.*)$/);
  if (match) {
    parsed = {
      quantity: (match[1] || '').trim(),
      unit: '',
      name: (match[2] || '').trim()
    };
    return normalizeCondensedMilk(parsed);
  }
  // Try: [number][unit][food item] (no space between number and unit, e.g. '2Tbsp sugar')
  match = ingredientStr.match(/^\s*([\d¼½¾\.\/]+)([a-zA-Z]+)\s+(.*)$/);
  if (match) {
    parsed = {
      quantity: (match[1] || '').trim(),
      unit: (match[2] || '').trim(),
      name: (match[3] || '').trim()
    };
    return normalizeCondensedMilk(parsed);
  }
  // Fallback: try to split first word as quantity if it's a number
  const parts = ingredientStr.trim().split(/\s+/);
  if (parts.length > 1 && /^\d+$/.test(parts[0])) {
    parsed = {
      quantity: parts[0],
      unit: '',
      name: parts.slice(1).join(' ')
    };
    return normalizeCondensedMilk(parsed);
  }
  parsed = { quantity: '', unit: '', name: ingredientStr };
  return normalizeCondensedMilk(parsed);
}

function parseAllIngredientsInTable() {
  // Find all rows in the ingredients table
  const table = document.querySelector('#ingredients-inventory-table table');
  if (!table) {
    alert('No ingredients table found.');
    return;
  }
  const rows = Array.from(table.querySelectorAll('tbody tr'));
  if (!rows.length) {
    alert('No ingredients to parse.');
    return;
  }
  // For each row, parse the ingredient name and update columns
  rows.forEach(row => {
    const nameCell = row.children[1];
    const quantityCell = row.children[2];
    const unitCell = row.children[3];
    if (!nameCell) return;
    const parsed = parseIngredient(nameCell.textContent.trim());
    nameCell.textContent = parsed.name;
    quantityCell.textContent = parsed.quantity;
    unitCell.textContent = parsed.unit;
  });
}

document.addEventListener('DOMContentLoaded', function() {
  const btn = document.getElementById('ingredientsParseBtn');
  if (btn) {
    btn.addEventListener('click', parseAllIngredientsInTable);
  }
});
