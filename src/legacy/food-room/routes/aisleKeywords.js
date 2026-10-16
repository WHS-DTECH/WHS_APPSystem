// Aisle Keyword CRUD endpoints as a separate router
const express = require('express');
const router = express.Router();
const pool = require('../db');

let masterKeywordSchemaReady = false;
let masterKeywordSeedReady = false;

async function ensureMasterKeywordSchema() {
  if (masterKeywordSchemaReady) return;

  await pool.query('ALTER TABLE aisle_category ADD COLUMN IF NOT EXISTS master_category TEXT');
  await pool.query("UPDATE aisle_category SET master_category = COALESCE(NULLIF(trim(master_category), ''), name)");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS aisle_master_keywords (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      aisle_category_id INTEGER REFERENCES aisle_category(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS aisle_master_keyword_members (
      id SERIAL PRIMARY KEY,
      master_keyword_id INTEGER NOT NULL REFERENCES aisle_master_keywords(id) ON DELETE CASCADE,
      keyword TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS aisle_master_keyword_members_unique_idx ON aisle_master_keyword_members(master_keyword_id, lower(keyword))'
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS aisle_master_keyword_categories (
      master_keyword_id INTEGER NOT NULL REFERENCES aisle_master_keywords(id) ON DELETE CASCADE,
      aisle_category_id INTEGER NOT NULL REFERENCES aisle_category(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (master_keyword_id, aisle_category_id)
    )
  `);

  masterKeywordSchemaReady = true;
}

async function ensureAisleCategory(categoryName) {
  const clean = String(categoryName || '').trim();
  if (!clean) return null;

  const existing = await pool.query('SELECT id FROM aisle_category WHERE lower(name) = lower($1) LIMIT 1', [clean]);
  if (existing.rows.length) return existing.rows[0].id;

  const inserted = await pool.query(
    `INSERT INTO aisle_category (name, sort_order)
     VALUES ($1, COALESCE((SELECT MAX(sort_order) + 1 FROM aisle_category), 1))
     RETURNING id`,
    [clean]
  );
  return inserted.rows[0].id;
}

async function ensureMasterKeyword(masterName, aisleCategoryId, memberKeywords) {
  const cleanMaster = String(masterName || '').trim();
  if (!cleanMaster || !aisleCategoryId) return;

  const upsertMaster = await pool.query(
    `INSERT INTO aisle_master_keywords (name, aisle_category_id)
     VALUES ($1, $2)
     ON CONFLICT (name)
     DO UPDATE SET aisle_category_id = EXCLUDED.aisle_category_id, updated_at = NOW()
     RETURNING id`,
    [cleanMaster, aisleCategoryId]
  );
  const masterId = upsertMaster.rows[0].id;

  // Keep a list of linked aisle categories; include primary by default.
  await pool.query(
    `INSERT INTO aisle_master_keyword_categories (master_keyword_id, aisle_category_id)
     VALUES ($1, $2)
     ON CONFLICT (master_keyword_id, aisle_category_id)
     DO NOTHING`,
    [masterId, aisleCategoryId]
  );

  for (const keyword of memberKeywords) {
    const cleanKeyword = String(keyword || '').trim();
    if (!cleanKeyword) continue;

    await pool.query(
      `INSERT INTO aisle_master_keyword_members (master_keyword_id, keyword)
       VALUES ($1, $2)
       ON CONFLICT (master_keyword_id, lower(keyword))
       DO UPDATE SET updated_at = NOW()`,
      [masterId, cleanKeyword]
    );

    // Keep existing behavior intact: ensure concrete aisle_keywords rows continue to drive matching.
    const existingKeyword = await pool.query(
      'SELECT id, aisle_category_id FROM aisle_keywords WHERE lower(keyword) = lower($1) LIMIT 1',
      [cleanKeyword]
    );

    if (existingKeyword.rows.length) {
      const row = existingKeyword.rows[0];
      if (String(row.aisle_category_id) !== String(aisleCategoryId)) {
        await pool.query('UPDATE aisle_keywords SET aisle_category_id = $1 WHERE id = $2', [aisleCategoryId, row.id]);
      }
    } else {
      await pool.query('INSERT INTO aisle_keywords (aisle_category_id, keyword) VALUES ($1, $2)', [aisleCategoryId, cleanKeyword]);
    }
  }
}

async function syncKeywordToAisleKeywords(keyword, aisleCategoryId) {
  const cleanKeyword = String(keyword || '').trim();
  if (!cleanKeyword || !aisleCategoryId) return;

  const existingKeyword = await pool.query(
    'SELECT id, aisle_category_id FROM aisle_keywords WHERE lower(keyword) = lower($1) LIMIT 1',
    [cleanKeyword]
  );

  if (existingKeyword.rows.length) {
    const row = existingKeyword.rows[0];
    if (String(row.aisle_category_id) !== String(aisleCategoryId)) {
      await pool.query('UPDATE aisle_keywords SET aisle_category_id = $1 WHERE id = $2', [aisleCategoryId, row.id]);
    }
  } else {
    await pool.query('INSERT INTO aisle_keywords (aisle_category_id, keyword) VALUES ($1, $2)', [aisleCategoryId, cleanKeyword]);
  }
}

async function ensureMasterKeywordSeedData() {
  if (masterKeywordSeedReady) return;
  await ensureMasterKeywordSchema();
  const meatCategoryId = await ensureAisleCategory('Meat');

  await ensureMasterKeyword('Meat', meatCategoryId, [
    'Meat',
    'Beef',
    'Lamb',
    'Pork',
    'Chicken',
    'Turkey',
    'Venison',
    'Bacon',
    'Ham',
    'Mince',
    'Sausage',
    'Sausages'
  ]);

  masterKeywordSeedReady = true;
}

// Add aisle keyword
router.post('/add', async (req, res) => {
  const { aisle_category_id, keyword } = req.body;
  const cleanedKeyword = String(keyword || '').trim();
  if (!aisle_category_id || !cleanedKeyword) return res.json({ success: false, error: 'Missing data' });

  try {
    await ensureMasterKeywordSeedData();
    const result = await pool.query(
      'INSERT INTO aisle_keywords (aisle_category_id, keyword) VALUES ($1, $2) RETURNING id',
      [aisle_category_id, cleanedKeyword]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Edit aisle keyword
router.post('/edit', async (req, res) => {
  const { id, keyword } = req.body;
  const cleanedKeyword = String(keyword || '').trim();
  if (!id || !cleanedKeyword) return res.json({ success: false, error: 'Missing data' });

  try {
    await ensureMasterKeywordSeedData();
    await pool.query('UPDATE aisle_keywords SET keyword = $1 WHERE id = $2', [cleanedKeyword, id]);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Delete aisle keyword
router.post('/delete', async (req, res) => {
  const { id } = req.body;
  if (!id) return res.json({ success: false, error: 'Missing id' });

  try {
    await ensureMasterKeywordSeedData();
    await pool.query('DELETE FROM aisle_keywords WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// API endpoint to get all aisle keywords with category names
router.get('/all', async (req, res) => {
  const sql = `
    SELECT ak.id,
           ak.keyword,
           ac.name AS aisle_category,
           COALESCE(NULLIF(trim(ac.master_category), ''), ac.name) AS master_category,
           ac.name AS sub_aisle
    FROM aisle_keywords ak
    LEFT JOIN aisle_category ac ON ak.aisle_category_id = ac.id
    ORDER BY COALESCE(ac.sort_order, 9999), ak.keyword
  `;
  try {
    await ensureMasterKeywordSeedData();
    const result = await pool.query(sql);
    res.json({ success: true, keywords: result.rows });
  } catch (err) {
    res.json({ success: false, error: err.message, keywords: [] });
  }
});

// Optional management endpoint for upcoming master keywords.
router.get('/masters', async (req, res) => {
  try {
    await ensureMasterKeywordSeedData();
    const result = await pool.query(
      `SELECT mk.id, mk.name, mk.aisle_category_id, ac.name AS aisle_category,
              COALESCE(
                (
                  SELECT json_agg(json_build_object('id', mkm.id, 'keyword', mkm.keyword) ORDER BY mkm.keyword)
                    FROM aisle_master_keyword_members mkm
                   WHERE mkm.master_keyword_id = mk.id
                ),
                '[]'::json
              ) AS members,
              COALESCE(
                (
                  SELECT json_agg(json_build_object('id', ac2.id, 'name', ac2.name) ORDER BY ac2.name)
                    FROM aisle_master_keyword_categories mkc
                    JOIN aisle_category ac2 ON ac2.id = mkc.aisle_category_id
                   WHERE mkc.master_keyword_id = mk.id
                ),
                '[]'::json
              ) AS linked_categories
         FROM aisle_master_keywords mk
         LEFT JOIN aisle_category ac ON ac.id = mk.aisle_category_id
        ORDER BY mk.name`
    );
    return res.json({ success: true, masters: result.rows });
  } catch (err) {
    return res.json({ success: false, error: err.message, masters: [] });
  }
});

router.post('/masters/add', async (req, res) => {
  const name = String(req.body && req.body.name || '').trim();
  const aisleCategoryId = Number(req.body && req.body.aisle_category_id || 0);
  if (!name || !aisleCategoryId) {
    return res.json({ success: false, error: 'name and aisle_category_id are required.' });
  }

  try {
    await ensureMasterKeywordSeedData();
    const existing = await pool.query('SELECT id FROM aisle_master_keywords WHERE lower(name) = lower($1) LIMIT 1', [name]);
    if (existing.rows.length) {
      return res.json({ success: false, error: 'Master keyword already exists.' });
    }

    const inserted = await pool.query(
      `INSERT INTO aisle_master_keywords (name, aisle_category_id)
       VALUES ($1, $2)
       RETURNING id, name, aisle_category_id`,
      [name, aisleCategoryId]
    );

    await pool.query(
      `INSERT INTO aisle_master_keyword_categories (master_keyword_id, aisle_category_id)
       VALUES ($1, $2)
       ON CONFLICT (master_keyword_id, aisle_category_id)
       DO NOTHING`,
      [inserted.rows[0].id, aisleCategoryId]
    );

    return res.json({ success: true, master: inserted.rows[0] });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

router.post('/masters/edit', async (req, res) => {
  const id = Number(req.body && req.body.id || 0);
  const name = String(req.body && req.body.name || '').trim();
  const aisleCategoryId = Number(req.body && req.body.aisle_category_id || 0);
  if (!id || !name || !aisleCategoryId) {
    return res.json({ success: false, error: 'id, name and aisle_category_id are required.' });
  }

  try {
    await ensureMasterKeywordSeedData();

    const duplicate = await pool.query(
      'SELECT id FROM aisle_master_keywords WHERE lower(name) = lower($1) AND id <> $2 LIMIT 1',
      [name, id]
    );
    if (duplicate.rows.length) {
      return res.json({ success: false, error: 'Another master keyword already uses that name.' });
    }

    const updated = await pool.query(
      `UPDATE aisle_master_keywords
          SET name = $2,
              aisle_category_id = $3,
              updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, aisle_category_id`,
      [id, name, aisleCategoryId]
    );

    if (!updated.rows.length) {
      return res.json({ success: false, error: 'Master keyword not found.' });
    }

    await pool.query(
      `INSERT INTO aisle_master_keyword_categories (master_keyword_id, aisle_category_id)
       VALUES ($1, $2)
       ON CONFLICT (master_keyword_id, aisle_category_id)
       DO NOTHING`,
      [id, aisleCategoryId]
    );

    const members = await pool.query(
      'SELECT keyword FROM aisle_master_keyword_members WHERE master_keyword_id = $1',
      [id]
    );
    for (const row of members.rows) {
      await syncKeywordToAisleKeywords(row.keyword, aisleCategoryId);
    }

    return res.json({ success: true, master: updated.rows[0] });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

router.post('/masters/delete', async (req, res) => {
  const id = Number(req.body && req.body.id || 0);
  if (!id) return res.json({ success: false, error: 'id is required.' });

  try {
    await ensureMasterKeywordSeedData();
    const deleted = await pool.query('DELETE FROM aisle_master_keywords WHERE id = $1 RETURNING id', [id]);
    if (!deleted.rows.length) {
      return res.json({ success: false, error: 'Master keyword not found.' });
    }
    return res.json({ success: true });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

router.post('/masters/members/add', async (req, res) => {
  const masterId = Number(req.body && req.body.master_keyword_id || 0);
  const keyword = String(req.body && req.body.keyword || '').trim();
  if (!masterId || !keyword) {
    return res.json({ success: false, error: 'master_keyword_id and keyword are required.' });
  }

  try {
    await ensureMasterKeywordSeedData();
    const masterResult = await pool.query(
      'SELECT id, aisle_category_id FROM aisle_master_keywords WHERE id = $1 LIMIT 1',
      [masterId]
    );
    if (!masterResult.rows.length) {
      return res.json({ success: false, error: 'Master keyword not found.' });
    }
    const aisleCategoryId = masterResult.rows[0].aisle_category_id;

    await pool.query(
      `INSERT INTO aisle_master_keyword_members (master_keyword_id, keyword)
       VALUES ($1, $2)
       ON CONFLICT (master_keyword_id, lower(keyword))
       DO UPDATE SET updated_at = NOW()`,
      [masterId, keyword]
    );

    await syncKeywordToAisleKeywords(keyword, aisleCategoryId);
    return res.json({ success: true });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

router.post('/masters/members/delete', async (req, res) => {
  const memberId = Number(req.body && req.body.id || 0);
  if (!memberId) return res.json({ success: false, error: 'id is required.' });

  try {
    await ensureMasterKeywordSeedData();
    const deleted = await pool.query('DELETE FROM aisle_master_keyword_members WHERE id = $1 RETURNING id', [memberId]);
    if (!deleted.rows.length) {
      return res.json({ success: false, error: 'Member keyword not found.' });
    }
    // We intentionally do not delete from aisle_keywords to avoid breaking existing matching behavior.
    return res.json({ success: true });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

router.post('/masters/categories/add', async (req, res) => {
  const masterId = Number(req.body && req.body.master_keyword_id || 0);
  const aisleCategoryId = Number(req.body && req.body.aisle_category_id || 0);
  if (!masterId || !aisleCategoryId) {
    return res.json({ success: false, error: 'master_keyword_id and aisle_category_id are required.' });
  }

  try {
    await ensureMasterKeywordSeedData();

    const master = await pool.query('SELECT id FROM aisle_master_keywords WHERE id = $1 LIMIT 1', [masterId]);
    if (!master.rows.length) {
      return res.json({ success: false, error: 'Master keyword not found.' });
    }

    await pool.query(
      `INSERT INTO aisle_master_keyword_categories (master_keyword_id, aisle_category_id)
       VALUES ($1, $2)
       ON CONFLICT (master_keyword_id, aisle_category_id)
       DO NOTHING`,
      [masterId, aisleCategoryId]
    );

    return res.json({ success: true });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

router.post('/masters/categories/delete', async (req, res) => {
  const masterId = Number(req.body && req.body.master_keyword_id || 0);
  const aisleCategoryId = Number(req.body && req.body.aisle_category_id || 0);
  if (!masterId || !aisleCategoryId) {
    return res.json({ success: false, error: 'master_keyword_id and aisle_category_id are required.' });
  }

  try {
    await ensureMasterKeywordSeedData();

    const masterResult = await pool.query(
      'SELECT aisle_category_id FROM aisle_master_keywords WHERE id = $1 LIMIT 1',
      [masterId]
    );
    if (!masterResult.rows.length) {
      return res.json({ success: false, error: 'Master keyword not found.' });
    }

    const primaryAisleCategoryId = Number(masterResult.rows[0].aisle_category_id || 0);
    if (primaryAisleCategoryId && primaryAisleCategoryId === aisleCategoryId) {
      return res.json({ success: false, error: 'Cannot remove primary aisle category from master.' });
    }

    await pool.query(
      'DELETE FROM aisle_master_keyword_categories WHERE master_keyword_id = $1 AND aisle_category_id = $2',
      [masterId, aisleCategoryId]
    );

    return res.json({ success: true });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

module.exports = router;
