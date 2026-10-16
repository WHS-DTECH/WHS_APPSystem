const express = require('express');
const router = express.Router();
const pool = require('../db');

let schemaReady = false;

const ALLOWED_ROLES = new Set(['admin', 'lead_teacher', 'teacher', 'technician']);

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function fallbackNameFromEmail(email) {
  const local = String(email || '').split('@')[0] || '';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .trim();
}

function authUserName(req) {
  const explicit = String(req && req.authUser && req.authUser.name || '').trim();
  if (explicit) return explicit;
  const email = normalizeEmail(req && req.authUserEmail);
  return fallbackNameFromEmail(email) || 'Teacher';
}

function normalizeText(value, fallback = '') {
  const text = String(value == null ? '' : value).trim();
  return text || fallback;
}

function normalizeWeekNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const week = Math.trunc(n);
  return week >= 1 && week <= 53 ? String(week) : '';
}

function normalizeTermNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const term = Math.trunc(n);
  return term >= 1 && term <= 4 ? String(term) : '';
}

function normalizeDateValue(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  // Accept both ISO dates and readable labels like "1 May".
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return text.replace(/\s+/g, ' ').trim();
}

function buildWeekInfoFromState(state) {
  const parts = [];
  if (state.term) parts.push(`Term ${state.term}`);
  if (state.week) parts.push(`Week ${state.week}`);
  if (state.weekDate) parts.push(`Date ending: ${state.weekDate}`);
  if (parts.length) return parts.join(' | ');
  return normalizeText(state.weekInfo);
}

