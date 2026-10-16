console.log("aisleCategory.js router loaded");

// Aisle Category CRUD endpoints using Postgres
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:password@host:port/db?sslmode=require';
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

let aisleCategorySchemaReady = false;
async function ensureAisleCategorySchema() {
  if (aisleCategorySchemaReady) return;
  await pool.query("ALTER TABLE aisle_category ADD COLUMN IF NOT EXISTS master_category TEXT");
  await pool.query("UPDATE aisle_category SET master_category = COALESCE(NULLIF(trim(master_category), ''), name)");
  aisleCategorySchemaReady = true;
}

// Get all aisle categories
router.get('/', async (req, res) => {
  console.log("GET /api/aisle_category called");
  try {
    await ensureAisleCategorySchema();
    const result = await pool.query('SELECT id, name, sort_order, COALESCE(NULLIF(trim(master_category),\'\'), name) AS master_category FROM aisle_category ORDER BY sort_order, id');
    console.log("aisle_category query result:", result.rows);
    res.json({ success: true, categories: result.rows });
  } catch (err) {
    console.error('AisleCategory GET error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add a new aisle category
router.post('/', async (req, res) => {
  const { name, sort_order, master_category } = req.body;
  const trimmedName = String(name || '').trim();
  const trimmedMaster = String(master_category || '').trim() || trimmedName;
  const parsedSortOrder = Number.isFinite(Number(sort_order)) ? Number(sort_order) : null;
  if (!trimmedName) return res.status(400).json({ error: 'Category name required' });

  const insertSql = `
    INSERT INTO aisle_category (name, sort_order, master_category)
    VALUES (
      $1,
      COALESCE($2, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM aisle_category)),
      $3
    )
    RETURNING id, sort_order, COALESCE(NULLIF(trim(master_category),''), name) AS master_category
  `;

  try {
    await ensureAisleCategorySchema();
    const result = await pool.query(insertSql, [trimmedName, parsedSortOrder, trimmedMaster]);
    res.json({ id: result.rows[0].id, name: trimmedName, sort_order: result.rows[0].sort_order, master_category: result.rows[0].master_category });
  } catch (err) {
    // Common after data imports: id sequence falls behind max(id), causing PK duplicates.
    if (err && err.code === '23505' && String(err.constraint || '').includes('aisle_category_pkey')) {
      try {
        await pool.query(
          `SELECT setval(
             pg_get_serial_sequence('aisle_category', 'id'),
             COALESCE((SELECT MAX(id) FROM aisle_category), 0)
           )`
        );
        const retry = await pool.query(insertSql, [trimmedName, parsedSortOrder, trimmedMaster]);
        return res.json({ id: retry.rows[0].id, name: trimmedName, sort_order: retry.rows[0].sort_order, master_category: retry.rows[0].master_category, recoveredSequence: true });
      } catch (retryErr) {
        console.error('AisleCategory POST retry after sequence reset failed:', retryErr);
        return res.status(500).json({ error: retryErr.message });
      }
    }

    if (err && err.code === '23505' && String(err.constraint || '').includes('name')) {
      return res.status(409).json({ error: 'Category name already exists' });
    }

    console.error('AisleCategory POST error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Edit an aisle category
router.put('/:id', async (req, res) => {
  const { name, sort_order, master_category } = req.body;
  const { id } = req.params;
  if (!name) return res.status(400).json({ error: 'Category name required' });
  try {
    await ensureAisleCategorySchema();
    const cleanMaster = String(master_category || '').trim() || String(name || '').trim();
    if (Number.isFinite(Number(sort_order))) {
      await pool.query('UPDATE aisle_category SET name = $1, sort_order = $2, master_category = $3 WHERE id = $4', [name, Number(sort_order), cleanMaster, id]);
    } else {
      await pool.query('UPDATE aisle_category SET name = $1, master_category = $2 WHERE id = $3', [name, cleanMaster, id]);
    }
    res.json({ id, name, master_category: cleanMaster });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete an aisle category
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM aisle_category WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
