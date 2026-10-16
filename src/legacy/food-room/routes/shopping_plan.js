// routes/shopping_plan.js
// Teacher-First Shopping Plan API
// All endpoints require admin (Lead Teacher) except GET /:id/technician-view
// which only requires a logged-in session.

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAdmin } = require('../middleware/requireAdmin');
const desiredServingsRoute = require('./desiredServings');
const saveDesiredServingsPayload = desiredServingsRoute.saveDesiredServingsPayload;

// ---------------------------------------------------------------------------
// Auto-migration: create shopping_plan tables if they don't exist yet.
// Safe to call multiple times — all statements use IF NOT EXISTS.
// ---------------------------------------------------------------------------
let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shopping_plan (
      id              SERIAL PRIMARY KEY,
      week_ending     DATE        NOT NULL,
      status          TEXT        NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft', 'finalized')),
      version         INTEGER     NOT NULL DEFAULT 1,
      created_by      TEXT        NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finalized_by    TEXT,
      finalized_at    TIMESTAMPTZ,
      notes           TEXT,
      UNIQUE (week_ending, version)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shopping_plan_classes (
      id               SERIAL PRIMARY KEY,
      plan_id          INTEGER     NOT NULL REFERENCES shopping_plan(id) ON DELETE CASCADE,
      booking_id       INTEGER     REFERENCES bookings(id) ON DELETE SET NULL,
      class_name       TEXT        NOT NULL,
      teacher_name     TEXT,
      recipe_id        INTEGER     REFERENCES recipes(id) ON DELETE SET NULL,
      planned_servings INTEGER,
      included         BOOLEAN     NOT NULL DEFAULT TRUE,
      sort_order       INTEGER     NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_spc_plan_sort
      ON shopping_plan_classes (plan_id, sort_order)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shopping_plan_items (
      id                   SERIAL PRIMARY KEY,
      plan_id              INTEGER        NOT NULL REFERENCES shopping_plan(id) ON DELETE CASCADE,
      category             TEXT           NOT NULL DEFAULT 'Uncategorised',
      sub_aisle            TEXT,
      item_name            TEXT           NOT NULL,
      normalized_item_key  TEXT,
      base_unit            TEXT,
      calculated_qty       NUMERIC(10, 4),
      teacher_qty          NUMERIC(10, 4),
      final_qty            NUMERIC(10, 4),
      source_type          TEXT,
      source_detail_json   JSONB,
      notes                TEXT,
      sort_order           INTEGER        NOT NULL DEFAULT 0,
      edited_by            TEXT,
      edited_at            TIMESTAMPTZ
    )
  `);
  await pool.query('ALTER TABLE shopping_plan_items ADD COLUMN IF NOT EXISTS sub_aisle TEXT');
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_spi_plan_cat_sort
      ON shopping_plan_items (plan_id, category, sort_order)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shopping_plan_item_audit (
      id            SERIAL PRIMARY KEY,
      plan_item_id  INTEGER     NOT NULL REFERENCES shopping_plan_items(id) ON DELETE CASCADE,
      field_name    TEXT        NOT NULL,
      old_value     TEXT,
      new_value     TEXT,
      reason        TEXT,
      changed_by    TEXT        NOT NULL,
      changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_spia_plan_item
      ON shopping_plan_item_audit (plan_item_id, changed_at)
  `);
  await pool.query('ALTER TABLE aisle_category ADD COLUMN IF NOT EXISTS master_category TEXT');
  await pool.query("UPDATE aisle_category SET master_category = COALESCE(NULLIF(trim(master_category), ''), name)");
  _schemaReady = true;
}