function toInt(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function normalizeSection(input) {
  const section = input && typeof input === 'object' ? input : {};
  const items = Array.isArray(section.items)
    ? section.items.map((item) => normalizeText(item)).filter(Boolean)
    : [];

  return {
    label: normalizeText(section.label, 'General'),
    sublabel: normalizeText(section.sublabel),
    items
  };
}

function normalizeCategory(input) {
  const category = input && typeof input === 'object' ? input : {};
  const sections = Array.isArray(category.sections)
    ? category.sections.map(normalizeSection).filter(Boolean)
    : [];

  return {
    name: normalizeText(category.name, 'New Category'),
    sections: sections.length ? sections : [normalizeSection({ label: 'General' })]
  };
}

function normalizeStatePayload(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const rawColumns = Array.isArray(raw.columns) ? raw.columns : [];
  const leftColumn = Array.isArray(rawColumns[0]) ? rawColumns[0].map(normalizeCategory) : [];
  const rightColumn = Array.isArray(rawColumns[1]) ? rawColumns[1].map(normalizeCategory) : [];
  const classRecipeRows = Array.isArray(raw.classRecipeRows)
    ? raw.classRecipeRows.map((row) => ({
        classInfo: normalizeText(row && row.classInfo),
        recipe: normalizeText(row && row.recipe)
      })).filter((row) => row.classInfo || row.recipe)
    : [];

  return {
    title: normalizeText(raw.title, 'Shopping List'),
    weekInfo: normalizeText(raw.weekInfo),
    term: normalizeTermNumber(raw.term),
    week: normalizeWeekNumber(raw.week),
    weekDate: normalizeDateValue(raw.weekDate),
    columns: [leftColumn, rightColumn],
    classRecipeRows
  };
}

async function ensureSchema() {
  if (schemaReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS saved_shopping_lists (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Shopping List',
      week_info TEXT NOT NULL DEFAULT '',
      source_filename TEXT NOT NULL DEFAULT '',
      parsed_state JSONB NOT NULL,
      created_by_email TEXT NOT NULL DEFAULT '',
      created_by_name TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(
    'CREATE INDEX IF NOT EXISTS saved_shopping_lists_updated_idx ON saved_shopping_lists(updated_at DESC, id DESC)'
  );

  await pool.query(
    'CREATE INDEX IF NOT EXISTS saved_shopping_lists_created_by_email_idx ON saved_shopping_lists(lower(trim(created_by_email)))'
  );

  schemaReady = true;
}

async function hasShoppingListAccess(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  try {
    const additionalRoleResult = await pool.query(
      `SELECT lower(trim(uar.role_name)) AS role_name
         FROM user_additional_roles uar
        WHERE lower(trim(uar.email)) = lower(trim($1))`,
      [normalized]
    );

    if (additionalRoleResult.rows.some((row) => ALLOWED_ROLES.has(String(row.role_name || '').trim().toLowerCase()))) {
      return true;
    }
  } catch (err) {
    if (!err || err.code !== '42P01') throw err;
  }

  try {
    const staffResult = await pool.query(
      `SELECT lower(trim(COALESCE(primary_role, 'staff'))) AS primary_role
         FROM staff_upload
        WHERE lower(trim(email_school)) = lower(trim($1))
          AND COALESCE(status, 'Current') = 'Current'
        LIMIT 1`,
      [normalized]
    );

    if (staffResult.rows.length) {
      const primaryRole = String(staffResult.rows[0].primary_role || '').trim().toLowerCase();
      if (ALLOWED_ROLES.has(primaryRole)) return true;
    }
  } catch (err) {
    if (!err || (err.code !== '42P01' && err.code !== '42703')) throw err;
  }

  const fallbackPermissions = {
    'vanessapringle@westlandhigh.school.nz': true,
    'vanessa.pringle@westlandhigh.school.nz': true
  };
  return Boolean(fallbackPermissions[normalized]);
}

async function requireShoppingListAccess(req, res, next) {
  const email = normalizeEmail(req && req.authUserEmail);
  if (!email) {
    return res.status(401).json({ success: false, error: 'Sign in required.' });
  }

  try {
    const allowed = await hasShoppingListAccess(email);
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Shopping list access required.' });
    }
    return next();
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to validate shopping list access.' });
  }
}

router.get('/', requireShoppingListAccess, async (req, res) => {
  try {
    await ensureSchema();
    const result = await pool.query(
      `SELECT id, title, week_info, source_filename,
              COALESCE(NULLIF(parsed_state->>'term', ''), '') AS term,
              COALESCE(NULLIF(parsed_state->>'week', ''), '') AS week,
              COALESCE(NULLIF(parsed_state->>'weekDate', ''), '') AS week_date,
              created_by_email, created_by_name, created_at, updated_at
         FROM saved_shopping_lists
        ORDER BY CASE
                   WHEN COALESCE(parsed_state->>'term', '') ~ '\\d+'
                     THEN substring(parsed_state->>'term' from '\\d+')::int
                   ELSE NULL
                 END DESC NULLS LAST,
                 CASE
                   WHEN COALESCE(parsed_state->>'week', '') ~ '\\d+'
                     THEN substring(parsed_state->>'week' from '\\d+')::int
                   ELSE NULL
                 END DESC NULLS LAST,
         updated_at DESC,
         id DESC`
    );

    return res.json({ success: true, lists: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to load saved shopping lists.' });
  }
});

router.get('/:id', requireShoppingListAccess, async (req, res) => {
  const listId = toInt(req.params.id);
  if (!listId) {
    return res.status(400).json({ success: false, error: 'Invalid shopping list id.' });
  }

  try {
    await ensureSchema();
    const result = await pool.query(
      `SELECT id, title, week_info, source_filename, parsed_state, created_by_email, created_by_name, created_at, updated_at
         FROM saved_shopping_lists
        WHERE id = $1
        LIMIT 1`,
      [listId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ success: false, error: 'Saved shopping list not found.' });
    }

    const row = result.rows[0];
    return res.json({
      success: true,
      list: {
        id: row.id,
        title: row.title,
        weekInfo: row.week_info || '',
        sourceFilename: row.source_filename || '',
        term: String(row.term || ''),
        week: String(row.week || ''),
        weekDate: String(row.week_date || ''),
        state: normalizeStatePayload(row.parsed_state || {}),
        createdByEmail: row.created_by_email || '',
        createdByName: row.created_by_name || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to load saved shopping list.' });
  }
});

router.post('/', requireShoppingListAccess, async (req, res) => {
  const incomingState = req.body && req.body.state;
  if (!incomingState || typeof incomingState !== 'object') {
    return res.status(400).json({ success: false, error: 'state is required.' });
  }

  try {
    await ensureSchema();
    const normalizedState = normalizeStatePayload(incomingState);
    if (req.body && req.body.title != null) normalizedState.title = normalizeText(req.body.title, normalizedState.title);
    if (req.body && req.body.weekInfo != null) normalizedState.weekInfo = normalizeText(req.body.weekInfo);
    if (req.body && req.body.term != null) normalizedState.term = normalizeTermNumber(req.body.term);
    if (req.body && req.body.week != null) normalizedState.week = normalizeWeekNumber(req.body.week);
    if (req.body && req.body.weekDate != null) normalizedState.weekDate = normalizeDateValue(req.body.weekDate);
    normalizedState.weekInfo = buildWeekInfoFromState(normalizedState);

    const result = await pool.query(
      `INSERT INTO saved_shopping_lists (
         title,
         week_info,
         source_filename,
         parsed_state,
         created_by_email,
         created_by_name
       )
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       RETURNING id, title, week_info, source_filename, created_by_email, created_by_name, created_at, updated_at`,
      [
        normalizedState.title,
        normalizedState.weekInfo,
        normalizeText(req.body && req.body.sourceFilename),
        JSON.stringify(normalizedState),
        normalizeEmail(req.authUserEmail),
        authUserName(req)
      ]
    );

    const row = result.rows[0];
    return res.status(201).json({
      success: true,
      list: {
        id: row.id,
        title: row.title,
        weekInfo: row.week_info || '',
        sourceFilename: row.source_filename || '',
        createdByEmail: row.created_by_email || '',
        createdByName: row.created_by_name || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to save shopping list.' });
  }
});

router.put('/:id', requireShoppingListAccess, async (req, res) => {
  const listId = toInt(req.params.id);
  if (!listId) {
    return res.status(400).json({ success: false, error: 'Invalid shopping list id.' });
  }

  const incomingState = req.body && req.body.state;
  if (!incomingState || typeof incomingState !== 'object') {
    return res.status(400).json({ success: false, error: 'state is required.' });
  }

  try {
    await ensureSchema();
    const normalizedState = normalizeStatePayload(incomingState);
    if (req.body && req.body.title != null) normalizedState.title = normalizeText(req.body.title, normalizedState.title);
    if (req.body && req.body.weekInfo != null) normalizedState.weekInfo = normalizeText(req.body.weekInfo);
    if (req.body && req.body.term != null) normalizedState.term = normalizeTermNumber(req.body.term);
    if (req.body && req.body.week != null) normalizedState.week = normalizeWeekNumber(req.body.week);
    if (req.body && req.body.weekDate != null) normalizedState.weekDate = normalizeDateValue(req.body.weekDate);
    normalizedState.weekInfo = buildWeekInfoFromState(normalizedState);

    const result = await pool.query(
      `UPDATE saved_shopping_lists
          SET title = $2,
              week_info = $3,
              source_filename = $4,
              parsed_state = $5::jsonb,
              updated_at = NOW()
        WHERE id = $1
        RETURNING id, title, week_info, source_filename, created_by_email, created_by_name, created_at, updated_at`,
      [
        listId,
        normalizedState.title,
        normalizedState.weekInfo,
        normalizeText(req.body && req.body.sourceFilename),
        JSON.stringify(normalizedState)
      ]
    );

    if (!result.rowCount) {
      return res.status(404).json({ success: false, error: 'Saved shopping list not found.' });
    }

    const row = result.rows[0];
    return res.json({
      success: true,
      list: {
        id: row.id,
        title: row.title,
        weekInfo: row.week_info || '',
        sourceFilename: row.source_filename || '',
        createdByEmail: row.created_by_email || '',
        createdByName: row.created_by_name || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to update shopping list.' });
  }
});

router.delete('/:id', requireShoppingListAccess, async (req, res) => {
  const listId = toInt(req.params.id);
  if (!listId) {
    return res.status(400).json({ success: false, error: 'Invalid shopping list id.' });
  }

  try {
    await ensureSchema();
    const result = await pool.query(
      `DELETE FROM saved_shopping_lists
        WHERE id = $1
        RETURNING id`,
      [listId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ success: false, error: 'Saved shopping list not found.' });
    }

    return res.json({ success: true, id: listId });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to delete shopping list.' });
  }
});

module.exports = router;