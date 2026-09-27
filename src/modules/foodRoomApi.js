const express = require('express');
const { Pool } = require('pg');
const config = require('../config');

const router = express.Router();
let legacyPool;

function getLegacyPool() {
  if (!config.legacyFoodRoomDatabaseUrl) return null;
  if (!legacyPool) {
    legacyPool = new Pool({
      connectionString: config.legacyFoodRoomDatabaseUrl,
      ssl: { rejectUnauthorized: false },
      max: 2
    });
  }
  return legacyPool;
}

function unavailable(res) {
  return res.status(503).json({ error: 'Food Room legacy database is not configured.' });
}

router.get('/auth/me', (req, res) => {
  res.json({ authenticated: Boolean(req.user), user: req.user || null });
});

router.get('/auth/google/config', (req, res) => {
  res.json({ configured: false });
});

router.get('/recipes/display-table', async (req, res, next) => {
  const sourcePool = getLegacyPool();
  if (!sourcePool) return unavailable(res);

  try {
    const result = await sourcePool.query(
      `SELECT id, name, description, ingredients, serving_size, url, instructions,
              recipeid, image_url, ft_images, ft_primary_slot
       FROM recipe_display
       ORDER BY id DESC`
    );
    return res.json(result.rows);
  } catch (error) {
    return next(error);
  }
});

router.get('/recipes', async (req, res, next) => {
  const sourcePool = getLegacyPool();
  if (!sourcePool) return unavailable(res);

  try {
    const result = await sourcePool.query(
      `SELECT id, uploaded_recipe_id, name, description, ingredients, serving_size, url,
              instructions, instructions_extracted, ingredients_display, extracted_ingredients,
              extracted_serving_size, extracted_instructions
       FROM recipes
       ORDER BY id DESC`
    );
    return res.json(result.rows);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