function sortBrandsForMatching(brands) {
  return (Array.isArray(brands) ? brands : [])
    .map((b) => String(b || '').trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
}

function stripFoodBrandFromItemName(name, brands) {
  let stripped = String(name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  const orderedBrands = sortBrandsForMatching(brands);

  orderedBrands.forEach((brand) => {
    const escaped = brand.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const anywhere = new RegExp(`(^|\\s|,)${escaped}(?:'s)?(?=\\s|,|$)`, 'ig');
    stripped = stripped.replace(anywhere, '$1');
  });

  return stripped
    .replace(/\s+,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim();
}


// ---------------------------------------------------------------------------
// Helper: resolve the requesting user's email from the request
// ---------------------------------------------------------------------------
function requestEmail(req) {
  return String(
    req.authUserEmail ||
    req.headers['x-user-email'] ||
    req.headers['x-staff-email'] ||
    req.query.userEmail ||
    (req.body && req.body.userEmail) ||
    'unknown'
  ).trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Helper: normalise an ingredient name for deduplication keying
// ---------------------------------------------------------------------------
function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeUnit(value) {
  const u = String(value || '').trim().toLowerCase();
  if (!u) return '';
  if (['cup', 'cups', 'c'].includes(u)) return 'cup';
  if (['teaspoon', 'teaspoons', 'tsp', 'tsps'].includes(u)) return 'tsp';
  if (['tablespoon', 'tablespoons', 'tablesppon', 'tablesppons', 'tbsp', 'tbs', 'tblsp', 'tbsps'].includes(u)) return 'tbsp';
  if (['gram', 'grams', 'g'].includes(u)) return 'g';
  if (['kilogram', 'kilograms', 'kg'].includes(u)) return 'kg';
  if (['milliliter', 'milliliters', 'millilitre', 'millilitres', 'ml'].includes(u)) return 'ml';
  if (['liter', 'liters', 'litre', 'litres', 'l'].includes(u)) return 'l';
  if (['each', 'ea', 'unit', 'units', 'item', 'items'].includes(u)) return 'each';
  return u;
}

// Reuse the same fraction parsing approach already used in inventory processing.
function parseFractionLikeInventory(str) {
  const vulgarMap = {
    '¼': 0.25, '½': 0.5, '¾': 0.75,
    '⅐': 1 / 7, '⅑': 1 / 9, '⅒': 0.1, '⅓': 1 / 3, '⅔': 2 / 3,
    '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6, '⅚': 5 / 6,
    '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
  };

  let value = String(str || '').trim();
  if (!value) return null;
  if (Number.isFinite(Number(value))) return Number(value);

  value = value.replace(/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (m) => ` ${vulgarMap[m]}`);
  const parts = value.split(/\s+/).filter(Boolean);
  let total = 0;
  let foundNumeric = false;

  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      total += parseInt(part, 10);
      foundNumeric = true;
      continue;
    }
    if (/^\d+\/\d+$/.test(part)) {
      const [n, d] = part.split('/').map((x) => parseInt(x, 10));
      if (d) {
        total += (n / d);
        foundNumeric = true;
      }
      continue;
    }
    if (!Number.isNaN(parseFloat(part))) {
      total += parseFloat(part);
      foundNumeric = true;
      continue;
    }
  }

  return foundNumeric ? total : null;
}

function cleanIngredientName(value) {
  const source = String(value || '').trim();
  if (!source) return '';

  const qtyPattern = '(?:\\d+(?:\\s+\\d+\\/\\d+)?|\\d+\\/\\d+|\\d*\\.\\d+|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])';
  const unitPattern = '(?:cups?|cup|tbsp|tablespoons?|tablesppons?|tsp|teaspoons?|g|grams?|kg|kilograms?|ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|oz|ounces?|lb|pounds?|pinch(?:es)?|dash(?:es)?|cloves?|cans?|slices?|pieces?)';
  const withUnit = new RegExp(`^\\s*${qtyPattern}\\s*${unitPattern}\\b\\s*[,;:-]?\\s*`, 'i');
  const qtyOnly = new RegExp(`^\\s*${qtyPattern}\\s*[,;:-]?\\s*`, 'i');
  const unitOnly = new RegExp(`^\\s*${unitPattern}\\b\\s*[,;:-]?\\s*`, 'i');

  return source.replace(withUnit, '').replace(qtyOnly, '').replace(unitOnly, '').trim();
}

function normalizedMergeIngredientName(value) {
  const source = String(value || '').trim();
  if (!source) return '';

  let name = source;

  // Remove leading quantity/unit fragments including loose variants like "1t of ...".
  name = name.replace(/^\s*\d+(?:\s*[-/]\s*\d+)?\s*(?:t\b|tsp\b|tbsp\b|cups?\b|g\b|kg\b|ml\b|l\b)?\s*(?:of\s+)?/i, '');
  // Remove parenthesized quantity prefix e.g. "(80ml) Soy Sauce".
  name = name.replace(/^\s*\(\s*\d+(?:\.\d+)?\s*(?:ml|l|g|kg|tsp|tbsp|cups?)\s*\)\s*/i, '');

  // Drop trailing prep notes after commas and remove common prep words.
  name = name.replace(/,.*$/, '');
  name = name.replace(/\b(finely|thinly|roughly|lightly|fresh|frozen|drained|reserved|optional|seeded|removed|intact|peeled|beaten|chopped|sliced|diced|crushed|grated|julienned|minced)\b/gi, ' ');
  name = name.replace(/\b(with|and|or|the|a|an)\b/gi, ' ');

  name = cleanIngredientName(name)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  // Canonical merge aliases for common duplicate patterns.
  name = name
    .replace(/\bspring onions\b/g, 'spring onion')
    .replace(/\beggs\b/g, 'egg')
    .replace(/\bonions\b/g, 'onion');

  return name;
}

function displayNameFromMergeName(mergeName, fallbackName) {
  const key = String(mergeName || '').trim().toLowerCase();
  if (!key) return String(fallbackName || '').trim();
  if (key === 'egg') return 'Eggs';
  if (key === 'spring onion') return 'Spring Onions';
  if (key === 'oil') return 'Oil';
  return key.replace(/\b\w/g, (c) => c.toUpperCase());
}

function sanitizeCorruptedIngredientName(nameValue, unitValue) {
  let name = String(nameValue || '').trim();
  if (!name) return '';

  const unit = normalizeUnit(unitValue);
  const lower = name.toLowerCase();

  // Historical parser glitch: cheese and tortilla text occasionally merged into one line.
  if ((unit === 'g' || unit === 'kg' || unit === 'ml' || unit === 'l') &&
      lower.includes('cheese') &&
      (lower.includes('tortilla') || lower.includes('wrap'))) {
    name = name.replace(/\bsmall\s+tortillas?\s+or\s+wraps?\b.*$/i, '').trim();
    name = name.replace(/\s{2,}/g, ' ').trim();
  }

  return name;
}

function isNonShoppingMetadataIngredient(nameValue) {
  const raw = String(nameValue || '').trim();
  if (!raw) return true;

  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return true;

  if (/^serves(\s+\d+)+\s+serves?$/.test(normalized)) return true;
  if (/\b\d+(?:\.\d+)?\s*serves?\b/.test(normalized) || /\bserves?\s+\d+\b/.test(normalized)) return true;
  if (/\bmg\b/.test(normalized) || /\bkj\b/.test(normalized) || /\bkilojoules?\b/.test(normalized)) return true;

  const exactMeta = new Set([
    'kj total fat',
    'kj',
    'mg',
    'sodium',
    'dietary fibre',
    'dietary fiber',
    'total carbohydrate',
    'total carbohydrates',
    'saturated fat',
    'sugars',
    'protein',
    'energy'
  ]);
  if (exactMeta.has(normalized)) return true;

  if (/\b(total\s+fat|saturated\s+fat|carbohydrate|sugars?|sodium|dietary\s+fib(?:re|er)|protein|energy|kilojoules?|kj)\b/.test(normalized)) {
    return true;
  }

  const metaOnly = normalized
    .replace(/\b(?:serves?|mg|kj|kilojoules?|total|fat|saturated|sodium|dietary|fibre|fiber|carbohydrate|carbohydrates|sugars?|protein|energy)\b/g, ' ')
    .replace(/\d+(?:\.\d+)?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!metaOnly) return true;

  return false;
}

function weekdayNameFromDateValue(value) {
  const iso = String(value || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return names[d.getDay()] || '';
}

function applyLiquidRepairQty(mergeName, qty, unit) {
  let nextQty = Number(qty);
  let nextUnit = normalizeUnit(unit);
  if (!Number.isFinite(nextQty)) return { qty: null, unit: nextUnit };

  if (['oil', 'soy sauce', 'milk'].includes(mergeName)) {
    if (nextUnit === 'tsp') {
      nextQty = nextQty * 5;
      nextUnit = 'ml';
    } else if (nextUnit === 'each' || !nextUnit) {
      nextQty = nextQty * 15;
      nextUnit = 'ml';
    }
  }

  return { qty: nextQty, unit: nextUnit };
}

function extractLeadingQuantityUnit(value) {
  const source = String(value || '').trim();
  if (!source) return { matched: false, qty: null, unit: '', name: '' };

  const qtyPattern = '(?:\\d+(?:\\s+\\d+\\/\\d+)?|\\d+\\/\\d+|\\d*\\.\\d+|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])';
  const unitPattern = '(?:cups?|cup|tbsp|tablespoons?|tablesppons?|tsp|teaspoons?|g|grams?|kg|kilograms?|ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|oz|ounces?|lb|pounds?|pinch(?:es)?|dash(?:es)?|cloves?|cans?|slices?|pieces?)';

  const withUnit = source.match(new RegExp(`^\\s*(${qtyPattern})\\s*(${unitPattern})\\b\\s*[,;:-]?\\s*(.+)$`, 'i'));
  if (withUnit) {
    return {
      matched: true,
      qty: parseFractionLikeInventory(withUnit[1]),
      unit: normalizeUnit(withUnit[2]),
      name: String(withUnit[3] || '').trim()
    };
  }

  const unitOnly = source.match(new RegExp(`^\\s*(${unitPattern})\\b\\s*[,;:-]?\\s*(.+)$`, 'i'));
  if (unitOnly) {
    return {
      matched: true,
      qty: null,
      unit: normalizeUnit(unitOnly[1]),
      name: String(unitOnly[2] || '').trim()
    };
  }

  const qtyOnly = source.match(new RegExp(`^\\s*(${qtyPattern})\\s*[,;:-]?\\s*(.+)$`, 'i'));
  if (qtyOnly) {
    return {
      matched: true,
      qty: parseFractionLikeInventory(qtyOnly[1]),
      unit: '',
      name: String(qtyOnly[2] || '').trim()
    };
  }

  return { matched: false, qty: null, unit: '', name: source };
}

function extractQuantityUnitFromText(value) {
  const source = String(value || '').trim();
  if (!source) return { qty: null, unit: '', name: '' };

  const leading = extractLeadingQuantityUnit(source);
  let bestQty = leading.matched ? leading.qty : null;
  let bestUnit = leading.matched ? leading.unit : '';
  let bestName = leading.matched ? (leading.name || source) : source;

  // Reuse trailing quantity/unit pattern used in inventory normalization logic.
  const trailingQtyUnitRegex = /^(.*?)(\(|\s|,)?\s*(\d+(?:\s+\d+\/\d+|\/\d+)?|\d*\.\d+|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])\s*([a-zA-Z]+)\)?\s*$/i;
  const trailingMatch = source.match(trailingQtyUnitRegex);
  if (trailingMatch) {
    const left = String(trailingMatch[1] || '').trim().replace(/[\(\),;:\-]+$/, '').trim();
    const qty = parseFractionLikeInventory(trailingMatch[3]);
    const unit = normalizeUnit(trailingMatch[4]);
    if (left && (Number.isFinite(qty) || unit)) {
      // Prefer a trailing explicit unit when leading parse has no unit.
      if (!bestUnit && unit) bestUnit = unit;
      // Keep leading quantity if available; otherwise use trailing quantity.
      if (!Number.isFinite(bestQty) && Number.isFinite(qty)) bestQty = qty;
      bestName = left;
    }
  }

  return {
    qty: Number.isFinite(bestQty) ? bestQty : null,
    unit: bestUnit || '',
    name: bestName || source
  };
}

function resolveCategoryFromKeywords(nameValue, keywordRows) {
  const source = String(nameValue || '').trim().toLowerCase();
  if (!source || !Array.isArray(keywordRows) || !keywordRows.length) return { master: '', sub: '' };

  for (const row of keywordRows) {
    const keyword = String(row.keyword || '').trim().toLowerCase();
    const category = String(row.master_category || '').trim();
    const subAisle = String(row.sub_aisle || '').trim();
    if (!keyword || !category) continue;
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
    if (re.test(source)) return { master: category, sub: subAisle || category };
  }
  return { master: '', sub: '' };
}

function enforceCriticalCategory(nameValue, currentMaster, currentSub) {
  const sourceRaw = String(nameValue || '').trim();
  if (!sourceRaw) {
    return { master: currentMaster || '', sub: currentSub || '' };
  }

  const extracted = extractQuantityUnitFromText(sourceRaw);
  const source = String(cleanIngredientName(extracted.name || sourceRaw) || sourceRaw).toLowerCase();

  const has = (pattern) => pattern.test(source);

  // Dairy: cheese, cream, milk, yogurt, butter
  if (has(/\b(cheese|cheddar|mozzarella|parmesan|feta|cream\s*cheese)\b/i)) {
    return { master: 'Dairy', sub: 'Cheese' };
  }

  if (has(/\b(double\s*cream|sour\s*cream|cream|milk|yoghurt|yogurt|butter)\b/i)) {
    return { master: 'Dairy', sub: 'Dairy' };
  }

  // Eggs
  if (has(/\b(egg|eggs)\b/i)) {
    return { master: 'Eggs', sub: 'Eggs' };
  }

  // Produce: vegetables, fruits, herbs, spices
  // Includes: onions, garlic, potatoes, tomatoes, peppers, ginger, chillies, herbs,
  // citrus, pineapple, peas, beans, leafy greens, etc.
  if (has(/\b(spring\s*onions?|brown\s*onions?|red\s*onions?|white\s*onions?|onions?|garlic|ginger|turmeric|cumin|coriander)\b/i)) {
    if (has(/\bgarlic\b/i)) return { master: 'Produce', sub: 'Garlic' };
    if (has(/\bginger\b/i)) return { master: 'Produce', sub: 'Ginger' };
    if (has(/\bonions?\b/i)) return { master: 'Produce', sub: 'Onions' };
    return { master: 'Produce', sub: 'Produce' };
  }

  if (has(/\b(potato|potatoes|kumara|sweet\s*potato|yam|parsnip)\b/i)) {
    return { master: 'Produce', sub: 'Potatoes' };
  }

  if (has(/\b(tomato|tomatoes|cherry\s*tomato)\b/i)) {
    return { master: 'Produce', sub: 'Tomatoes' };
  }

  if (has(/\b(chilli|chilies|chillies|capsicum|bell\s*pepper|pepper|red\s*pepper|green\s*pepper)\b/i)) {
    return { master: 'Produce', sub: 'Produce' };
  }

  if (has(/\b(broccoli|cauliflower|cabbage|lettuce|spinach|kale|bok\s*choy|celery|carrot|carrots|cucumber|zucchini|courgette|eggplant|aubergine)\b/i)) {
    return { master: 'Produce', sub: 'Produce' };
  }

  if (has(/\b(peas?|beans?|legume|lentil|chickpea|corn|sweetcorn)\b/i)) {
    return { master: 'Produce', sub: 'Produce' };
  }

  if (has(/\b(apple|apples|orange|oranges|banana|bananas|pineapple|strawberry|blueberry|raspberry|grape|grapes|kiwi|mango|pear|peach|lemon|lime|citrus)\b/i)) {
    return { master: 'Produce', sub: 'Produce' };
  }

  if (has(/\b(parsley|basil|coriander|cilantro|thyme|rosemary|oregano|mint|dill|chives|sage|herbs?)\b/i)) {
    return { master: 'Produce', sub: 'Produce' };
  }

  // Meat & Seafood: chicken, beef, pork, lamb, fish, prawns, etc.
  if (has(/\b(chicken|beef|pork|lamb|mince|ground\s*beef|ground\s*pork|sausage|bacon|ham|prosciutto)\b/i)) {
    return { master: 'Meat', sub: 'Meat' };
  }

  if (has(/\b(prawn|prawns|shrimp|fish|salmon|tuna|trout|cod|snapper|flathead|barramundi|seafood|scallop|squid|calamari|crab|lobster)\b/i)) {
    return { master: 'Meat', sub: 'Meat' };
  }

  // Condiments & Sauces
  if (has(/\b(aioli|bbq\s*sauce|barbecue\s*sauce|pesto|mayonnaise|mayo|tomato\s*sauce|soy\s*sauce|oyster\s*sauce|hoisin|sriracha|hot\s*sauce|worcestershire|vinegar)\b/i)) {
    return { master: 'Condiments', sub: 'Sauces' };
  }

  // Pantry / baking staples that often drift into Other/Action/Uncategorised
  if (has(/\b(vanilla|vanilla\s*extract|extract|essence|cornflour|corn\s*starch|cornstarch|gelatine|gelatin|baking\s*powder|baking\s*soda|yeast|flour|sugar|brown\s*sugar|caster\s*sugar|icing\s*sugar|cocoa|chocolate\s*chips?)\b/i)) {
    return { master: 'Pantry', sub: 'Dry Ingredients' };
  }

  // Last-pass rescue: if item is currently in Action or Uncategorised, try to map known food-like rows
  const current = String(currentMaster || '').trim().toLowerCase();
  if (current === 'action' || current === 'uncategorised' || current === 'other') {
    if (has(/\b(egg|eggs)\b/i)) return { master: 'Eggs', sub: 'Eggs' };
    
    if (has(/\b(ginger|chilli|chilies|chillies|capsicum|pepper|spring\s*onions?|onions?|garlic|pea|peas|bean|beans|pineapple|broccoli|carrot|cucumber|tomato|potato|kumara|coriander|cilantro|lime|lemon|herbs?|parsley|basil)\b/i)) {
      return { master: 'Produce', sub: 'Produce' };
    }
    
    if (has(/\b(chicken|beef|pork|lamb|mince|sausage|bacon|ham|prawn|prawns|shrimp|fish|salmon|tuna|seafood)\b/i)) {
      return { master: 'Meat', sub: 'Meat' };
    }

    if (has(/\b(cheese|milk|yogurt|butter|cream|dairy)\b/i)) {
      return { master: 'Dairy', sub: 'Dairy' };
    }

    if (has(/\b(vanilla|vanilla\s*extract|extract|essence|cornflour|corn\s*starch|cornstarch|gelatine|gelatin|flour|sugar|baking\s*powder|baking\s*soda)\b/i)) {
      return { master: 'Pantry', sub: 'Dry Ingredients' };
    }

    if (has(/\b(aioli|bbq\s*sauce|barbecue\s*sauce|pesto|mayonnaise|mayo|tomato\s*sauce|soy\s*sauce|oyster\s*sauce|hoisin|sriracha|hot\s*sauce|worcestershire|vinegar)\b/i)) {
      return { master: 'Condiments', sub: 'Sauces' };
    }
  }

  return { master: currentMaster || '', sub: currentSub || '' };
}

function unitFamily(unit) {
  const normalized = normalizeUnit(unit);
  if (!normalized) return 'none';
  if (normalized === 'tsp' || normalized === 'tbsp') return 'spoon';
  if (normalized === 'g' || normalized === 'kg') return 'weight';
  if (normalized === 'ml' || normalized === 'l') return 'volume';
  return 'other';
}

function roundFinalQtyForPurchase(qtyValue, unitValue) {
  const qty = Number(qtyValue);
  if (!Number.isFinite(qty)) return null;

  const unit = normalizeUnit(unitValue);
  const discreteUnits = new Set(['each', 'clove', 'piece', 'slice', 'can']);
  if (discreteUnits.has(unit) && qty > 0) {
    // Discrete items should be buyable whole quantities.
    return Math.ceil(qty - 1e-9);
  }

  return Math.round(qty * 10000) / 10000;
}

function toCanonicalQty(qtyValue, unitValue) {
  const parsed = parseFractionLikeInventory(qtyValue);
  const qty = Number.isFinite(parsed) ? parsed : Number.NaN;
  const unit = normalizeUnit(unitValue);
  const family = unitFamily(unit);

  if (!Number.isFinite(qty)) {
    return { qty: NaN, unit, family, wasConverted: false };
  }

  if (unit === 'cup') return { qty: qty * 48, unit: 'tsp', family: 'spoon', wasConverted: true };
  if (unit === 'tbsp') return { qty: qty * 3, unit: 'tsp', family: 'spoon', wasConverted: true };
  if (unit === 'tsp') return { qty, unit: 'tsp', family: 'spoon', wasConverted: false };
  if (unit === 'kg') return { qty: qty * 1000, unit: 'g', family: 'weight', wasConverted: true };
  if (unit === 'g') return { qty, unit: 'g', family: 'weight', wasConverted: false };
  if (unit === 'l') return { qty: qty * 1000, unit: 'ml', family: 'volume', wasConverted: true };
  if (unit === 'ml') return { qty, unit: 'ml', family: 'volume', wasConverted: false };

  return { qty, unit, family, wasConverted: false };
}

function buildUnitCompatibilityDiagnostics(items) {
  const byIngredient = new Map();

  for (const item of items || []) {
    const ingredientKey = `${normalizeKey(item.normalized_item_key || item.item_name)}||${normalizeKey(item.category)}`;
    if (!byIngredient.has(ingredientKey)) {
      byIngredient.set(ingredientKey, {
        item_name: item.item_name,
        category: item.category || 'Uncategorised',
        units: new Set(),
        families: new Set()
      });
    }
    const unit = normalizeUnit(item.base_unit);
    const family = unitFamily(unit);
    if (unit) byIngredient.get(ingredientKey).units.add(unit);
    if (family !== 'none') byIngredient.get(ingredientKey).families.add(family);
  }

  const warnings = [];
  const errors = [];

  byIngredient.forEach((entry) => {
    const units = Array.from(entry.units);
    const families = Array.from(entry.families);

    if (units.length <= 1) return;

    const hasMultipleFamilies = families.length > 1;
    const sameConvertibleFamily = families.length === 1 && ['spoon', 'weight', 'volume'].includes(families[0]);
    const allSameOtherFamily = families.length === 1 && families[0] === 'other' && units.length === 1;

    if (hasMultipleFamilies || (!sameConvertibleFamily && !allSameOtherFamily)) {
      errors.push(`"${entry.item_name}" in category "${entry.category}" uses incompatible units (${units.join(', ')}). Split into separate lines or standardize units before finalizing.`);
      return;
    }

    if (sameConvertibleFamily && units.length > 1) {
      warnings.push(`"${entry.item_name}" combines units (${units.join(', ')}) and is auto-converted to canonical ${families[0]} units.`);
    }
  });

  return { warnings, errors };
}

// ---------------------------------------------------------------------------
// Helper: validate that a date string falls on a Friday
// ---------------------------------------------------------------------------
function isFriday(dateStr) {
  const d = new Date(dateStr);
  // getDay() returns 5 for Friday (UTC)
  return !isNaN(d.getTime()) && d.getUTCDay() === 5;
}

// ===========================================================================
// POST /api/shopping-plan/create
// Create a new draft plan for a given week_ending Friday.
// Body: { week_ending: "YYYY-MM-DD", booking_ids?: number[], notes?: string }
// ===========================================================================
router.post('/create', requireAdmin, async (req, res) => {
  await ensureSchema();
  const { week_ending, booking_ids, notes } = req.body || {};

  if (!week_ending) {
    return res.status(400).json({ success: false, error: 'week_ending is required (YYYY-MM-DD Friday).' });
  }
  if (!isFriday(week_ending)) {
    return res.status(400).json({ success: false, error: 'week_ending must be a Friday.' });
  }

  const email = requestEmail(req);

  try {
    // Determine next version number for this week
    const versionRes = await pool.query(
      'SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM shopping_plan WHERE week_ending = $1',
      [week_ending]
    );
    const version = versionRes.rows[0].next_version;

    // Create the plan
    const planRes = await pool.query(
      `INSERT INTO shopping_plan (week_ending, status, version, created_by, notes)
       VALUES ($1, 'draft', $2, $3, $4)
       RETURNING *`,
      [week_ending, version, email, notes || null]
    );
    const plan = planRes.rows[0];

    // Snapshot classes from provided booking_ids (if any)
    if (Array.isArray(booking_ids) && booking_ids.length > 0) {
      const safeIds = booking_ids.map(Number).filter(Number.isInteger);
      if (safeIds.length > 0) {
        const bookingsRes = await pool.query(
          `SELECT id, staff_name, class_name, recipe_id, class_size
           FROM bookings
           WHERE id = ANY($1::int[])`,
          [safeIds]
        );
        if (bookingsRes.rows.length > 0) {
          const insertValues = bookingsRes.rows.map((b, i) => {
            const base = i * 6;
            return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
          });
          const flatParams = [];
          bookingsRes.rows.forEach((b, i) => {
            flatParams.push(plan.id, b.id, b.class_name || '', b.staff_name || null, b.recipe_id || null, b.class_size || null);
          });
          await pool.query(
            `INSERT INTO shopping_plan_classes (plan_id, booking_id, class_name, teacher_name, recipe_id, planned_servings)
             VALUES ${insertValues.join(', ')}`,
            flatParams
          );
        }
      }
    }

    return res.status(201).json({ success: true, plan });
  } catch (err) {
    console.error('[shopping-plan] POST /create error:', err.message);
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'A plan for this week and version already exists.' });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ===========================================================================
// POST /api/shopping-plan/:id/generate-draft
// Aggregate ingredient quantities from desired_servings_ingredients for all
// included classes in this plan. Replaces any existing items for this plan.
// ===========================================================================
router.post('/:id/generate-draft', requireAdmin, async (req, res) => {
  const planId = parseInt(req.params.id, 10);
  if (!Number.isInteger(planId) || planId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid plan ID.' });
  }

  const refreshFromInventory = !!(req.body && req.body.refresh_from_inventory);

  try {
    await ensureSchema();
    // Confirm plan exists and is still a draft
    const planRes = await pool.query('SELECT * FROM shopping_plan WHERE id = $1', [planId]);
    if (planRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Plan not found.' });
    }
    if (planRes.rows[0].status !== 'draft') {
      return res.status(409).json({ success: false, error: 'Cannot regenerate a finalized plan.' });
    }

    // Fetch included classes for this plan that have a booking_id
    const classesRes = await pool.query(
      `SELECT spc.booking_id, spc.class_name, spc.teacher_name, spc.recipe_id, spc.planned_servings
       FROM shopping_plan_classes spc
       WHERE spc.plan_id = $1 AND spc.included = true AND spc.booking_id IS NOT NULL`,
      [planId]
    );

    if (classesRes.rowCount === 0) {
      return res.status(422).json({ success: false, error: 'No included classes with booking IDs found. Add classes to the plan first.' });
    }

    const bookingIds = classesRes.rows.map(r => r.booking_id);

    // Pull scaled ingredients for all included bookings from desired_servings_ingredients
    let dsiRes = await pool.query(
      `SELECT
         dsi.booking_id,
         dsi.ingredient_name,
         dsi.fooditem,
         dsi.stripfooditem,
        dsi.measure_qty,
         dsi.measure_unit,
        dsi.desired_servings,
         dsi.calculated_qty,
         COALESCE(ac.name, 'Uncategorised') AS category,
         COALESCE(NULLIF(trim(ac.master_category), ''), ac.name, 'Uncategorised') AS master_category
       FROM desired_servings_ingredients dsi
       LEFT JOIN aisle_category ac ON ac.id = dsi.aisle_category_id
       WHERE dsi.booking_id = ANY($1::int[])`,
      [bookingIds]
    );

    // Auto-fill missing desired-serving rows from recipe ingredients when possible.
    // This removes the manual "Calculate Servings" bottleneck for shopping draft generation.
    const existingDsiBookingIds = new Set(dsiRes.rows.map((r) => Number(r.booking_id)).filter(Number.isInteger));
    const missingBookingIds = bookingIds.filter((id) => !existingDsiBookingIds.has(Number(id)));
    const bookingIdsForAutofill = refreshFromInventory ? bookingIds : missingBookingIds;
    let autofilledClasses = 0;
    let skippedAutofillClasses = 0;

    if (bookingIdsForAutofill.length > 0) {
      const bookingsForAutofillRes = await pool.query(
        `SELECT id AS booking_id, staff_name, staff_id, class_name, booking_date, class_size, groups, recipe_id
         FROM bookings
         WHERE id = ANY($1::int[])`,
        [bookingIdsForAutofill]
      );

      const recipeIds = Array.from(new Set(
        bookingsForAutofillRes.rows
          .map((b) => Number(b.recipe_id))
          .filter((id) => Number.isInteger(id) && id > 0)
      ));

      const ingredientsByRecipeId = new Map();
      if (recipeIds.length > 0) {
        const invRes = await pool.query(
          `SELECT recipe_id, id, ingredient_name, measure_qty, measure_unit, fooditem, stripfooditem, aisle_category_id
           FROM ingredients_inventory
           WHERE recipe_id = ANY($1::int[])`,
          [recipeIds]
        );
        for (const ing of invRes.rows) {
          const rid = Number(ing.recipe_id);
          if (!ingredientsByRecipeId.has(rid)) ingredientsByRecipeId.set(rid, []);
          ingredientsByRecipeId.get(rid).push(ing);
        }
      }

      for (const b of bookingsForAutofillRes.rows) {
        const recipeId = Number(b.recipe_id);
        const classSize = Number(b.class_size);
        const groups = Number(b.groups);
        const ingredients = ingredientsByRecipeId.get(recipeId) || [];

        if (!Number.isInteger(recipeId) || recipeId <= 0 || !Number.isFinite(classSize) || classSize <= 0 || !Number.isFinite(groups) || groups <= 0 || !ingredients.length) {
          skippedAutofillClasses += 1;
          continue;
        }

        const desiredServings = Math.ceil(classSize / groups);

        const payloadIngredients = ingredients.map((ing) => {
          const baseQty = parseFractionLikeInventory(ing.measure_qty);
          const calculatedQty = Number.isFinite(baseQty) ? (baseQty * desiredServings) : null;
          return {
            ingredient_id: ing.id || null,
            ingredient_name: ing.ingredient_name || '',
            measure_qty: ing.measure_qty || '',
            measure_unit: ing.measure_unit || '',
            fooditem: ing.fooditem || '',
            calculated_qty: calculatedQty,
            stripFoodItem: ing.stripfooditem || ing.fooditem || ing.ingredient_name || '',
            aisle_category_id: ing.aisle_category_id || null
          };
        });

        await saveDesiredServingsPayload({
          booking_id: b.booking_id,
          teacher: b.staff_name || '',
          staff_id: b.staff_id || null,
          class_name: b.class_name || '',
          class_date: b.booking_date,
          class_size: classSize,
          groups,
          desired_servings: desiredServings,
          recipe_id: recipeId,
          ingredients: payloadIngredients
        });

        autofilledClasses += 1;
      }

      // Refresh DSI rows now that missing classes may have been auto-filled.
      dsiRes = await pool.query(
        `SELECT
           dsi.booking_id,
           dsi.ingredient_name,
           dsi.fooditem,
           dsi.stripfooditem,
            dsi.measure_qty,
           dsi.measure_unit,
            dsi.desired_servings,
           dsi.calculated_qty,
           COALESCE(ac.name, 'Uncategorised') AS category,
           COALESCE(NULLIF(trim(ac.master_category), ''), ac.name, 'Uncategorised') AS master_category
         FROM desired_servings_ingredients dsi
         LEFT JOIN aisle_category ac ON ac.id = dsi.aisle_category_id
         WHERE dsi.booking_id = ANY($1::int[])`,
        [bookingIds]
      );
    }

    // Group by normalised ingredient key + category + canonical unit.
    // This allows tsp/tbsp, g/kg, ml/l to combine safely while keeping
    // incompatible units separated for explicit review.
    const aisleKeywordRes = await pool.query(
      `SELECT lower(trim(ak.keyword)) AS keyword,
              coalesce(nullif(trim(ac.master_category), ''), ac.name, 'Uncategorised') AS master_category,
              coalesce(ac.name, 'Uncategorised') AS sub_aisle
       FROM aisle_keywords ak
       LEFT JOIN aisle_category ac ON ac.id = ak.aisle_category_id
       WHERE trim(coalesce(ak.keyword, '')) <> ''
       ORDER BY length(trim(ak.keyword)) DESC, ak.id ASC`
    );
    const aisleKeywords = Array.isArray(aisleKeywordRes.rows) ? aisleKeywordRes.rows : [];

    const itemMap = new Map();
    const classLookup = new Map(classesRes.rows.map(r => [r.booking_id, r]));

    for (const row of dsiRes.rows) {
      const rawSourceName = String(row.stripfooditem || row.fooditem || row.ingredient_name || '').trim();
      const extracted = extractQuantityUnitFromText(rawSourceName);
      const rawName = cleanIngredientName(extracted.name || rawSourceName);
      let unit = normalizeUnit(String(row.measure_unit || extracted.unit || '').trim());
      if (!unit) {
        const rawLower = rawSourceName.toLowerCase();
        if (/^\s*\d+\s*t\b\.?\s*of\s+/.test(rawLower) || /^\s*\d+t\b\.?\s*of\s+/.test(rawLower) || /^\s*t\b\.?\s*of\s+/.test(rawLower)) {
          unit = 'tbsp';
        }
      }
      const explicitCalculated = parseFractionLikeInventory(row.calculated_qty);
      const fallbackBase = parseFractionLikeInventory(row.measure_qty);
      const desiredServings = parseFractionLikeInventory(row.desired_servings);
      const effectiveQty = Number.isFinite(explicitCalculated)
        ? explicitCalculated
        : (Number.isFinite(fallbackBase) && Number.isFinite(desiredServings)
          ? (fallbackBase * desiredServings)
          : (Number.isFinite(extracted.qty) ? extracted.qty : Number.NaN));
      const canonical = toCanonicalQty(effectiveQty, unit);
      const canonicalUnit = canonical.unit || normalizeUnit(unit) || '';
      const displayNameRaw = (extracted.matched && (Number.isFinite(effectiveQty) || !!unit))
        ? rawName
        : rawSourceName;
      const displayName = sanitizeCorruptedIngredientName(displayNameRaw, canonicalUnit || unit);
      let resolvedSubAisle = String(row.category || 'Uncategorised').trim() || 'Uncategorised';
      let resolvedCategory = String(row.master_category || resolvedSubAisle || 'Uncategorised').trim() || 'Uncategorised';
      const matchedCategory = resolveCategoryFromKeywords(displayName, aisleKeywords);
      if (matchedCategory.master) resolvedCategory = matchedCategory.master;
      if (matchedCategory.sub) resolvedSubAisle = matchedCategory.sub;

      const enforcedCategory = enforceCriticalCategory(displayName, resolvedCategory, resolvedSubAisle);
      if (enforcedCategory.master) resolvedCategory = enforcedCategory.master;
      if (enforcedCategory.sub) resolvedSubAisle = enforcedCategory.sub;

      const mergeName = normalizedMergeIngredientName(displayName) || normalizeKey(displayName);
      const itemDisplayName = displayNameFromMergeName(mergeName, displayName);
      const key = normalizeKey(mergeName) + '||' + normalizeKey(resolvedCategory) + '||' + normalizeKey(resolvedSubAisle) + '||' + normalizeKey(canonicalUnit);
      const qty = Number.isFinite(canonical.qty) ? canonical.qty : 0;
      const cls = classLookup.get(row.booking_id);

      if (!itemMap.has(key)) {
        itemMap.set(key, {
          category: resolvedCategory,
          sub_aisle: resolvedSubAisle,
          item_name: itemDisplayName,
          normalized_item_key: normalizeKey(mergeName),
          base_unit: canonicalUnit,
          calculated_qty: 0,
          sources: []
        });
      }
      const entry = itemMap.get(key);
      entry.calculated_qty += qty;
      entry.sources.push({
        booking_id: row.booking_id,
        class_name: cls ? cls.class_name : null,
        teacher_name: cls ? cls.teacher_name : null,
        qty: Number.isFinite(effectiveQty) ? effectiveQty : null,
        unit,
        canonical_qty: Number.isFinite(canonical.qty) ? canonical.qty : null,
        canonical_unit: canonicalUnit,
        was_converted: canonical.wasConverted
      });
    }

    // Unit repair pass: if quantity exists but unit is blank, infer from source detail or text.
    for (const entry of itemMap.values()) {
      if (entry.base_unit || !(Number(entry.calculated_qty) > 0)) continue;

      const sourceUnit = (Array.isArray(entry.sources)
        ? entry.sources.map((s) => normalizeUnit(s && s.unit)).find(Boolean)
        : '') || '';
      if (sourceUnit) {
        entry.base_unit = sourceUnit;
        continue;
      }

      const parsedFromName = extractQuantityUnitFromText(entry.item_name || '');
      if (parsedFromName.unit) {
        entry.base_unit = normalizeUnit(parsedFromName.unit);
      } else if (Number.isFinite(parsedFromName.qty)) {
        entry.base_unit = 'each';
      }
    }

    // Delete existing auto-generated items (source_type = 'recipe_scale') for this plan
    await pool.query(
      `DELETE FROM shopping_plan_items WHERE plan_id = $1 AND (source_type = 'recipe_scale' OR source_type IS NULL)`,
      [planId]
    );

    // Bulk insert the new aggregated items
    if (itemMap.size > 0) {
      const entries = Array.from(itemMap.values());
      const valueClauses = entries.map((_, i) => {
        const b = i * 8;
        return `($${b+1}, $${b+2}, $${b+3}, $${b+4}, $${b+5}, $${b+6}, $${b+7}, $${b+8})`;
      });
      const flatParams = [];
      entries.forEach((e, i) => {
        flatParams.push(
          planId,
          e.category,
          e.sub_aisle || null,
          e.item_name,
          e.normalized_item_key,
          e.base_unit || null,
          Math.round(e.calculated_qty * 10000) / 10000,
          JSON.stringify(e.sources)
        );
      });
      await pool.query(
        `INSERT INTO shopping_plan_items
           (plan_id, category, sub_aisle, item_name, normalized_item_key, base_unit, calculated_qty, source_type, source_detail_json, sort_order)
         VALUES ${valueClauses.map((v, i) => {
           // re-map to include source_type literal and sort_order
           const b = i * 8;
           return `($${b+1}, $${b+2}, $${b+3}, $${b+4}, $${b+5}, $${b+6}, $${b+7}, 'recipe_scale', $${b+8}, ${i})`;
         }).join(', ')}`,
        flatParams
      );
    }

    const itemCount = itemMap.size;
    const diagnostics = buildUnitCompatibilityDiagnostics(Array.from(itemMap.values()));
    return res.json({
      success: true,
      items_generated: itemCount,
      autofilled_classes: autofilledClasses,
      skipped_autofill_classes: skippedAutofillClasses,
      warnings: diagnostics.warnings
    });
  } catch (err) {
    console.error('[shopping-plan] POST /:id/generate-draft error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ===========================================================================
// GET /api/shopping-plan (list)
// Return summary list of all plans, most recent first.
// ===========================================================================
router.get('/', requireAdmin, async (req, res) => {
  try {
    await ensureSchema();
    const result = await pool.query(
      `SELECT id, week_ending, status, version, created_by, created_at, finalized_at, notes
       FROM shopping_plan
       ORDER BY week_ending DESC, version DESC`
    );
    return res.json({ success: true, plans: result.rows });
  } catch (err) {
    console.error('[shopping-plan] GET / error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ===========================================================================
// GET /api/shopping-plan/:id
// Return full plan: header + classes + items + warnings.
// ===========================================================================
router.get('/:id', requireAdmin, async (req, res) => {
  const planId = parseInt(req.params.id, 10);
  if (!Number.isInteger(planId) || planId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid plan ID.' });
  }

  try {
    await ensureSchema();
    const [planRes, classesRes, itemsRes] = await Promise.all([
      pool.query('SELECT * FROM shopping_plan WHERE id = $1', [planId]),
      pool.query(
        'SELECT * FROM shopping_plan_classes WHERE plan_id = $1 ORDER BY sort_order, id',
        [planId]
      ),
      pool.query(
        'SELECT * FROM shopping_plan_items WHERE plan_id = $1 ORDER BY category, sort_order, id',
        [planId]
      )
    ]);

    if (planRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Plan not found.' });
    }

    // Soft warnings
    const warnings = [];
    const classesWithNoIngredients = classesRes.rows
      .filter(c => c.included && c.booking_id)
      .map(c => c.booking_id)
      .filter(bid => !itemsRes.rows.some(item =>
        item.source_detail_json &&
        item.source_detail_json.some &&
        item.source_detail_json.some(s => s.booking_id === bid)
      ));
    if (classesWithNoIngredients.length > 0) {
      warnings.push(`${classesWithNoIngredients.length} class(es) have no ingredient data. Teachers need to complete the Calculate Servings step for those classes, then click Regenerate Draft to pick up their ingredients.`);
    }

    const itemsMissingUnit = itemsRes.rows.filter(item => !item.base_unit && item.calculated_qty > 0);
    if (itemsMissingUnit.length > 0) {
      warnings.push(`${itemsMissingUnit.length} item(s) are missing a unit. Review before finalizing.`);
    }

    const unitDiagnostics = buildUnitCompatibilityDiagnostics(itemsRes.rows);
    warnings.push(...unitDiagnostics.warnings);
    if (unitDiagnostics.errors.length > 0) {
      warnings.push(`${unitDiagnostics.errors.length} unit compatibility issue(s) must be fixed before finalizing.`);
    }

    const recipeIds = classesRes.rows
      .filter((c) => c.included && Number.isInteger(Number(c.recipe_id)) && Number(c.recipe_id) > 0)
      .map((c) => Number(c.recipe_id));

    if (recipeIds.length > 0) {
      const yieldCheck = await pool.query(
        `SELECT id
         FROM recipes
         WHERE id = ANY($1::int[])
           AND (serving_size IS NULL OR serving_size <= 0)`,
        [recipeIds]
      );

      if (yieldCheck.rowCount > 0) {
        warnings.push(`${yieldCheck.rowCount} class recipe(s) have missing or zero serving size. Quantity scaling may be inaccurate.`);
      }
    }

    return res.json({
      success: true,
      plan: planRes.rows[0],
      classes: classesRes.rows,
      items: itemsRes.rows,
      warnings
    });
  } catch (err) {
    console.error('[shopping-plan] GET /:id error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ===========================================================================
// PUT /api/shopping-plan/:id/items
// Save teacher edits: update teacher_qty, base_unit, category, notes per item.
// Also supports adding new manual rows and deleting rows (by item id).
// Body: {
//   updates?: [{ id, teacher_qty?, base_unit?, category?, sub_aisle?, notes? }],
//   adds?:    [{ category, sub_aisle, item_name, base_unit, teacher_qty, notes }],
//   deletes?: [id]
// }
// Writes audit records for any changed numeric/text field.
// ===========================================================================
router.put('/:id/items', requireAdmin, async (req, res) => {
  await ensureSchema();
  const planId = parseInt(req.params.id, 10);
  if (!Number.isInteger(planId) || planId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid plan ID.' });
  }

  const { updates = [], adds = [], deletes = [] } = req.body || {};
  const email = requestEmail(req);

  try {
    const planRes = await pool.query('SELECT status FROM shopping_plan WHERE id = $1', [planId]);
    if (planRes.rowCount === 0) return res.status(404).json({ success: false, error: 'Plan not found.' });
    if (planRes.rows[0].status !== 'draft') {
      return res.status(409).json({ success: false, error: 'Cannot edit a finalized plan. Reopen it first.' });
    }

    // -- Process deletes --
    if (deletes.length > 0) {
      const safeDeletes = deletes.map(Number).filter(Number.isInteger);
      if (safeDeletes.length > 0) {
        await pool.query(
          'DELETE FROM shopping_plan_items WHERE id = ANY($1::int[]) AND plan_id = $2',
          [safeDeletes, planId]
        );
      }
    }

    // -- Process updates --
    for (const upd of updates) {
      const itemId = parseInt(upd.id, 10);
      if (!Number.isInteger(itemId) || itemId <= 0) continue;

      const existing = await pool.query(
        'SELECT * FROM shopping_plan_items WHERE id = $1 AND plan_id = $2',
        [itemId, planId]
      );
      if (existing.rowCount === 0) continue;
      const row = existing.rows[0];

      const auditEntries = [];
      const setClauses = [];
      const params = [];

      const trackField = (field, newVal) => {
        const oldVal = row[field] !== null && row[field] !== undefined ? String(row[field]) : null;
        const newValStr = newVal !== null && newVal !== undefined ? String(newVal) : null;
        if (oldVal !== newValStr) {
          auditEntries.push({ field_name: field, old_value: oldVal, new_value: newValStr });
        }
        params.push(newVal !== undefined ? newVal : row[field]);
        setClauses.push(`${field} = $${params.length}`);
      };

      if (upd.teacher_qty !== undefined) trackField('teacher_qty', upd.teacher_qty !== '' ? upd.teacher_qty : null);
      if (upd.base_unit !== undefined)   trackField('base_unit', upd.base_unit || null);
      if (upd.category !== undefined)    trackField('category', upd.category || 'Uncategorised');
      if (upd.sub_aisle !== undefined)   trackField('sub_aisle', upd.sub_aisle || null);
      if (upd.notes !== undefined)       trackField('notes', upd.notes || null);

      if (setClauses.length > 0) {
        params.push(email, new Date().toISOString(), itemId, planId);
        await pool.query(
          `UPDATE shopping_plan_items
           SET ${setClauses.join(', ')}, edited_by = $${params.length - 3}, edited_at = $${params.length - 2}
           WHERE id = $${params.length - 1} AND plan_id = $${params.length}`,
          params
        );

        // Write audit records
        for (const entry of auditEntries) {
          await pool.query(
            `INSERT INTO shopping_plan_item_audit (plan_item_id, field_name, old_value, new_value, reason, changed_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [itemId, entry.field_name, entry.old_value, entry.new_value, upd.reason || null, email]
          );
        }
      }
    }

    // -- Process adds (manual rows) --
    for (const add of adds) {
      const itemName = String(add.item_name || '').trim();
      if (!itemName) continue;
      await pool.query(
        `INSERT INTO shopping_plan_items
           (plan_id, category, sub_aisle, item_name, normalized_item_key, base_unit, teacher_qty, source_type, notes, edited_by, edited_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', $8, $9, NOW())`,
        [
          planId,
          add.category || 'Uncategorised',
          add.sub_aisle || null,
          itemName,
          normalizeKey(itemName),
          add.base_unit || null,
          add.teacher_qty !== undefined ? add.teacher_qty : null,
          add.notes || null,
          email
        ]
      );
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[shopping-plan] PUT /:id/items error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ===========================================================================
// POST /api/shopping-plan/:id/fix-legacy-units
// One-click repair for legacy rows that were saved before improved unit parsing.
// Normalizes unit aliases/typos and cleans item names that include leading units.
// Draft plans only.
// ===========================================================================
router.post('/:id/fix-legacy-units', requireAdmin, async (req, res) => {
  await ensureSchema();
  const planId = parseInt(req.params.id, 10);
  if (!Number.isInteger(planId) || planId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid plan ID.' });
  }

  const email = requestEmail(req);

  try {
    const planRes = await pool.query('SELECT status FROM shopping_plan WHERE id = $1', [planId]);
    if (planRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Plan not found.' });
    }
    if (String(planRes.rows[0].status || '').toLowerCase() !== 'draft') {
      return res.status(409).json({ success: false, error: 'Only draft plans can be repaired.' });
    }

    const itemsRes = await pool.query(
      `SELECT id, item_name, normalized_item_key, base_unit, calculated_qty, source_detail_json
       FROM shopping_plan_items
       WHERE plan_id = $1
       ORDER BY id`,
      [planId]
    );

    let rowsUpdated = 0;
    let unitsInferred = 0;
    let namesCleaned = 0;

    for (const item of itemsRes.rows) {
      const currentName = String(item.item_name || '').trim();
      const currentUnit = normalizeUnit(item.base_unit);

      let nextUnit = currentUnit;
      const fromSourceUnit = (Array.isArray(item.source_detail_json)
        ? item.source_detail_json.map((s) => normalizeUnit(s && s.unit)).find(Boolean)
        : '') || '';

      const parsed = extractQuantityUnitFromText(currentName);
      if (!nextUnit && fromSourceUnit) {
        nextUnit = fromSourceUnit;
      }
      if (!nextUnit && parsed.unit) {
        nextUnit = normalizeUnit(parsed.unit);
      }
      if (!nextUnit && Number(item.calculated_qty) > 0 && Number.isFinite(parsed.qty)) {
        nextUnit = 'each';
      }

      const cleanedName = cleanIngredientName(parsed.name || currentName);
      const sanitizedName = sanitizeCorruptedIngredientName(cleanedName || currentName, nextUnit || currentUnit);
      const nextName = String(sanitizedName || currentName).trim() || currentName;
      const nextNormalizedKey = normalizeKey(normalizedMergeIngredientName(nextName) || nextName);

      const changedUnit = nextUnit !== currentUnit;
      const changedName = nextName !== currentName;
      const changedKey = nextNormalizedKey !== normalizeKey(item.normalized_item_key || currentName);
      if (!changedUnit && !changedName && !changedKey) continue;

      await pool.query(
        `UPDATE shopping_plan_items
         SET item_name = $1,
             normalized_item_key = $2,
             base_unit = $3,
             edited_by = $4,
             edited_at = NOW()
         WHERE id = $5 AND plan_id = $6`,
        [
          nextName,
          nextNormalizedKey || null,
          nextUnit || null,
          email,
          item.id,
          planId
        ]
      );

      rowsUpdated += 1;
      if (changedUnit && !currentUnit && nextUnit) unitsInferred += 1;
      if (changedName) namesCleaned += 1;
    }

    return res.json({
      success: true,
      updated: rowsUpdated,
      units_inferred: unitsInferred,
      names_cleaned: namesCleaned
    });
  } catch (err) {
    console.error('[shopping-plan] POST /:id/fix-legacy-units error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ===========================================================================
// POST /api/shopping-plan/:id/finalize
// Compute final_qty for every item, then lock the plan to status=finalized.
// Blocks on: negative quantities, NaN quantities for items that have a unit.
// ===========================================================================
router.post('/:id/finalize', requireAdmin, async (req, res) => {
  const planId = parseInt(req.params.id, 10);
  if (!Number.isInteger(planId) || planId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid plan ID.' });
  }

  const email = requestEmail(req);

  try {
    await ensureSchema();
    const planRes = await pool.query('SELECT * FROM shopping_plan WHERE id = $1', [planId]);
    if (planRes.rowCount === 0) return res.status(404).json({ success: false, error: 'Plan not found.' });
    if (planRes.rows[0].status !== 'draft') {
      return res.status(409).json({ success: false, error: 'Plan is already finalized.' });
    }

    const itemsRes = await pool.query(
      'SELECT * FROM shopping_plan_items WHERE plan_id = $1',
      [planId]
    );

    const body = req.body || {};
    const useSafetyBuffer = body.use_safety_buffer === true;
    const defaultSafetyBufferPercent = Number(body.default_safety_buffer_percent);
    const rawCategoryBuffer = body.safety_buffer_by_category && typeof body.safety_buffer_by_category === 'object'
      ? body.safety_buffer_by_category
      : {};
    const categoryBuffer = {};
    Object.keys(rawCategoryBuffer).forEach((k) => {
      const parsed = Number(rawCategoryBuffer[k]);
      if (Number.isFinite(parsed) && parsed >= 0) {
        categoryBuffer[normalizeKey(k)] = parsed;
      }
    });

    // Validation: block on bad quantities
    const errors = [];
    const unitDiagnostics = buildUnitCompatibilityDiagnostics(itemsRes.rows);
    errors.push(...unitDiagnostics.errors);
    for (const item of itemsRes.rows) {
      const effective = item.teacher_qty !== null ? parseFloat(item.teacher_qty) : parseFloat(item.calculated_qty);
      if (!item.base_unit && Number.isFinite(effective) && effective > 0) {
        errors.push(`"${item.item_name}" has quantity ${effective} but no unit.`);
      }
      if (item.base_unit && (isNaN(effective) || effective === null)) {
        errors.push(`"${item.item_name}" has a unit but no valid quantity.`);
      }
      if (Number.isFinite(effective) && effective < 0) {
        errors.push(`"${item.item_name}" has a negative quantity (${effective}).`);
      }
    }
    if (errors.length > 0) {
      return res.status(422).json({ success: false, errors });
    }

    const aisleKeywordRes = await pool.query(
      `SELECT lower(trim(ak.keyword)) AS keyword,
              coalesce(nullif(trim(ac.master_category), ''), ac.name, 'Uncategorised') AS master_category,
              coalesce(ac.name, 'Uncategorised') AS sub_aisle
       FROM aisle_keywords ak
       LEFT JOIN aisle_category ac ON ac.id = ak.aisle_category_id
       WHERE trim(coalesce(ak.keyword, '')) <> ''
       ORDER BY length(trim(ak.keyword)) DESC, ak.id ASC`
    );
    const aisleKeywords = Array.isArray(aisleKeywordRes.rows) ? aisleKeywordRes.rows : [];

    // Compute and store final_qty for each item
    for (const item of itemsRes.rows) {
      let workingCategory = String(item.category || 'Uncategorised').trim() || 'Uncategorised';
      let workingSubAisle = String(item.sub_aisle || '').trim() || null;

      const matchedCategory = resolveCategoryFromKeywords(item.item_name, aisleKeywords);
      if (matchedCategory.master) workingCategory = matchedCategory.master;
      if (matchedCategory.sub) workingSubAisle = matchedCategory.sub;

      const enforcedCategory = enforceCriticalCategory(item.item_name, workingCategory, workingSubAisle);
      if (enforcedCategory.master) workingCategory = enforcedCategory.master;
      if (enforcedCategory.sub) workingSubAisle = enforcedCategory.sub;

      const baseFinalQty = item.teacher_qty !== null
        ? parseFloat(item.teacher_qty)
        : (item.calculated_qty !== null ? parseFloat(item.calculated_qty) : null);

      let finalQty = baseFinalQty;
      if (useSafetyBuffer && Number.isFinite(baseFinalQty)) {
        const categoryKey = normalizeKey(workingCategory || '');
        const categoryPercent = Number(categoryBuffer[categoryKey]);
        const fallbackPercent = Number.isFinite(defaultSafetyBufferPercent) && defaultSafetyBufferPercent >= 0
          ? defaultSafetyBufferPercent
          : 0;
        const bufferPercent = Number.isFinite(categoryPercent) ? categoryPercent : fallbackPercent;
        finalQty = baseFinalQty * (1 + (bufferPercent / 100));
      }

      const roundedFinalQty = roundFinalQtyForPurchase(finalQty, item.base_unit);

      await pool.query(
        'UPDATE shopping_plan_items SET category = $1, sub_aisle = $2, final_qty = $3 WHERE id = $4',
        [workingCategory, workingSubAisle, roundedFinalQty, item.id]
      );
    }

    // Lock the plan
    await pool.query(
      `UPDATE shopping_plan
       SET status = 'finalized', finalized_by = $1, finalized_at = NOW()
       WHERE id = $2`,
      [email, planId]
    );

    return res.json({
      success: true,
      message: 'Plan finalized.',
      safety_buffer_applied: useSafetyBuffer === true,
      warnings: unitDiagnostics.warnings
    });
  } catch (err) {
    console.error('[shopping-plan] POST /:id/finalize error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ===========================================================================
// POST /api/shopping-plan/:id/reopen
// Copy a finalized plan into a new draft at the next version number.
// Items with teacher_qty carry forward; calculated_qty is preserved.
// ===========================================================================
router.post('/:id/reopen', requireAdmin, async (req, res) => {
  const planId = parseInt(req.params.id, 10);
  if (!Number.isInteger(planId) || planId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid plan ID.' });
  }

  const email = requestEmail(req);

  try {
    await ensureSchema();
    const planRes = await pool.query('SELECT * FROM shopping_plan WHERE id = $1', [planId]);
    if (planRes.rowCount === 0) return res.status(404).json({ success: false, error: 'Plan not found.' });
    const original = planRes.rows[0];

    if (original.status !== 'finalized') {
      return res.status(409).json({ success: false, error: 'Only finalized plans can be reopened.' });
    }

    // Next version for this week
    const versionRes = await pool.query(
      'SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM shopping_plan WHERE week_ending = $1',
      [original.week_ending]
    );
    const newVersion = versionRes.rows[0].next_version;

    // Create new draft
    const newPlanRes = await pool.query(
      `INSERT INTO shopping_plan (week_ending, status, version, created_by, notes)
       VALUES ($1, 'draft', $2, $3, $4)
       RETURNING *`,
      [original.week_ending, newVersion, email, original.notes]
    );
    const newPlan = newPlanRes.rows[0];

    // Copy classes
    await pool.query(
      `INSERT INTO shopping_plan_classes
         (plan_id, booking_id, class_name, teacher_name, recipe_id, planned_servings, included, sort_order)
       SELECT $1, booking_id, class_name, teacher_name, recipe_id, planned_servings, included, sort_order
       FROM shopping_plan_classes
       WHERE plan_id = $2`,
      [newPlan.id, planId]
    );

    // Copy items (reset final_qty; preserve teacher overrides)
    await pool.query(
      `INSERT INTO shopping_plan_items
        (plan_id, category, sub_aisle, item_name, normalized_item_key, base_unit,
         calculated_qty, teacher_qty, source_type, source_detail_json, notes, sort_order)
       SELECT $1, category, sub_aisle, item_name, normalized_item_key, base_unit,
            calculated_qty, teacher_qty, source_type, source_detail_json, notes, sort_order
       FROM shopping_plan_items
       WHERE plan_id = $2`,
      [newPlan.id, planId]
    );

    return res.status(201).json({ success: true, plan: newPlan });
  } catch (err) {
    console.error('[shopping-plan] POST /:id/reopen error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ===========================================================================
// GET /api/shopping-plan/:id/technician-view
// Read-only finalized list grouped by category.
// Accessible to any logged-in user (no admin required).
// ===========================================================================
router.get('/:id/technician-view', async (req, res) => {
  const planId = parseInt(req.params.id, 10);
  if (!Number.isInteger(planId) || planId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid plan ID.' });
  }

  try {
    await ensureSchema();
    const planRes = await pool.query(
      'SELECT id, week_ending, status, version, finalized_by, finalized_at, notes FROM shopping_plan WHERE id = $1',
      [planId]
    );
    if (planRes.rowCount === 0) return res.status(404).json({ success: false, error: 'Plan not found.' });

    const plan = planRes.rows[0];
    if (plan.status !== 'finalized') {
      return res.status(409).json({ success: false, error: 'This plan has not been finalized yet.' });
    }

    const itemsRes = await pool.query(
      `SELECT category, sub_aisle, item_name, base_unit, final_qty, notes, source_detail_json
       FROM shopping_plan_items
       WHERE plan_id = $1
         AND COALESCE(final_qty, 0) > 0
       ORDER BY category, sort_order, id`,
      [planId]
    );

    const brandsRes = await pool.query('SELECT brand_name FROM food_brands');
    const brands = (brandsRes.rows || []).map((r) => r.brand_name);

    const bookingIds = new Set();
    for (const item of itemsRes.rows) {
      const sources = Array.isArray(item.source_detail_json) ? item.source_detail_json : [];
      for (const src of sources) {
        const bookingId = Number(src && src.booking_id);
        if (Number.isInteger(bookingId) && bookingId > 0) bookingIds.add(bookingId);
      }
    }

    const bookingDayMap = new Map();
    if (bookingIds.size > 0) {
      const bookingRes = await pool.query(
        `SELECT id, booking_date
         FROM bookings
         WHERE id = ANY($1::int[])`,
        [Array.from(bookingIds)]
      );
      for (const row of bookingRes.rows) {
        const dayName = weekdayNameFromDateValue(row.booking_date);
        if (dayName) bookingDayMap.set(Number(row.id), dayName);
      }
    }

    // Group by category and merge duplicate ingredient variants for display.
    const groupedMaps = {};
    const weekdayGroupedMaps = {};
    for (const item of itemsRes.rows) {
      const brandedName = stripFoodBrandFromItemName(item.item_name, brands) || item.item_name;
      const displayName = sanitizeCorruptedIngredientName(brandedName, item.base_unit);
      if (isNonShoppingMetadataIngredient(displayName)) {
        continue;
      }
      const normalized = enforceCriticalCategory(displayName, item.category, item.sub_aisle);
      const cat = normalized.master || item.category || 'Uncategorised';

      if (!groupedMaps[cat]) groupedMaps[cat] = new Map();

      const mergeName = normalizedMergeIngredientName(displayName) || normalizeKey(displayName);
      const canonical = toCanonicalQty(item.final_qty, item.base_unit);
      let qty = Number.isFinite(canonical.qty) ? canonical.qty : Number(item.final_qty || 0);
      let unit = canonical.unit || normalizeUnit(item.base_unit);
      const liquidFixed = applyLiquidRepairQty(mergeName, qty, unit);
      qty = liquidFixed.qty;
      unit = liquidFixed.unit;

      // Spring onion rows should combine by ingredient even if legacy rows drifted in units.
      const mergeUnit = (mergeName === 'spring onion') ? 'each' : unit;
      const mergeKey = normalizeKey(mergeName) + '||' + normalizeKey(mergeUnit);

      if (!groupedMaps[cat].has(mergeKey)) {
        groupedMaps[cat].set(mergeKey, {
          sub_aisle: normalized.sub || item.sub_aisle,
          item_name: displayNameFromMergeName(mergeName, displayName),
          base_unit: mergeUnit || item.base_unit,
          final_qty: 0,
          notes: item.notes || ''
        });
      }

      const entry = groupedMaps[cat].get(mergeKey);
      entry.final_qty = Number(entry.final_qty || 0) + (Number.isFinite(qty) ? qty : 0);

      if (!weekdayGroupedMaps[cat]) weekdayGroupedMaps[cat] = {};

      const sources = Array.isArray(item.source_detail_json) ? item.source_detail_json : [];
      const dayRaw = new Map();
      for (const src of sources) {
        const bookingId = Number(src && src.booking_id);
        const day = bookingDayMap.get(bookingId) || '';
        if (!day) continue;

        const sourceCanonicalQty = Number(src && src.canonical_qty);
        const sourceQtyCandidate = Number.isFinite(sourceCanonicalQty)
          ? sourceCanonicalQty
          : Number(src && src.qty);
        const sourceUnitCandidate = normalizeUnit((src && src.canonical_unit) || (src && src.unit) || item.base_unit);
        const sourceLiquidFixed = applyLiquidRepairQty(mergeName, sourceQtyCandidate, sourceUnitCandidate);
        const sourceQty = Number(sourceLiquidFixed.qty);
        if (!Number.isFinite(sourceQty) || sourceQty <= 0) continue;

        dayRaw.set(day, Number(dayRaw.get(day) || 0) + sourceQty);
      }

      const dayTotals = new Map();
      if (dayRaw.size > 0) {
        const baseTotal = Array.from(dayRaw.values()).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);
        if (baseTotal > 0 && Number.isFinite(qty) && qty > 0) {
          dayRaw.forEach((value, day) => {
            dayTotals.set(day, (value / baseTotal) * qty);
          });
        }
      }

      if (!dayTotals.size && Number.isFinite(qty) && qty > 0) {
        dayTotals.set('Unscheduled', qty);
      }

      dayTotals.forEach((dayQty, day) => {
        if (!weekdayGroupedMaps[cat][day]) weekdayGroupedMaps[cat][day] = new Map();
        if (!weekdayGroupedMaps[cat][day].has(mergeKey)) {
          weekdayGroupedMaps[cat][day].set(mergeKey, {
            sub_aisle: normalized.sub || item.sub_aisle,
            item_name: displayNameFromMergeName(mergeName, displayName),
            base_unit: mergeUnit || item.base_unit,
            final_qty: 0,
            notes: item.notes || ''
          });
        }
        const dayEntry = weekdayGroupedMaps[cat][day].get(mergeKey);
        dayEntry.final_qty = Number(dayEntry.final_qty || 0) + (Number.isFinite(dayQty) ? dayQty : 0);
      });
    }

    const grouped = {};
    Object.keys(groupedMaps).forEach((cat) => {
      grouped[cat] = Array.from(groupedMaps[cat].values())
        .sort((a, b) => String(a.item_name || '').localeCompare(String(b.item_name || ''), undefined, { sensitivity: 'base' }));
    });

    const weekdayGrouped = {};
    Object.keys(weekdayGroupedMaps).forEach((cat) => {
      const dayObj = weekdayGroupedMaps[cat] || {};
      const next = {};
      Object.keys(dayObj).forEach((day) => {
        next[day] = Array.from(dayObj[day].values())
          .sort((a, b) => String(a.item_name || '').localeCompare(String(b.item_name || ''), undefined, { sensitivity: 'base' }));
      });
      weekdayGrouped[cat] = next;
    });

    return res.json({ success: true, plan, categories: grouped, weekday_categories: weekdayGrouped });
  } catch (err) {
    console.error('[shopping-plan] GET /:id/technician-view error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/shopping-plan/smoke-seed  (admin only)
// Creates minimal test recipes, bookings, and desired_servings_ingredients
// rows for Phase 4 guardrail smoke tests.  Returns the created IDs so the
// smoke script can reference them without a direct DB connection.
// ---------------------------------------------------------------------------
router.post('/smoke-seed', requireAdmin, async (req, res) => {
  const stamp = Date.now();
  try {
    await ensureSchema();
    const r1 = await pool.query(
      `INSERT INTO recipes (name, description, ingredients, serving_size, url)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [`Phase4 Smoke Recipe A ${stamp}`, 'phase4 smoke', 'sugar', null, 'https://example.com/a']
    );
    const r2 = await pool.query(
      `INSERT INTO recipes (name, description, ingredients, serving_size, url)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [`Phase4 Smoke Recipe B ${stamp}`, 'phase4 smoke', 'sugar', 8, 'https://example.com/b']
    );
    const recipeIdA = Number(r1.rows[0].id);
    const recipeIdB = Number(r2.rows[0].id);

    // Determine next Friday for the booking date
    const d = new Date();
    const day = d.getUTCDay();
    const add = day <= 5 ? 5 - day : 12 - day;
    d.setUTCDate(d.getUTCDate() + add);
    const friday = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

    const b1 = await pool.query(
      `INSERT INTO bookings (staff_name, class_name, booking_date, period, recipe, recipe_id, class_size, planner_stream)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      ['Phase4 Teacher', `PH4-A-${stamp}`, friday, 'P1', `Phase4 Smoke Recipe A ${stamp}`, recipeIdA, 20, 'Middle']
    );
    const b2 = await pool.query(
      `INSERT INTO bookings (staff_name, class_name, booking_date, period, recipe, recipe_id, class_size, planner_stream)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      ['Phase4 Teacher', `PH4-B-${stamp}`, friday, 'P2', `Phase4 Smoke Recipe B ${stamp}`, recipeIdB, 20, 'Middle']
    );
    const bookingId1 = Number(b1.rows[0].id);
    const bookingId2 = Number(b2.rows[0].id);

    await pool.query(
      `INSERT INTO desired_servings_ingredients
         (booking_id, ingredient_name, fooditem, stripfooditem, measure_qty, measure_unit, calculated_qty)
       VALUES
         ($1, 'Sugar', 'Sugar', 'Sugar', 1, 'tbsp', 1),
         ($2, 'Sugar', 'Sugar', 'Sugar', 2, 'tsp', 2),
         ($1, 'Flour', 'Flour', 'Flour', 1, 'kg', 1),
         ($2, 'Flour', 'Flour', 'Flour', 500, 'g', 500)`,
      [bookingId1, bookingId2]
    );

    return res.json({
      success: true,
      recipeIds: [recipeIdA, recipeIdB],
      bookingIds: [bookingId1, bookingId2],
      friday
    });
  } catch (err) {
    console.error('[shopping-plan] smoke-seed error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/shopping-plan/smoke-seed-scaling  (admin only)
// Seeds 5 varied-serving recipes/bookings/DSI rows to validate scaling math.
// Returns the cases so scripts can verify expected calculated_qty values.
// ---------------------------------------------------------------------------
router.post('/smoke-seed-scaling', requireAdmin, async (req, res) => {
  const stamp = Date.now();
  try {
    await ensureSchema();

    // Determine next Friday for booking dates.
    const d = new Date();
    const day = d.getUTCDay();
    const add = day <= 5 ? 5 - day : 12 - day;
    d.setUTCDate(d.getUTCDate() + add);
    const friday = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

    const cases = [
      { label: 'Scale Case A', serving_size: 2, desired_servings: 10, measure_qty: 1.5, measure_unit: 'g' },
      { label: 'Scale Case B', serving_size: 4, desired_servings: 14, measure_qty: 2.0, measure_unit: 'g' },
      { label: 'Scale Case C', serving_size: 6, desired_servings: 21, measure_qty: 0.75, measure_unit: 'g' },
      { label: 'Scale Case D', serving_size: 8, desired_servings: 18, measure_qty: 3.25, measure_unit: 'g' },
      { label: 'Scale Case E', serving_size: 10, desired_servings: 25, measure_qty: 1.2, measure_unit: 'g' }
    ];

    const recipeIds = [];
    const bookingIds = [];
    const seededCases = [];

    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      const expectedQty = Math.round((c.measure_qty * (c.desired_servings / c.serving_size)) * 10000) / 10000;
      const ingredientName = `${c.label} Ingredient ${stamp}`;

      const recipeRes = await pool.query(
        `INSERT INTO recipes (name, description, ingredients, serving_size, url)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [`${c.label} ${stamp}`, 'phase6.1 scaling smoke', ingredientName, c.serving_size, `https://example.com/phase6_1_${i + 1}`]
      );
      const recipeId = Number(recipeRes.rows[0].id);
      recipeIds.push(recipeId);

      const bookingRes = await pool.query(
        `INSERT INTO bookings (staff_name, class_name, booking_date, period, recipe, recipe_id, class_size, planner_stream)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        ['Phase6.1 Teacher', `PH6.1-${i + 1}-${stamp}`, friday, `P${(i % 4) + 1}`, `${c.label} ${stamp}`, recipeId, c.desired_servings, 'Middle']
      );
      const bookingId = Number(bookingRes.rows[0].id);
      bookingIds.push(bookingId);

      await pool.query(
        `INSERT INTO desired_servings_ingredients
           (booking_id, ingredient_name, fooditem, stripfooditem, measure_qty, measure_unit, calculated_qty, desired_servings, recipe_id, class_size)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          bookingId,
          ingredientName,
          ingredientName,
          ingredientName,
          c.measure_qty,
          c.measure_unit,
          expectedQty,
          c.desired_servings,
          recipeId,
          c.desired_servings
        ]
      );

      seededCases.push({
        index: i + 1,
        label: c.label,
        recipeId,
        bookingId,
        ingredientName,
        serving_size: c.serving_size,
        desired_servings: c.desired_servings,
        measure_qty: c.measure_qty,
        measure_unit: c.measure_unit,
        expected_calculated_qty: expectedQty
      });
    }

    return res.json({
      success: true,
      friday,
      recipeIds,
      bookingIds,
      cases: seededCases
    });
  } catch (err) {
    console.error('[shopping-plan] smoke-seed-scaling error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/shopping-plan/smoke-cleanup  (admin only)
// Deletes data created by smoke-seed. Expects { planIds, bookingIds, recipeIds }
// ---------------------------------------------------------------------------
// POST /api/shopping-plan/:id/refresh-brand-names  (admin only)
// Re-apply brand normalization to items in a finalized plan.
// Strips brand text from item_name fields retroactively.
// ---------------------------------------------------------------------------
router.post('/:id/refresh-brand-names', requireAdmin, async (req, res) => {
  const planId = parseInt(req.params.id, 10);
  if (!Number.isInteger(planId) || planId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid plan ID.' });
  }

  try {
    await ensureSchema();

    // Fetch the plan to verify it exists and is finalized
    const planRes = await pool.query(
      'SELECT id, status FROM shopping_plan WHERE id = $1',
      [planId]
    );
    if (planRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Plan not found.' });
    }
    const plan = planRes.rows[0];
    if (plan.status !== 'finalized') {
      return res.status(409).json({ success: false, error: 'This plan has not been finalized yet.' });
    }

    // Load all food brands
    const brandsResult = await pool.query('SELECT brand_name FROM food_brands');
    const brands = (brandsResult.rows || []).map((b) => b.brand_name);

    // Get all items in this plan and update them
    const itemsRes = await pool.query(
      'SELECT id, item_name FROM shopping_plan_items WHERE plan_id = $1',
      [planId]
    );

    let updated = 0;
    for (const item of itemsRes.rows) {
      const stripped = stripFoodBrandFromItemName(item.item_name, brands);
      if (stripped !== item.item_name) {
        await pool.query(
          'UPDATE shopping_plan_items SET item_name = $1 WHERE id = $2',
          [stripped, item.id]
        );
        updated++;
      }
    }

    return res.json({ success: true, message: `Refreshed brand names for plan ${planId}. Updated ${updated} items.`, updated });
  } catch (err) {
    console.error('[shopping-plan] POST /:id/refresh-brand-names error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
router.post('/smoke-cleanup', requireAdmin, async (req, res) => {
  const { planIds = [], bookingIds = [], recipeIds = [] } = req.body || {};
  try {
    await ensureSchema();
    if (planIds.length) {
      await pool.query('DELETE FROM shopping_plan WHERE id = ANY($1::int[])', [planIds]);
    }
    if (bookingIds.length) {
      await pool.query('DELETE FROM desired_servings_ingredients WHERE booking_id = ANY($1::int[])', [bookingIds]);
      await pool.query('DELETE FROM bookings WHERE id = ANY($1::int[])', [bookingIds]);
    }
    if (recipeIds.length) {
      await pool.query('DELETE FROM recipes WHERE id = ANY($1::int[])', [recipeIds]);
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[shopping-plan] smoke-cleanup error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
