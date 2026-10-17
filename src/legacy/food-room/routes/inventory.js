

// ================================
// Imports and Setup
// ================================
const express = require('express');
const router = express.Router();

const pool = require('../db');

// POST /api/ingredients/inventory/sync
router.post('/sync', async (req, res) => {
  try {
    const recipeId = String(req.body?.recipeId || '').trim();
    const reseed = Boolean(req.body?.reseed);
    let recipeSourceForRecovery = '';

    if (recipeId && reseed) {
      await pool.query('DELETE FROM ingredients_inventory WHERE recipe_id = $1', [recipeId]);
    }

    const queryText = recipeId
      ? 'SELECT id, quantity, ingredient_name, fooditem FROM ingredients_inventory WHERE recipe_id = $1'
      : 'SELECT id, quantity, ingredient_name, fooditem FROM ingredients_inventory';
    const queryParams = recipeId ? [recipeId] : [];
    let { rows } = await pool.query(queryText, queryParams);

    // If syncing a specific recipe with no inventory rows yet, seed from recipe_display first.
    if (recipeId && rows.length === 0) {
      const recipeResult = await pool.query(
        'SELECT ingredients_display, extracted_ingredients, ingredients FROM recipes WHERE id = $1 LIMIT 1',
        [recipeId]
      );

      const sourceRow = recipeResult.rows[0];
      const rawIngredients = String(
        sourceRow?.ingredients_display || sourceRow?.extracted_ingredients || sourceRow?.ingredients || ''
      );
      recipeSourceForRecovery = rawIngredients;
      const splitUnits = '(?:cups?|tbsp|tablespoons?|tsp|teaspoons?|g|kg|ml|l)';
      const splitQty = '(?:\\d+[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d*\\.\\d+|\\d+|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])';
      const candidateLines = rawIngredients
        // Preserve HTML list item boundaries before stripping tags.
        .replace(/<\/?(ul|ol)\b[^>]*>/gi, '\n')
        .replace(/<li\b[^>]*>/gi, '')
        .replace(/<\/li>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/\bFILLING\b/gi, '\nFILLING\n')
        .replace(/([A-Za-z])(\d)/g, '$1\n$2')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .filter(line => !/^\d+$/.test(line))
        .filter(line => !/^[1-5]\s*Star$/i.test(line));

      if (candidateLines.length > 0) {
        for (const line of candidateLines) {
          await pool.query(
            `INSERT INTO ingredients_inventory (
              ingredient_name, recipe_id, quantity, measure_qty, measure_unit, fooditem, stripfooditem, aisle_category_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [line, recipeId, '', null, '', '', '', null]
          );
        }
      }

      const refreshed = await pool.query(queryText, queryParams);
      rows = refreshed.rows;
    }

    // For existing rows (non-reseed or previously seeded), keep a source copy for recovery heuristics.
    if (recipeId && !recipeSourceForRecovery) {
      const sourceForRecovery = await pool.query(
        'SELECT ingredients_display, extracted_ingredients, ingredients FROM recipes WHERE id = $1 LIMIT 1',
        [recipeId]
      );
      const sourceRow = sourceForRecovery.rows[0];
      recipeSourceForRecovery = String(
        sourceRow?.ingredients_display || sourceRow?.extracted_ingredients || sourceRow?.ingredients || ''
      );
    }

    let updated = 0;
    // Helper to convert unicode and vulgar fractions to float
    function parseFraction(str) {
      const vulgarMap = {
        '¼': 0.25, '½': 0.5, '¾': 0.75,
        '⅐': 1/7, '⅑': 1/9, '⅒': 0.1, '⅓': 1/3, '⅔': 2/3, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1/6, '⅚': 5/6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
      };
      str = (str || '').trim();
      str = str.replace(/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, m => ' ' + vulgarMap[m]);
      let parts = str.split(' ');
      let total = 0;
      let foundNumeric = false;
      for (let part of parts) {
        if (/^\d+$/.test(part)) {
          total += parseInt(part);
          foundNumeric = true;
        }
        else if (/^\d+\/\d+$/.test(part)) {
          let [n, d] = part.split('/');
          total += parseInt(n) / parseInt(d);
          foundNumeric = true;
        } else if (!isNaN(parseFloat(part))) {
          total += parseFloat(part);
          foundNumeric = true;
        }
      }
      return foundNumeric ? total : null;
    }

    function escapeRegex(str) {
      return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function tryRecoverDroppedLeadingDigits({ sourceText, measureUnit, foodItem, sourceBlob }) {
      const src = String(sourceText || '').trim();
      const unit = String(measureUnit || '').trim();
      const food = String(foodItem || '').trim();
      const blob = String(sourceBlob || '');

      if (!src || !unit || !food || !blob) return null;
      // Heuristic target: values like "0g onions" where the leading digits were lost.
      if (!/^0\s*[A-Za-z]/.test(src)) return null;

      const foodToken = food
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .find((t) => t.length >= 3);
      if (!foodToken) return null;

      const normalizedBlob = blob
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&');

      const pattern = new RegExp(
        `(?:^|\\n|,)\\s*(\\d{2,4}(?:\\.\\d+)?)\\s*${escapeRegex(unit)}\\b[^\\n,]*\\b${escapeRegex(foodToken)}\\b`,
        'i'
      );
      const match = normalizedBlob.match(pattern);
      if (!match) return null;

      const recovered = parseFloat(match[1]);
      if (!Number.isFinite(recovered) || recovered <= 0) return null;
      return recovered;
    }

    function normalizeFoodItemText(value) {
      return String(value || '')
        .replace(/^\s*x\s+/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
    const units = [
      'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons',
      'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'ml', 'l', 'litre', 'litres', 'liter', 'liters',
      'oz', 'ounce', 'ounces', 'lb', 'pound', 'pounds', 'pinch', 'dash', 'clove', 'cloves', 'can', 'cans', 'slice', 'slices', 'stick', 'sticks', 'packet', 'packets', 'piece', 'pieces', 'drop', 'drops', 'block', 'blocks', 'sheet', 'sheets', 'bunch', 'bunches', 'sprig', 'sprigs', 'head', 'heads', 'filet', 'filets', 'fillet', 'fillets', 'bag', 'bags', 'jar', 'jars', 'bottle', 'bottles', 'container', 'containers', 'box', 'boxes', 'bar', 'bars', 'roll', 'rolls', 'strip', 'strips', 'cm', 'mm', 'inch', 'inches', 'pinches', 'handful', 'handfuls', 'dozen', 'sheet', 'sheets', 'leaf', 'leaves', 'stalk', 'stalks', 'rib', 'ribs', 'segment', 'segments', 'piece', 'pieces', 'cube', 'cubes', 'drop', 'drops', 'sprinkle', 'sprinkles', 'dash', 'dashes', 'dollop', 'dollops', 'drizzle', 'drizzles', 'splash', 'splashes', 'liter', 'liters', 'milliliter', 'millilitres', 'millilitre', 'millilitres', 'quart', 'quarts', 'pint', 'pints', 'gallon', 'gallons'
    ];
    const unitPattern = units.join('|');
    const regex = new RegExp(
      String.raw`^([\d\s\/.¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+)\s*(${unitPattern})\b\s*(.*)$`,
      'i'
    );
    const qtyOnlyRegex = new RegExp(
      String.raw`^([\d\s\/.¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+)\s+(.+)$`,
      'i'
    );
    const trailingQtyUnitRegex = new RegExp(
      String.raw`^(.*?)\s*[-:–]\s*([\d\s\/.¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+)\s*(${unitPattern})\b\s*(.*)$`,
      'i'
    );
    const trailingQtyOnlyRegex = new RegExp(
      String.raw`^(.*?)\s*[-:–]\s*([\d\s\/.¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+)\s*$`,
      'i'
    );
    const qtyUnitOnlyRegex = new RegExp(
      String.raw`^[\d\s\/.¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+\s*(${unitPattern})\b\s*$`,
      'i'
    );
    // Matches verbal-quantity phrases: "a cube beef stock", "half a teaspoon mixed herbs", "a drizzle olive oil"
    const verbalQtyRegex = new RegExp(
      String.raw`^(half\s+an?\s+|a\s+quarter\s+(?:of\s+)?an?\s+|an?\s+)(${unitPattern})\b\s*(?:of\s+)?(.*)$`,
      'i'
    );

    // Words that are pure descriptors/adverbs — not food nouns.
    // When a parsed food item consists only of these, it likely belongs to the previous ingredient line.
    const descriptorWords = new Set([
      'grated','sliced','diced','chopped','minced','shredded','crushed','halved','quartered',
      'peeled','roughly','finely','thinly','thickly','coarsely','lightly','freshly','frozen',
      'cooked','raw','dried','fresh','ground','whole','large','small','medium','softened',
      'melted','beaten','sifted','roasted','toasted','cubed','trimmed','zested','juiced',
      'packed','heaped','levelled','divided','optional','separated','rinsed','drained',
      'cooled','warm','hot','cold','ripe','firm','thick','thin','fine','coarse'
    ]);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let measure_qty = null, measure_unit = null;
      let nextFoodItem = (row.fooditem || '').trim();
      let sourceText = (row.quantity || row.ingredient_name || '').trim();
      
      // If quantity and ingredient_name are in separate fields, combine them to help pattern matching
      // e.g., quantity="½" + ingredient_name="banana peeled" => "½ banana peeled"
      if (sourceText && row.quantity && row.ingredient_name && sourceText === row.quantity.trim()) {
        const ingredientPart = row.ingredient_name.trim();
        // Only combine if ingredient_name doesn't start with a quantity/fraction (would be duplicate)
        if (!/^[\d\s\/.¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/.test(ingredientPart)) {
          sourceText = `${sourceText} ${ingredientPart}`;
        }
      }

      if (sourceText) {
        const match = sourceText.match(regex);
        if (match) {
          measure_qty = parseFraction(match[1]);
          measure_unit = (match[2] || '').trim();
          nextFoodItem = (match[3] || '').trim();

          // Handle split-line recipes where qty/unit is on the next line, e.g. "Tinned spaghetti -" then "1/2 cup".
          if (!nextFoodItem) {
            const prevName = String(rows[i - 1]?.ingredient_name || '').trim();
            if (prevName) {
              nextFoodItem = prevName.replace(/[-:–]\s*$/, '').trim();
            }
          }
        } else {
          const trailingQtyUnitMatch = sourceText.match(trailingQtyUnitRegex);
          if (trailingQtyUnitMatch) {
            const leftSide = (trailingQtyUnitMatch[1] || '').trim();
            const trailingDesc = (trailingQtyUnitMatch[4] || '').trim();
            measure_qty = parseFraction(trailingQtyUnitMatch[2]);
            measure_unit = (trailingQtyUnitMatch[3] || '').trim();
            nextFoodItem = [leftSide, trailingDesc].filter(Boolean).join(' ').trim();
          } else {
            const trailingQtyOnlyMatch = sourceText.match(trailingQtyOnlyRegex);
            if (trailingQtyOnlyMatch) {
              measure_qty = parseFraction(trailingQtyOnlyMatch[2]);
              measure_unit = null;
              nextFoodItem = (trailingQtyOnlyMatch[1] || '').trim();
            } else {
              const qtyOnlyMatch = sourceText.match(qtyOnlyRegex);
              if (qtyOnlyMatch) {
                measure_qty = parseFraction(qtyOnlyMatch[1]);
                measure_unit = null;
                nextFoodItem = (qtyOnlyMatch[2] || '').trim();
              } else {
                const verbalMatch = sourceText.match(verbalQtyRegex);
                if (verbalMatch) {
                  const verbalPart = (verbalMatch[1] || '').trim().toLowerCase();
                  if (/half/i.test(verbalPart)) measure_qty = 0.5;
                  else if (/quarter/i.test(verbalPart)) measure_qty = 0.25;
                  else measure_qty = 1;
                  measure_unit = (verbalMatch[2] || '').trim();
                  nextFoodItem = (verbalMatch[3] || '').trim();
                }
              }
            }
          }
        }
      }

      if (!nextFoodItem) {
        nextFoodItem = (row.ingredient_name || '').trim();

        // If this line is only qty+unit, borrow previous ingredient label when available.
        if (qtyUnitOnlyRegex.test(nextFoodItem)) {
          const prevName = String(rows[i - 1]?.ingredient_name || '').trim().replace(/[-:–]\s*$/, '').trim();
          if (prevName) {
            nextFoodItem = prevName;
          }
        }
      }

      // If the food item is only descriptor/adjective words (e.g. "grated", "sliced thickly"),
      // prepend the previous ingredient's name as the base food.
      if (nextFoodItem && i > 0) {
        const foodWords = nextFoodItem.toLowerCase().trim().split(/\s+/);
        if (foodWords.length <= 3 && foodWords.every(w => descriptorWords.has(w))) {
          const prevBase = String(rows[i - 1]?.ingredient_name || '').replace(/[-:–]\s*$/, '').trim();
          if (prevBase) nextFoodItem = `${prevBase} ${nextFoodItem}`;
        }
      }

      nextFoodItem = normalizeFoodItemText(nextFoodItem);
      let nextStripFoodItem = null;

      if (String(recipeId) === '22') {
        const lowered = nextFoodItem
          .toLowerCase()
          .replace(/\+/g, ' ')
          .replace(/[^a-z0-9\s-]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (/\bself[-\s]?raising\s+flour\b/i.test(lowered)) {
          nextStripFoodItem = 'Self-Raising Flour';
        }
      }

      // Recovery for malformed strings like "0g onions" where source text still contains "500g onions".
      if ((measure_qty === null || measure_qty === 0) && measure_unit && nextFoodItem) {
        const recoveredQty = tryRecoverDroppedLeadingDigits({
          sourceText,
          measureUnit: measure_unit,
          foodItem: nextFoodItem,
          sourceBlob: recipeSourceForRecovery
        });
        if (recoveredQty !== null) {
          measure_qty = recoveredQty;
        }
      }

      if (String(recipeId) === '21') {
        await pool.query(
          'UPDATE ingredients_inventory SET measure_qty = $1, measure_unit = $2, fooditem = $3, stripfooditem = $3 WHERE id = $4',
          [measure_qty, measure_unit, nextFoodItem, row.id]
        );
      } else if (nextStripFoodItem) {
        await pool.query(
          'UPDATE ingredients_inventory SET measure_qty = $1, measure_unit = $2, fooditem = $3, stripfooditem = $4 WHERE id = $5',
          [measure_qty, measure_unit, nextFoodItem, nextStripFoodItem, row.id]
        );
      } else {
        await pool.query(
          'UPDATE ingredients_inventory SET measure_qty = $1, measure_unit = $2, fooditem = $3 WHERE id = $4',
          [measure_qty, measure_unit, nextFoodItem, row.id]
        );
      }
      updated++;
    }
    res.json({ success: true, updated, recipeId: recipeId || null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
console.log('Inventory router loaded');


// Debug logging disabled
// router.use((req, res, next) => {
//   console.log('Inventory route hit:', req.method, req.originalUrl);
//   next();
// });

// GET /api/ingredients/inventory/all
router.get('/all', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM ingredients_inventory');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});



// POST /api/ingredients/inventory/assign-aisle
router.post('/assign-aisle', async (req, res) => {
  const { ingredient_id, aisle_category_id } = req.body;
  // console.log('[DEBUG] /assign-aisle called with:', { ingredient_id, aisle_category_id });
  if (!ingredient_id || !aisle_category_id) {
    // console.log('[DEBUG] Missing ingredient_id or aisle_category_id');
    return res.status(400).json({ success: false, error: 'Missing ingredient_id or aisle_category_id' });
  }
  try {
    const sql = 'UPDATE ingredients_inventory SET aisle_category_id = $1 WHERE id = $2';
    // console.log('[DEBUG] Executing SQL:', sql, [aisle_category_id, ingredient_id]);
    const result = await pool.query(sql, [aisle_category_id, ingredient_id]);

    // Learn from manual assignment: upsert keyword into aisle_keywords.
    let keywordAdded = false;
    let keywordUpdated = false;
    let learnedKeyword = '';

    const ingredientLookup = await pool.query(
      `SELECT
         COALESCE(
           NULLIF(TRIM(stripfooditem), ''),
           NULLIF(TRIM(fooditem), ''),
           NULLIF(TRIM(ingredient_name), '')
         ) AS keyword_source
       FROM ingredients_inventory
       WHERE id = $1`,
      [ingredient_id]
    );

    const keywordSource = String(ingredientLookup.rows?.[0]?.keyword_source || '').trim();
    if (keywordSource) {
      learnedKeyword = keywordSource;
      const existingKeyword = await pool.query(
        'SELECT id, aisle_category_id FROM aisle_keywords WHERE LOWER(keyword) = LOWER($1) LIMIT 1',
        [learnedKeyword]
      );

      if (existingKeyword.rows.length > 0) {
        const existing = existingKeyword.rows[0];
        if (String(existing.aisle_category_id) !== String(aisle_category_id)) {
          await pool.query('UPDATE aisle_keywords SET aisle_category_id = $1 WHERE id = $2', [aisle_category_id, existing.id]);
          keywordUpdated = true;
        }
      } else {
        await pool.query('INSERT INTO aisle_keywords (aisle_category_id, keyword) VALUES ($1, $2)', [aisle_category_id, learnedKeyword]);
        keywordAdded = true;
      }
    }

    // console.log('[DEBUG] Update result:', result);
    res.json({
      success: true,
      updated: result.rowCount,
      keywordAdded,
      keywordUpdated,
      learnedKeyword
    });
  } catch (err) {
    //console.error('[DEBUG] Error in /assign-aisle:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


  // POST /api/ingredients/inventory/save-bulk
  // Updated: Use recipe_display for calculations if recipe_id is provided
  router.post('/save-bulk', async (req, res) => {
    const { recipe_id, ingredients } = req.body;
    if (recipe_id) {
      try {
        const result = await pool.query('SELECT * FROM recipe_display WHERE recipeid = $1', [recipe_id]);
        if (!result.rows.length) {
          return res.status(404).json({ success: false, error: 'Recipe not found in recipe_display.' });
        }
        const recipe = result.rows[0];
        let ingredientsText = recipe.ingredients || '';
        ingredientsText = ingredientsText.replace(/<br\s*\/?/gi, '\n');
        const lines = ingredientsText.split(/\r?\n/)
          .map(l => l.replace(/^>\s*/, '').trim())
          .filter(Boolean);
        if (!lines.length) {
          return res.status(400).json({ success: false, error: 'No ingredients found in recipe_display.' });
        }
        // Ensure numeric fields are null if empty
        const parsedIngredients = lines.map(line => ([
          line, // ingredient_name
          recipe_id, // recipe_id
          null, // quantity
          null, // measure_qty
          '', // measure_unit
          line, // fooditem
          '', // stripFoodItem
          null // aisle_category_id
        ]));
        const valuePlaceholders = parsedIngredients.map((_, i) => `($${i*8+1},$${i*8+2},$${i*8+3},$${i*8+4},$${i*8+5},$${i*8+6},$${i*8+7},$${i*8+8})`).join(',');
        const flatValues = parsedIngredients.flat();
        const columns = ['ingredient_name', 'recipe_id', 'quantity', 'measure_qty', 'measure_unit', 'fooditem', 'stripFoodItem', 'aisle_category_id'];
        const insertResult = await pool.query(`INSERT INTO ingredients_inventory (${columns.join(',')}) VALUES ${valuePlaceholders}`, flatValues);
        res.json({ success: true, inserted: insertResult.rowCount });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    } else if (Array.isArray(ingredients) && ingredients.length > 0) {
      // Fallback: legacy mode, insert provided ingredients array (Postgres)
      const columns = ['ingredient_name', 'recipe_id', 'quantity', 'measure_qty', 'measure_unit', 'fooditem', 'stripFoodItem', 'aisle_category_id'];
      const values = ingredients.map(ing => [
        ing.ingredient_name || '',
        ing.recipe_id || null,
        (ing.quantity === '' || ing.quantity === undefined) ? null : ing.quantity,
        (ing.measure_qty === '' || ing.measure_qty === undefined) ? null : ing.measure_qty,
        ing.measure_unit || '',
        ing.fooditem || '',
        ing.stripFoodItem || '',
        ing.aisle_category_id || null
      ]);
      const valuePlaceholders = values.map((_, i) => `($${i*8+1},$${i*8+2},$${i*8+3},$${i*8+4},$${i*8+5},$${i*8+6},$${i*8+7},$${i*8+8})`).join(',');
      const flatValues = values.flat();
      try {
        const result = await pool.query(`INSERT INTO ingredients_inventory (${columns.join(',')}) VALUES ${valuePlaceholders}`, flatValues);
        res.json({ success: true, inserted: result.rowCount });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    } else {
      return res.status(400).json({ success: false, error: 'No ingredients or recipe_id provided.' });
    }
  });

  // POST /api/ingredients/inventory/split-quantity
  router.post('/split-quantity', (req, res) => {
    const { id, splitQty } = req.body;
    if (!id || !splitQty) {
      return res.status(400).json({ success: false, error: 'Missing id or splitQty' });
    }
    // Implement your logic here. For now, just return success.
    res.json({ success: true, message: `Ingredient ${id} split by ${splitQty}` });
  });

  // PUT /api/ingredients/inventory/:id/extracted
  const fs = require('fs');
  router.put('/:id/extracted', (req, res) => {
    const id = req.params.id;
    const { ingredients_text } = req.body;
    if (!ingredients_text || !id) {
      return res.status(400).json({ success: false, error: 'Missing ingredients_text or id' });
    }
    const dir = require('path').join(require('../paths').publicDir, 'ExtractedIngredients');
    const filePath = require('path').join(dir, `${id}.txt`);
    // Ensure directory exists
    fs.mkdir(dir, { recursive: true }, (err) => {
      if (err) {
        return res.status(500).json({ success: false, error: 'Failed to create directory', details: err.message });
      }
      fs.writeFile(filePath, ingredients_text, 'utf8', (err2) => {
        if (err2) {
          return res.status(500).json({ success: false, error: 'Failed to write file', details: err2.message });
        }
        res.json({ success: true, file: `${id}.txt` });
      });
    });
  });


// DELETE /api/ingredients/inventory/:id
router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ success: false, error: 'Missing id' });
  try {
    const result = await pool.query('DELETE FROM ingredients_inventory WHERE id = $1', [id]);
    res.json({ success: true, deleted: result.rowCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/ingredients/inventory/all
router.delete('/all', async (req, res) => {
  try {
    console.log('[DELETE ALL] About to TRUNCATE ingredients_inventory');
    await pool.query('TRUNCATE TABLE ingredients_inventory RESTART IDENTITY CASCADE');
    console.log('[DELETE ALL] TRUNCATE successful');
    res.json({ success: true, message: 'All ingredients deleted and ID reset.' });
  } catch (err) {
    console.error('[ERROR] DELETE /api/ingredients/inventory/all:', err);
    res.status(500).json({ success: false, error: err.message, details: err.stack });
  }
});



// POST /api/ingredients/inventory/auto-assign-aisles (uses aisle_keywords)
router.post('/auto-assign-aisles', async (req, res) => {
  // This endpoint assigns aisle_category_id to ingredients in inventory based on aisle_keywords
  // Only assign if aisle_category_id is null or 0
  try {
    const { rows: ingredients } = await pool.query('SELECT id, stripFoodItem FROM ingredients_inventory WHERE aisle_category_id IS NULL OR aisle_category_id = 0');
    const { rows: keywords } = await pool.query('SELECT ak.keyword, ak.aisle_category_id FROM aisle_keywords ak');
    let updated = 0;
    const updates = [];
    for (const ing of ingredients) {
      const text = (ing.stripfooditem || '').toLowerCase().trim();
      let match = null;
      for (const k of keywords) {
        if (text.includes((k.keyword || '').toLowerCase())) {
          match = k.aisle_category_id;
          break;
        }
      }
      if (match) {
        updates.push(pool.query('UPDATE ingredients_inventory SET aisle_category_id = $1 WHERE id = $2', [match, ing.id]));
        updated++;
      }
    }
    await Promise.all(updates);
    res.json({ success: true, updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Catch-all logger for unmatched requests to this router (must be last)
router.use((req, res, next) => {
  console.log(`[INVENTORY ROUTER] Unmatched: ${req.method} ${req.originalUrl}`);
  next();
});

// ================================
// Export
// ================================
module.exports = router;
