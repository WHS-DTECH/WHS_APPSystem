// Food Brands CRUD endpoints as a separate router
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:password@host:port/db?sslmode=require';
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

function normalizeBrandName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function isUniqueViolation(err) {
  return err && err.code === '23505';
}

// Get all food brands
router.get('/', async (req, res) => {
  console.log('GET /api/food_brands called');
  try {
    const result = await pool.query('SELECT * FROM food_brands ORDER BY id');
    console.log('food_brands query result:', result.rows);
    res.json({ success: true, brands: result.rows });
  } catch (err) {
    console.error('FoodBrands GET error:', err);
    res.status(500).json({ success: false, error: 'Failed to load food brands' });
  }
});

// Add a new food brand
router.post('/', async (req, res) => {
  const normalizedName = normalizeBrandName(req.body && req.body.brand_name);
  if (!normalizedName) {
    return res.status(400).json({ success: false, error: 'Brand name required' });
  }

  try {
    const duplicate = await pool.query(
      'SELECT id, brand_name FROM food_brands WHERE LOWER(TRIM(brand_name)) = LOWER(TRIM($1)) LIMIT 1',
      [normalizedName]
    );

    if (duplicate.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'That food brand already exists',
        id: duplicate.rows[0].id,
        brand_name: duplicate.rows[0].brand_name,
      });
    }

    const result = await pool.query(
      'INSERT INTO food_brands (brand_name) VALUES ($1) RETURNING id, brand_name',
      [normalizedName]
    );

    return res.json({ success: true, ...result.rows[0] });
  } catch (err) {
    console.error('FoodBrands POST error:', err);

    if (isUniqueViolation(err)) {
      return res.status(409).json({ success: false, error: 'That food brand already exists' });
    }

    return res.status(500).json({ success: false, error: 'Failed to add food brand' });
  }
});

// Edit a food brand
router.put('/:id', async (req, res) => {
  const normalizedName = normalizeBrandName(req.body && req.body.brand_name);
  const { id } = req.params;

  if (!normalizedName) {
    return res.status(400).json({ success: false, error: 'Brand name required' });
  }

  try {
    const duplicate = await pool.query(
      'SELECT id FROM food_brands WHERE LOWER(TRIM(brand_name)) = LOWER(TRIM($1)) AND id <> $2 LIMIT 1',
      [normalizedName, id]
    );

    if (duplicate.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'That food brand already exists' });
    }

    const result = await pool.query(
      'UPDATE food_brands SET brand_name = $1 WHERE id = $2 RETURNING id, brand_name',
      [normalizedName, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Food brand not found' });
    }

    return res.json({ success: true, ...result.rows[0] });
  } catch (err) {
    console.error('FoodBrands PUT error:', err);

    if (isUniqueViolation(err)) {
      return res.status(409).json({ success: false, error: 'That food brand already exists' });
    }

    return res.status(500).json({ success: false, error: 'Failed to update food brand' });
  }
});

// Delete a food brand
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM food_brands WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('FoodBrands DELETE error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete food brand' });
  }
});

module.exports = router;
