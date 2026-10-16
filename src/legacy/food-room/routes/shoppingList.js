// Shopping List endpoints as a separate router
const express = require('express');
const router = express.Router();
const pool = require('../db');

function formatQty(value) {
  if (!Number.isFinite(value)) return '';
  if (Number.isInteger(value)) return value;
  return Math.round(value * 1000) / 1000;
}

function normalizeUnit(unit) {
  const u = String(unit || '').trim().toLowerCase();
  if (!u) return '';
  if (['cup', 'cups'].includes(u)) return 'cup';
  if (['tablespoons', 'tablespoon', 'tbsp', 'tbs', 'tblsp'].includes(u)) return 'tbsp';
  if (['teaspoons', 'teaspoon', 'tsp'].includes(u)) return 'tsp';
  if (['gram', 'grams', 'g'].includes(u)) return 'g';
  if (['kilogram', 'kilograms', 'kg'].includes(u)) return 'kg';
  if (['milliliter', 'milliliters', 'millilitre', 'millilitres', 'ml'].includes(u)) return 'ml';
  if (['liter', 'liters', 'litre', 'litres', 'l'].includes(u)) return 'l';
  return u;
}

function normalizeIngredientKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function toCanonicalQty(qtyValue, unitValue) {
  const qty = Number(qtyValue);
  if (!Number.isFinite(qty)) {
    return { qty: NaN, unit: normalizeUnit(unitValue), family: normalizeUnit(unitValue) };
  }

  const unit = normalizeUnit(unitValue);
  if (unit === 'tbsp') {
    return { qty: qty * 3, unit: 'tsp', family: 'spoon' };
  }
  if (unit === 'tsp') {
    return { qty, unit: 'tsp', family: 'spoon' };
  }

  return { qty, unit, family: unit };
}

