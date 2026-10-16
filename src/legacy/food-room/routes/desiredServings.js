const express = require('express');
const router = express.Router();
const pool = require('../db');

function normalize(str) {
  return (str || '').toLowerCase().trim();
}

function stripFoodItemBackend(name, brands) {
  let stripped = (name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  (brands || []).forEach(brand => {
    const re = new RegExp('^' + String(brand || '').replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") + "('?s)?\\s+", 'i');
    stripped = stripped.replace(re, '');
  });
  return stripped.trim();
}

async function saveDesiredServingsPayload(payload) {
  let { booking_id, teacher, staff_id, class_name, class_date, class_size, groups, desired_servings, recipe_id, ingredients } = payload || {};
  if (class_name && class_name.includes('|')) {
    const parts = class_name.split('|').map(s => s.trim());
    class_name = parts[0];
    if (parts[1] && parts[1].startsWith('[ID:')) {
      const match = parts[1].match(/\[ID: (\d+)\]/);
      if (match) recipe_id = match[1];
    }
    if (parts[2]) {
      class_date = class_date || parts[2];
    }
  }
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    throw new Error('No ingredients provided.');
  }

  // Delete existing rows for this booking+recipe to prevent duplicates on re-save
  let delSql = 'DELETE FROM desired_servings_ingredients WHERE 1=1';
  const delParams = [];
  if (booking_id != null) { delParams.push(booking_id); delSql += ` AND booking_id = $${delParams.length}`; }
  if (recipe_id != null) { delParams.push(recipe_id); delSql += ` AND recipe_id = $${delParams.length}`; }
  await pool.query(delSql, delParams);

  // Load brands and inventory for lookups
  const brandsResult = await pool.query('SELECT brand_name FROM food_brands');
  const brands = (brandsResult.rows || []).map(b => b.brand_name);

  const invResult = await pool.query('SELECT id, ingredient_name, fooditem, stripfooditem, aisle_category_id FROM ingredients_inventory');
  const invRows = invResult.rows;

  const insertSql = `
    INSERT INTO desired_servings_ingredients
      (booking_id, teacher, staff_id, class_name, class_date, class_size, groups, desired_servings, recipe_id,
       ingredient_id, ingredient_name, measure_qty, measure_unit, fooditem, calculated_qty, stripfooditem, aisle_category_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
  `;

  let inserted = 0;
  let failed = 0;

  for (const ing of ingredients) {
    let row = null;
    if (ing.ingredient_id) {
      row = invRows.find(r => r.id == ing.ingredient_id) || null;
    }
    if (!row) {
      row = invRows.find(r =>
        normalize(r.ingredient_name) === normalize(ing.ingredient_name) ||
        normalize(r.fooditem) === normalize(ing.fooditem)
      ) || null;
    }
    if (!row) {
      row = invRows.find(r =>
        normalize(r.ingredient_name).includes(normalize(ing.ingredient_name)) ||
        normalize(r.fooditem).includes(normalize(ing.fooditem))
      ) || null;
    }

    let rawName = '';
    let aisleCategoryIdValue = null;
    if (row) {
      rawName = row.stripfooditem || ing.stripFoodItem || ing.fooditem || ing.ingredient_name || '';
      aisleCategoryIdValue = row.aisle_category_id || ing.aisle_category_id || null;
    } else {
      rawName = ing.stripFoodItem || ing.fooditem || ing.ingredient_name || '';
      aisleCategoryIdValue = ing.aisle_category_id || null;
    }
    const stripFoodItemValue = stripFoodItemBackend(rawName, brands);

    const values = [
      booking_id, teacher, staff_id || null, class_name, class_date, class_size, groups, desired_servings, recipe_id || null,
      (row ? row.id : ing.ingredient_id) || null,
      ing.ingredient_name || '',
      ing.measure_qty || '',
      ing.measure_unit || '',
      ing.fooditem || '',
      ing.calculated_qty || '',
      stripFoodItemValue,
      aisleCategoryIdValue || null
    ];
    try {
      await pool.query(insertSql, values);
      inserted++;
    } catch (insertErr) {
      console.error('[desiredServings] insert error:', insertErr.message);
      failed++;
    }
  }

  return { success: failed === 0, inserted, failed };
}

// GET /desired_servings_ingredients
router.get('/', async (req, res) => {
  const booking_id = req.query.booking_id;
  let sql = 'SELECT dsi.*, COALESCE(ac.name, \'\') AS aisle_category_name FROM desired_servings_ingredients dsi LEFT JOIN aisle_category ac ON ac.id = dsi.aisle_category_id';
  const params = [];
  if (booking_id) {
    sql += ' WHERE dsi.booking_id = $1';
    params.push(booking_id);
  }
  sql += ' ORDER BY dsi.created_at DESC, dsi.id DESC';
  try {
    const { rows } = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /desired_servings_ingredients/save
router.post('/save', async (req, res) => {
  try {
    const result = await saveDesiredServingsPayload(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /desired_servings_ingredients/all
router.delete('/all', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM desired_servings_ingredients');
    res.json({ success: true, deleted: result.rowCount || 0 });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
module.exports.saveDesiredServingsPayload = saveDesiredServingsPayload;
