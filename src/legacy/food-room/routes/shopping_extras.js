const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAdmin } = require('../middleware/requireAdmin');

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shopping_extras (
      id SERIAL PRIMARY KEY,
      is_standing BOOLEAN NOT NULL DEFAULT FALSE,
      week_date DATE,
      category TEXT NOT NULL DEFAULT 'Other',
      item_text TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by_email TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Dedicated table for routine/standing extras (cleaning products, consumables, etc.)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shopping_routine_extras (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL DEFAULT 'Other',
      item_text TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by_email TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // One-time migration: if routine table is empty, seed it from legacy standing rows.
  await pool.query(`
    INSERT INTO shopping_routine_extras (category, item_text, sort_order, created_by_email)
    SELECT se.category, se.item_text, se.sort_order, se.created_by_email
    FROM shopping_extras se
    WHERE se.is_standing = TRUE
      AND NOT EXISTS (SELECT 1 FROM shopping_routine_extras sre)
  `);
}

// GET /api/shopping-extras?week_date=YYYY-MM-DD
router.get('/', async (req, res) => {
  try {
    await ensureTable();
    const weekDate = String(req.query.week_date || '').trim() || null;

    const [standingResult, weekResult] = await Promise.all([
      pool.query(
        `SELECT id,
                TRUE AS is_standing,
                NULL::text AS week_date,
                category,
                item_text,
                sort_order
         FROM shopping_routine_extras
         WHERE is_active = TRUE
         ORDER BY sort_order, id`
      ),
      pool.query(
        `SELECT id, is_standing, week_date::text, category, item_text, sort_order
         FROM shopping_extras
         WHERE is_standing = FALSE
           AND ($1::text IS NOT NULL AND week_date = $1::date)
         ORDER BY sort_order, id`,
        [weekDate]
      )
    ]);

    res.json({ success: true, standing: standingResult.rows, week: weekResult.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/shopping-extras/save
// body: { scope: 'standing'|'week', week_date?: 'YYYY-MM-DD', rows: [{category, item_text}] }
router.post('/save', requireAdmin, async (req, res) => {
  try {
    await ensureTable();
    const scope = String(req.body.scope || 'week');
    const isStanding = scope === 'standing';
    const weekDate = isStanding ? null : (String(req.body.week_date || '').trim() || null);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const createdBy = req.authUserEmail || null;

    if (!isStanding && !weekDate) {
      return res.status(400).json({ success: false, error: 'week_date is required for week scope.' });
    }

    await pool.query('BEGIN');
    if (isStanding) {
      await pool.query('DELETE FROM shopping_routine_extras WHERE is_active = TRUE');
    } else {
      await pool.query(
        'DELETE FROM shopping_extras WHERE is_standing = FALSE AND week_date = $1::date',
        [weekDate]
      );
    }

    for (let i = 0; i < rows.length; i++) {
      const category = String(rows[i].category || 'Other').trim() || 'Other';
      const item_text = String(rows[i].item_text || '').trim();
      if (!item_text) continue;

      if (isStanding) {
        await pool.query(
          `INSERT INTO shopping_routine_extras (category, item_text, sort_order, created_by_email, is_active)
           VALUES ($1, $2, $3, $4, TRUE)`,
          [category, item_text, i, createdBy]
        );
      } else {
        await pool.query(
          `INSERT INTO shopping_extras (is_standing, week_date, category, item_text, sort_order, created_by_email)
           VALUES (FALSE, $1, $2, $3, $4, $5)`,
          [weekDate, category, item_text, i, createdBy]
        );
      }
    }

    await pool.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/shopping-extras/:id  (removes a single saved row)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await ensureTable();
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid id.' });
    }

    // Try both week extras and routine extras tables for compatibility.
    const [weekDelete, routineDelete] = await Promise.all([
      pool.query('DELETE FROM shopping_extras WHERE id = $1 RETURNING id', [id]),
      pool.query('DELETE FROM shopping_routine_extras WHERE id = $1 RETURNING id', [id])
    ]);

    const deleted = (weekDelete.rowCount || 0) + (routineDelete.rowCount || 0);
    if (deleted === 0) {
      return res.status(404).json({ success: false, error: 'Item not found.' });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