// Generate shopping list grouped by category for selected bookings
router.get('/by_category', async function(req, res) {
  let bookingIds = req.query.booking_ids;
  if (!bookingIds) {
    return res.status(400).json({ success: false, error: 'No booking_ids provided.' });
  }
  if (typeof bookingIds === 'string') {
    bookingIds = bookingIds.split(',').map(id => id.trim()).filter(Boolean);
  }
  const placeholders = bookingIds.map((_, i) => `$${i + 1}`).join(',');
  const dsiSql = `
    WITH selected_bookings AS (
      SELECT
        b.id AS booking_id,
        b.recipe_id
      FROM bookings b
      WHERE b.id IN (${placeholders})
    )
    SELECT
      dsi.ingredient_name,
      dsi.fooditem,
      dsi.measure_qty,
      dsi.measure_unit,
      dsi.stripfooditem,
      dsi.calculated_qty,
      COALESCE(ac.name, '') AS aisle_category_name
    FROM desired_servings_ingredients dsi
    INNER JOIN selected_bookings sb ON sb.booking_id = dsi.booking_id
    LEFT JOIN aisle_category ac ON ac.id = dsi.aisle_category_id
  `;
  const fallbackSql = `
    WITH selected_bookings AS (
      SELECT
        b.id AS booking_id,
        b.recipe_id
      FROM bookings b
      WHERE b.id IN (${placeholders})
    )
    SELECT
      inv.ingredient_name,
      inv.fooditem,
      inv.measure_qty,
      inv.measure_unit,
      inv.stripfooditem,
      NULL::numeric AS calculated_qty,
      COALESCE(ac.name, '') AS aisle_category_name
    FROM selected_bookings sb
    INNER JOIN ingredients_inventory inv
      ON btrim(COALESCE(inv.recipe_id::text, '')) = btrim(COALESCE(sb.recipe_id::text, ''))
    LEFT JOIN aisle_category ac ON ac.id::text = inv.aisle_category_id::text
    WHERE NOT EXISTS (
      SELECT 1
      FROM desired_servings_ingredients d
      WHERE d.booking_id = sb.booking_id
    )
  `;
  try {
    const [dsiResult, fallbackResult] = await Promise.all([
      pool.query(dsiSql, bookingIds),
      pool.query(fallbackSql, bookingIds)
    ]);
    const rows = [...(dsiResult.rows || []), ...(fallbackResult.rows || [])];
    const brandsResult = await pool.query('SELECT brand_name FROM food_brands');
    const brands = (brandsResult.rows || []).map(b => b.brand_name);

    function stripFoodItemBackend(name) {
      let stripped = (name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
      brands.forEach(brand => {
        const re = new RegExp('^' + brand.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") + "('?s)?\\s+", 'i');
        stripped = stripped.replace(re, '');
      });
      return stripped.trim();
    }

    const categories = {
      'Produce': ['apple', 'cauliflower', 'pepper', 'carrot', 'lettuce', 'onion', 'potato', 'tomato', 'fruit', 'vegetable'],
      'Dairy': ['milk', 'cheese', 'butter', 'cream', 'yogurt'],
      'Pantry': ['flour', 'sugar', 'salt', 'baking', 'chocolate', 'oats', 'breadcrumbs', 'vanilla', 'spice', 'oil', 'vinegar', 'yeast', 'rice', 'pasta'],
      'Other': []
    };
    function categorize(item) {
      const aisleName = String(item.aisle_category_name || '').trim();
      if (aisleName) {
        const normalizedAisle = aisleName.toLowerCase();
        if (normalizedAisle === 'produce') return 'Produce';
        if (normalizedAisle === 'dairy') return 'Dairy';
        if (normalizedAisle === 'pantry') return 'Pantry';
        if (normalizedAisle === 'other') return 'Other';
      }

      const name = String(item.stripfooditem || item.fooditem || item.ingredient_name || '').toLowerCase();
      for (const [cat, keywords] of Object.entries(categories)) {
        if (keywords.some(word => name.includes(word))) return cat;
      }
      return 'Other';
    }

    const combined = {};
    rows.forEach(row => {
      if (String(row.aisle_category_name || '').trim().toLowerCase() === 'action') return;
      const cat = categorize(row);
      if (!combined[cat]) combined[cat] = {};
      const key = stripFoodItemBackend(row.stripfooditem || row.fooditem || row.ingredient_name || '').trim();
      if (!key) return;
      if (!combined[cat][key]) {
        combined[cat][key] = { qty: 0, unit: row.measure_unit || '', display: key };
      }
      let addQty = parseFloat(row.calculated_qty) || parseFloat(row.measure_qty) || 0;
      if (!isNaN(addQty)) combined[cat][key].qty += addQty;
      if (row.measure_unit && !combined[cat][key].unit) combined[cat][key].unit = row.measure_unit;
    });

    const result = {};
    for (const cat of Object.keys(categories)) {
      result[cat] = Object.values(combined[cat] || {})
        .map(item => ({ display: item.display, qty: item.qty, unit: item.unit }))
        .sort((a, b) => String(a.display || '').localeCompare(String(b.display || ''), undefined, { sensitivity: 'base' }));
    }
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Generate shopping list by category from ingredients_inventory only (no DSI/calculated quantities)
router.get('/by_category_inventory', async function(req, res) {
  let bookingIds = req.query.booking_ids;
  if (!bookingIds) {
    return res.status(400).json({ success: false, error: 'No booking_ids provided.' });
  }
  if (typeof bookingIds === 'string') {
    bookingIds = bookingIds.split(',').map(id => id.trim()).filter(Boolean);
  }
  const placeholders = bookingIds.map((_, i) => `$${i + 1}`).join(',');
  const inventorySql = `
    WITH selected_bookings AS (
      SELECT
        b.id AS booking_id,
        b.recipe_id
      FROM bookings b
      WHERE b.id IN (${placeholders})
    )
    SELECT
      inv.ingredient_name,
      inv.fooditem,
      inv.measure_qty,
      inv.measure_unit,
      inv.stripfooditem,
      COALESCE(ac.name, '') AS aisle_category_name
    FROM selected_bookings sb
    INNER JOIN ingredients_inventory inv
      ON btrim(COALESCE(inv.recipe_id::text, '')) = btrim(COALESCE(sb.recipe_id::text, ''))
    LEFT JOIN aisle_category ac ON ac.id::text = inv.aisle_category_id::text
  `;

  try {
    const inventoryResult = await pool.query(inventorySql, bookingIds);
    const rows = inventoryResult.rows || [];
    const brandsResult = await pool.query('SELECT brand_name FROM food_brands');
    const brands = (brandsResult.rows || []).map(b => b.brand_name);

    function stripFoodItemBackend(name) {
      let stripped = (name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
      brands.forEach(brand => {
        const re = new RegExp('^' + brand.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") + "('?s)?\\s+", 'i');
        stripped = stripped.replace(re, '');
      });
      return stripped.trim();
    }

    const categories = {
      'Produce': ['apple', 'cauliflower', 'pepper', 'carrot', 'lettuce', 'onion', 'potato', 'tomato', 'fruit', 'vegetable'],
      'Dairy': ['milk', 'cheese', 'butter', 'cream', 'yogurt'],
      'Pantry': ['flour', 'sugar', 'salt', 'baking', 'chocolate', 'oats', 'breadcrumbs', 'vanilla', 'spice', 'oil', 'vinegar', 'yeast', 'rice', 'pasta'],
      'Other': []
    };

    function categorize(item) {
      const aisleName = String(item.aisle_category_name || '').trim();
      if (aisleName) {
        const normalizedAisle = aisleName.toLowerCase();
        if (normalizedAisle === 'produce') return 'Produce';
        if (normalizedAisle === 'dairy') return 'Dairy';
        if (normalizedAisle === 'pantry') return 'Pantry';
        if (normalizedAisle === 'other') return 'Other';
      }

      const name = String(item.stripfooditem || item.fooditem || item.ingredient_name || '').toLowerCase();
      for (const [cat, keywords] of Object.entries(categories)) {
        if (keywords.some(word => name.includes(word))) return cat;
      }
      return 'Other';
    }

    const combined = {};
    rows.forEach(row => {
      if (String(row.aisle_category_name || '').trim().toLowerCase() === 'action') return;
      const cat = categorize(row);
      if (!combined[cat]) combined[cat] = {};
      const key = stripFoodItemBackend(row.stripfooditem || row.fooditem || row.ingredient_name || '').trim();
      if (!key) return;
      if (!combined[cat][key]) {
        combined[cat][key] = { qty: 0, unit: row.measure_unit || '', display: key };
      }
      const addQty = parseFloat(row.measure_qty) || 0;
      if (!isNaN(addQty)) combined[cat][key].qty += addQty;
      if (row.measure_unit && !combined[cat][key].unit) combined[cat][key].unit = row.measure_unit;
    });

    const result = {};
    for (const cat of Object.keys(categories)) {
      result[cat] = Object.values(combined[cat] || {})
        .map(item => ({ display: item.display, qty: item.qty, unit: item.unit }))
        .sort((a, b) => String(a.display || '').localeCompare(String(b.display || ''), undefined, { sensitivity: 'base' }));
    }
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Generate shopping list grouped by teacher for selected bookings
router.get('/by_teacher', async (req, res) => {
  let bookingIds = req.query.booking_ids;
  if (!bookingIds) {
    return res.status(400).json({ success: false, error: 'No booking_ids provided.' });
  }
  if (typeof bookingIds === 'string') {
    bookingIds = bookingIds.split(',').map(id => id.trim()).filter(Boolean);
  }
  const placeholders = bookingIds.map((_, i) => `$${i + 1}`).join(',');
  const dsiSql = `
    WITH selected_bookings AS (
      SELECT
        b.id AS booking_id,
        b.recipe_id,
        b.staff_id,
        b.staff_name
      FROM bookings b
      WHERE b.id IN (${placeholders})
    )
    SELECT
      dsi.staff_id::text AS staff_id,
      dsi.teacher::text AS teacher,
      dsi.ingredient_name,
      dsi.measure_qty,
      dsi.measure_unit,
      dsi.fooditem,
      dsi.stripfooditem,
      dsi.calculated_qty,
      COALESCE(ac.name, '') AS aisle_category_name
    FROM desired_servings_ingredients dsi
    INNER JOIN selected_bookings sb ON sb.booking_id = dsi.booking_id
    LEFT JOIN aisle_category ac ON ac.id = dsi.aisle_category_id
  `;
  const fallbackSql = `
    WITH selected_bookings AS (
      SELECT
        b.id AS booking_id,
        b.recipe_id,
        b.staff_id,
        b.staff_name
      FROM bookings b
      WHERE b.id IN (${placeholders})
    )
    SELECT
      sb.staff_id::text AS staff_id,
      sb.staff_name::text AS teacher,
      inv.ingredient_name,
      inv.measure_qty,
      inv.measure_unit,
      inv.fooditem,
      inv.stripfooditem,
      NULL::numeric AS calculated_qty,
      COALESCE(ac.name, '') AS aisle_category_name
    FROM selected_bookings sb
    INNER JOIN ingredients_inventory inv
      ON btrim(COALESCE(inv.recipe_id::text, '')) = btrim(COALESCE(sb.recipe_id::text, ''))
    LEFT JOIN aisle_category ac ON ac.id::text = inv.aisle_category_id::text
    WHERE NOT EXISTS (
      SELECT 1
      FROM desired_servings_ingredients d
      WHERE d.booking_id = sb.booking_id
    )
  `;
  try {
    const [dsiResult, fallbackResult] = await Promise.all([
      pool.query(dsiSql, bookingIds),
      pool.query(fallbackSql, bookingIds)
    ]);
    const rows = [...(dsiResult.rows || []), ...(fallbackResult.rows || [])];
    const grouped = {};
    rows.forEach(row => {
      if (String(row.aisle_category_name || '').trim().toLowerCase() === 'action') return;
      const teacherKey = row.staff_id ? `Staff ${row.staff_id} - ${row.teacher}` : row.teacher;
      if (!grouped[teacherKey]) grouped[teacherKey] = {};

      const displayIngredient = (row.stripfooditem || row.fooditem || row.ingredient_name || '').trim();
      if (!displayIngredient) return;

      const qtyCanonical = toCanonicalQty(row.measure_qty, row.measure_unit);
      const calcCanonical = toCanonicalQty(row.calculated_qty, row.measure_unit);
      const unitKey = qtyCanonical.family || normalizeUnit(row.measure_unit) || '';
      const itemKey = `${normalizeIngredientKey(displayIngredient)}||${unitKey}`;

      if (!grouped[teacherKey][itemKey]) {
        grouped[teacherKey][itemKey] = {
          ingredient: displayIngredient,
          qty: 0,
          unit: qtyCanonical.unit || row.measure_unit || '',
          fooditem: row.fooditem,
          stripFoodItem: row.stripfooditem,
          calculated_qty: 0,
          staff_id: row.staff_id
        };
      }

      if (!Number.isNaN(qtyCanonical.qty)) grouped[teacherKey][itemKey].qty += qtyCanonical.qty;
      if (!Number.isNaN(calcCanonical.qty)) grouped[teacherKey][itemKey].calculated_qty += calcCanonical.qty;
      if (!grouped[teacherKey][itemKey].unit && (qtyCanonical.unit || row.measure_unit)) {
        grouped[teacherKey][itemKey].unit = qtyCanonical.unit || row.measure_unit;
      }
    });

    const result = {};
    Object.keys(grouped).forEach(teacherKey => {
      result[teacherKey] = Object.values(grouped[teacherKey]).sort((a, b) =>
        String(a.ingredient || '').localeCompare(String(b.ingredient || ''))
      ).map(item => ({
        ...item,
        qty: formatQty(item.qty),
        calculated_qty: formatQty(item.calculated_qty)
      }));
    });

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
