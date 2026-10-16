/**
 * Recipe Matching API Routes
 * Handles recipe matching between planner uploads and stored recipes
 */

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');


const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:password@host:port/db?sslmode=require';
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const matchEngine = require('../recipeMatchEngine');

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getRequestEmail(req) {
  return normalizeEmail(
    (req && req.authUserEmail) ||
    (req && req.headers && (req.headers['x-user-email'] || req.headers['x-staff-email']))
  );
}

function requireSignedIn(req, res, next) {
  const email = getRequestEmail(req);
  if (!email) {
    return res.status(401).json({ success: false, error: 'Sign in required.' });
  }
  req.authUserEmail = email;
  return next();
}

/**
 * POST /api/recipe-matching/auto-match
 * Automatically match planner bookings to recipes
 * Body: { bookings: [...] }
 * Returns: { matched: [...], unmatched: [...], summary: {...} }
 */
router.post('/auto-match', requireSignedIn, async (req, res) => {
  try {
    const { bookings, bookingIds } = req.body || {};

    let targetBookings = [];
    if (Array.isArray(bookingIds) && bookingIds.length > 0) {
      const ids = bookingIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0);

      if (!ids.length) {
        return res.status(400).json({ error: 'bookingIds must contain valid numeric IDs' });
      }

      const bookingsResult = await pool.query(
        `SELECT *
         FROM bookings
         WHERE id = ANY($1::int[])`,
        [ids]
      );
      targetBookings = bookingsResult.rows;
    } else if (Array.isArray(bookings)) {
      targetBookings = bookings;
    } else {
      return res.status(400).json({ error: 'bookings array or bookingIds array required' });
    }

    if (!targetBookings.length) {
      return res.json({
        success: true,
        summary: {
          total: 0,
          autoMatched: 0,
          alreadyLinked: 0,
          needsReview: 0,
          databaseUpdated: 0
        },
        matched: [],
        unmatched: []
      });
    }

    // Fetch all stored recipes
    const recipesResult = await pool.query('SELECT id, name, url FROM recipes ORDER BY name');
    const storedRecipes = recipesResult.rows;

    // Match bookings
    const { matched, unmatched } = await matchEngine.matchPlannerBookings(targetBookings, storedRecipes);

    // Update matched bookings in database
    let updateCount = 0;
    for (const booking of matched) {
      if (booking.recipe_id && booking.status === 'auto_matched') {
        try {
          await pool.query(
            'UPDATE bookings SET recipe_id = $1 WHERE id = $2',
            [booking.recipe_id, booking.id]
          );
          updateCount++;
        } catch (err) {
          console.error(`Failed to update booking ${booking.id}:`, err.message);
        }
      }
    }

    return res.json({
      success: true,
      summary: {
        total: targetBookings.length,
        autoMatched: matched.filter(b => b.status === 'auto_matched').length,
        alreadyLinked: matched.filter(b => b.status === 'already_linked').length,
        needsReview: unmatched.length,
        databaseUpdated: updateCount
      },
      matched: matched.filter(b => b.status === 'auto_matched'),
      unmatched
    });
  } catch (err) {
    console.error('[RECIPE-MATCH] Error during auto-match:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/recipe-matching/suggestions/:bookingId
 * Get recipe suggestions for a specific unmatched booking
 */
router.get('/suggestions/:bookingId', requireSignedIn, async (req, res) => {
  try {
    const { bookingId } = req.params;

    // Fetch the booking
    const bookingResult = await pool.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookingResult.rows[0];

    // Fetch all recipes
    const recipesResult = await pool.query('SELECT id, name, url FROM recipes ORDER BY name');
    const storedRecipes = recipesResult.rows;

    // Find matches
    const matches = await matchEngine.findRecipeMatches(booking, storedRecipes);

    return res.json({
      booking: {
        id: booking.id,
        recipe: booking.recipe,
        recipe_url: booking.recipe_url,
        recipe_id: booking.recipe_id
      },
      suggestions: {
        exactMatch: matches.exactMatch,
        urlMatch: matches.urlMatch,
        fuzzyMatches: matches.fuzzyMatches,
        combined: matchEngine.buildSuggestionList(matches, 5)
      }
    });
  } catch (err) {
    console.error('[RECIPE-MATCH] Error fetching suggestions:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/recipe-matching/link-recipe
 * Manually link a booking to a recipe or mark for new recipe creation
 * Body: { bookingId: number, recipeId?: number, createNew?: boolean }
 */
router.post('/link-recipe', requireSignedIn, async (req, res) => {
  try {
    const { bookingId, recipeId, createNew } = req.body;

    if (!bookingId) {
      return res.status(400).json({ error: 'bookingId required' });
    }

    if (!recipeId && !createNew) {
      return res.status(400).json({ error: 'recipeId or createNew flag required' });
    }

    if (recipeId) {
      // Verify recipe exists
      const recipeResult = await pool.query('SELECT id FROM recipes WHERE id = $1', [recipeId]);
      if (recipeResult.rows.length === 0) {
        return res.status(404).json({ error: 'Recipe not found' });
      }

      // Update booking
      await pool.query(
        'UPDATE bookings SET recipe_id = $1 WHERE id = $2',
        [recipeId, bookingId]
      );

      return res.json({
        success: true,
        message: 'Booking linked to recipe',
        bookingId,
        recipeId
      });
    }

    if (createNew) {
      // Mark booking for recipe creation (set a flag or note)
      // We'll return the booking data so UI can open Add Recipe with pre-filled URL
      const bookingResult = await pool.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
      if (bookingResult.rows.length === 0) {
        return res.status(404).json({ error: 'Booking not found' });
      }

      const booking = bookingResult.rows[0];
      return res.json({
        success: true,
        message: 'Ready to create new recipe',
        bookingId,
        prefilledData: {
          name: booking.recipe,
          url: booking.recipe_url
        }
      });
    }
  } catch (err) {
    console.error('[RECIPE-MATCH] Error linking recipe:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/recipe-matching/bulk-link
 * Link multiple bookings to recipes in bulk
 * Body: { links: [{ bookingId: number, recipeId: number }, ...] }
 */
router.post('/bulk-link', async (req, res) => {
  try {
    const { links } = req.body;
    if (!Array.isArray(links)) {
      return res.status(400).json({ error: 'links array required' });
    }

    let successCount = 0;
    let errorCount = 0;

    for (const link of links) {
      const { bookingId, recipeId } = link;
      if (!bookingId || !recipeId) {
        errorCount++;
        continue;
      }

      try {
        await pool.query(
          'UPDATE bookings SET recipe_id = $1 WHERE id = $2',
          [recipeId, bookingId]
        );
        successCount++;
      } catch (err) {
        console.error(`Failed to link booking ${bookingId}:`, err.message);
        errorCount++;
      }
    }

    return res.json({
      success: true,
      summary: {
        processed: links.length,
        succeeded: successCount,
        failed: errorCount
      }
    });
  } catch (err) {
    console.error('[RECIPE-MATCH] Error in bulk-link:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/recipe-matching/unmatched
 * Get all bookings without recipe_id
 * Query: ?limit=50&offset=0
 */
router.get('/unmatched', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const result = await pool.query(
      "SELECT * FROM bookings WHERE recipe_id IS NULL AND period = 'Planner' ORDER BY booking_date DESC, period LIMIT $1 OFFSET $2",
      [limit, offset]
    );

    const countResult = await pool.query("SELECT COUNT(*) as count FROM bookings WHERE recipe_id IS NULL AND period = 'Planner'");
    const totalUnmatched = parseInt(countResult.rows[0].count);

    // Get recipe suggestions for each
    const recipesResult = await pool.query('SELECT id, name, url FROM recipes ORDER BY name');
    const storedRecipes = recipesResult.rows;

    const bookingsWithSuggestions = await Promise.all(
      result.rows.map(async (booking) => {
        const matches = await matchEngine.findRecipeMatches(booking, storedRecipes);
        return {
          ...booking,
          suggestions: matchEngine.buildSuggestionList(matches, 3)
        };
      })
    );

    return res.json({
      bookings: bookingsWithSuggestions,
      pagination: {
        limit,
        offset,
        total: totalUnmatched
      }
    });
  } catch (err) {
    console.error('[RECIPE-MATCH] Error fetching unmatched:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/recipe-matching/bookings
 * Get ALL Planner bookings (matched + unmatched) with linked_recipes from booking_recipes.
 * Unmatched bookings also include recipe suggestions.
 */
router.get('/bookings', async (req, res) => {
  try {
    await ensureBookingRecipesTable();

    const allResult = await pool.query(
      "SELECT * FROM bookings WHERE period = 'Planner' ORDER BY booking_date DESC, id"
    );

    const recipesResult = await pool.query('SELECT id, name, url FROM recipes ORDER BY name');
    const storedRecipes = recipesResult.rows;

    const bookingsWithData = await Promise.all(
      allResult.rows.map(async (booking) => {
        // Fetch linked recipes from booking_recipes
        const linkedResult = await pool.query(
          `SELECT br.recipe_id, r.name, r.url
           FROM booking_recipes br
           JOIN recipes r ON r.id = br.recipe_id
           WHERE br.booking_id = $1
           ORDER BY br.linked_at`,
          [booking.id]
        );
        let linked_recipes = linkedResult.rows;

        // Backward-compatibility: some older bookings only have bookings.recipe_id set.
        if (!linked_recipes.length && booking.recipe_id != null) {
          const fallback = await pool.query(
            `SELECT b.recipe_id, r.name, r.url
             FROM bookings b
             JOIN recipes r
               ON r.id = CAST(
                 NULLIF(
                   regexp_replace(COALESCE(b.recipe_id::text, ''), '[^0-9]', '', 'g'),
                   ''
                 )
                 AS INTEGER
               )
             WHERE b.id = $1
               AND b.recipe_id IS NOT NULL
             LIMIT 1`,
            [booking.id]
          );

          if (fallback.rows.length) {
            linked_recipes = fallback.rows;
            const primaryRecipeId = Number(fallback.rows[0].recipe_id);
            if (Number.isInteger(primaryRecipeId) && primaryRecipeId > 0) {
              await pool.query(
                `INSERT INTO booking_recipes (booking_id, recipe_id)
                 VALUES ($1, $2)
                 ON CONFLICT DO NOTHING`,
                [booking.id, primaryRecipeId]
              );
            }
          }
        }

        // For unmatched (no recipe_id), also get suggestions
        let suggestions = [];
        if (!booking.recipe_id) {
          const matches = await matchEngine.findRecipeMatches(booking, storedRecipes);
          suggestions = matchEngine.buildSuggestionList(matches, 3);
        }

        return { ...booking, linked_recipes, suggestions };
      })
    );

    return res.json({ bookings: bookingsWithData });
  } catch (err) {
    console.error('[RECIPE-MATCH] Error fetching all bookings:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/recipe-matching/versions/by-recipe/:recipeId
 * Return other linked recipes that are associated to the same planner bookings.
 */
router.get('/versions/by-recipe/:recipeId', async (req, res) => {
  try {
    await ensureBookingRecipesTable();

    const recipeId = Number(req.params.recipeId);
    if (!Number.isInteger(recipeId) || recipeId <= 0) {
      return res.status(400).json({ success: false, error: 'Valid recipeId is required.' });
    }

    const relatedResult = await pool.query(
      `WITH target_bookings AS (
         SELECT DISTINCT booking_id
         FROM booking_recipes
         WHERE recipe_id = $1
       ), related AS (
         SELECT br.recipe_id, COUNT(DISTINCT br.booking_id)::int AS shared_bookings
         FROM booking_recipes br
         INNER JOIN target_bookings tb ON tb.booking_id = br.booking_id
         WHERE br.recipe_id <> $1
         GROUP BY br.recipe_id
       )
       SELECT
         r.recipe_id,
         rec.name,
         rec.url,
         r.shared_bookings
       FROM related r
       INNER JOIN recipes rec ON rec.id = r.recipe_id
       ORDER BY r.shared_bookings DESC, rec.name ASC`,
      [recipeId]
    );

    return res.json({
      success: true,
      recipeId,
      versions: relatedResult.rows
    });
  } catch (err) {
    console.error('[RECIPE-MATCH] Error fetching versions by recipe:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/recipe-matching/set-primary
 * Set which linked recipe is the primary (shown on index / planner calendar).
 * Body: { bookingId: number, recipeId: number }
 */
router.put('/set-primary', async (req, res) => {
  try {
    const { bookingId, recipeId } = req.body;
    if (!bookingId || !recipeId) {
      return res.status(400).json({ error: 'bookingId and recipeId required' });
    }

    // Verify this recipe is actually linked to this booking
    await ensureBookingRecipesTable();
    const check = await pool.query(
      'SELECT id FROM booking_recipes WHERE booking_id = $1 AND recipe_id = $2',
      [bookingId, recipeId]
    );
    if (!check.rowCount) {
      return res.status(400).json({ error: 'That recipe is not linked to this booking.' });
    }

    await pool.query('UPDATE bookings SET recipe_id = $1 WHERE id = $2', [recipeId, bookingId]);
    return res.json({ success: true, bookingId, primaryRecipeId: recipeId });
  } catch (err) {
    console.error('[RECIPE-MATCH] Error setting primary:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Ensure booking_recipes table exists
async function ensureBookingRecipesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS booking_recipes (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL,
      recipe_id INTEGER NOT NULL,
      linked_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(booking_id, recipe_id)
    )
  `);
}

/**
 * POST /api/recipe-matching/link-multi
 * Link multiple recipes to a single booking (many-to-many)
 * Body: { bookingId: number, recipeIds: number[] }
 */
router.post('/link-multi', async (req, res) => {
  try {
    const { bookingId, recipeIds } = req.body;
    if (!bookingId || !Array.isArray(recipeIds) || recipeIds.length === 0) {
      return res.status(400).json({ error: 'bookingId and recipeIds[] required' });
    }

    await ensureBookingRecipesTable();

    // Insert all selected recipe links, ignore duplicates
    for (const rid of recipeIds) {
      await pool.query(
        'INSERT INTO booking_recipes (booking_id, recipe_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [bookingId, rid]
      );
    }

    // Also set the primary recipe_id on bookings to the first selected (for backwards compat)
    await pool.query('UPDATE bookings SET recipe_id = $1 WHERE id = $2', [recipeIds[0], bookingId]);

    // Return the full list now linked to this booking
    const linked = await pool.query(
      `SELECT br.recipe_id, r.name, r.url
       FROM booking_recipes br
       JOIN recipes r ON r.id = br.recipe_id
       WHERE br.booking_id = $1
       ORDER BY br.linked_at`,
      [bookingId]
    );

    return res.json({ success: true, bookingId, linked: linked.rows });
  } catch (err) {
    console.error('[RECIPE-MATCH] Error linking multi:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/recipe-matching/linked-recipes/:bookingId
 * Get all recipes linked to a booking
 */
router.get('/linked-recipes/:bookingId', async (req, res) => {
  try {
    await ensureBookingRecipesTable();
    const bookingId = Number(req.params.bookingId);
    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return res.status(400).json({ error: 'Valid bookingId is required.' });
    }

    let result = await pool.query(
      `SELECT br.recipe_id, r.name, r.url
       FROM booking_recipes br
       JOIN recipes r ON r.id = br.recipe_id
       WHERE br.booking_id = $1
       ORDER BY br.linked_at`,
      [bookingId]
    );

    // Backward-compatibility: older links may exist only as bookings.recipe_id.
    if (!result.rows.length) {
      const fallback = await pool.query(
        `SELECT b.recipe_id, r.name, r.url
         FROM bookings b
         JOIN recipes r
           ON r.id = CAST(
             NULLIF(
               regexp_replace(COALESCE(b.recipe_id::text, ''), '[^0-9]', '', 'g'),
               ''
             )
             AS INTEGER
           )
         WHERE b.id = $1
           AND b.recipe_id IS NOT NULL
         LIMIT 1`,
        [bookingId]
      );

      if (fallback.rows.length) {
        const primaryRecipeId = Number(fallback.rows[0].recipe_id);
        if (Number.isInteger(primaryRecipeId) && primaryRecipeId > 0) {
          await pool.query(
            `INSERT INTO booking_recipes (booking_id, recipe_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [bookingId, primaryRecipeId]
          );
        }
        result = fallback;
      }
    }

    res.json({ recipes: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/recipe-matching/link-multi
 * Remove a specific recipe link from a booking
 * Body: { bookingId: number, recipeId: number }
 */
router.delete('/link-multi', requireSignedIn, async (req, res) => {
  try {
    const bookingId = Number(req.body && req.body.bookingId);
    const recipeId = Number(req.body && req.body.recipeId);
    if (!Number.isInteger(bookingId) || bookingId <= 0 || !Number.isInteger(recipeId) || recipeId <= 0) {
      return res.status(400).json({ error: 'Valid bookingId and recipeId are required' });
    }

    await ensureBookingRecipesTable();

    await pool.query('DELETE FROM booking_recipes WHERE booking_id = $1 AND recipe_id = $2', [bookingId, recipeId]);

    const linkedResult = await pool.query(
      `SELECT br.recipe_id, r.name, r.url
       FROM booking_recipes br
       JOIN recipes r ON r.id = br.recipe_id
       WHERE br.booking_id = $1
       ORDER BY br.linked_at`,
      [bookingId]
    );

    const currentBooking = await pool.query('SELECT recipe_id FROM bookings WHERE id = $1', [bookingId]);
    if (!currentBooking.rowCount) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const currentPrimary = Number(currentBooking.rows[0].recipe_id);
    let nextPrimary = Number.isInteger(currentPrimary) ? currentPrimary : null;
    const linkedIds = linkedResult.rows.map((row) => Number(row.recipe_id)).filter((id) => Number.isInteger(id) && id > 0);

    if (!linkedIds.includes(nextPrimary)) {
      nextPrimary = linkedIds.length ? linkedIds[0] : null;
      await pool.query('UPDATE bookings SET recipe_id = $1 WHERE id = $2', [nextPrimary, bookingId]);
    }

    res.json({
      success: true,
      bookingId,
      primaryRecipeId: nextPrimary,
      linked: linkedResult.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
