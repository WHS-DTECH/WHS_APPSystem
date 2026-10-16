const express = require('express');
const router = express.Router();
const pool = require('../db');

let subscriptionSchemaEnsured = false;

async function ensureSubscriptionSchema() {
  if (subscriptionSchemaEnsured) return;
  
  // Create subscriptions table for all users (staff, students, public access)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recipe_subscriptions (
      id SERIAL PRIMARY KEY,
      user_email VARCHAR(255) NOT NULL,
      user_name VARCHAR(255),
      user_type VARCHAR(50),
      is_subscribed BOOLEAN DEFAULT false,
      calendar_change_subscribed BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_email)
    )
  `);

  await pool.query(`
    ALTER TABLE recipe_subscriptions
    ADD COLUMN IF NOT EXISTS calendar_change_subscribed BOOLEAN DEFAULT false
  `);
  
  // Create subscription log table for tracking notifications sent
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscription_notifications (
      id SERIAL PRIMARY KEY,
      recipe_id INTEGER,
      recipe_name VARCHAR(255),
      recipient_email VARCHAR(255),
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      status VARCHAR(50) DEFAULT 'pending'
    )
  `);
  
  subscriptionSchemaEnsured = true;
  console.log('[SUBSCRIPTIONS] Schema initialized');
}

// Initialize on startup (non-blocking)
ensureSubscriptionSchema().catch(err => console.error('[SUBSCRIPTIONS] Schema initialization failed:', err.message));

// GET /api/subscriptions/status - Check if user is subscribed
router.get('/status', async (req, res) => {
  try {
    const userEmail = req.query.email;
    if (!userEmail) {
      return res.status(400).json({ success: false, error: 'Email parameter required' });
    }
    
    const result = await pool.query(
      'SELECT is_subscribed, calendar_change_subscribed, user_name, user_type FROM recipe_subscriptions WHERE LOWER(user_email) = LOWER($1)',
      [userEmail]
    );
    
    const subscription = result.rows[0];
    res.json({
      success: true,
      isSubscribed: subscription ? subscription.is_subscribed : false,
      isCalendarChangeSubscribed: subscription ? subscription.calendar_change_subscribed : false,
      userEmail: userEmail,
      userName: subscription ? subscription.user_name : null,
      userType: subscription ? subscription.user_type : null
    });
  } catch (err) {
    console.error('[SUBSCRIPTIONS] Error checking subscription status:', err);
    res.status(500).json({ success: false, error: 'Failed to check subscription status' });
  }
});

// POST /api/subscriptions/subscribe - Subscribe a user
router.post('/subscribe', async (req, res) => {
  try {
    const { email, name, userType } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email required' });
    }
    
    const result = await pool.query(
      `INSERT INTO recipe_subscriptions (user_email, user_name, user_type, is_subscribed, calendar_change_subscribed)
       VALUES (LOWER($1), $2, $3, true, false)
       ON CONFLICT (user_email) DO UPDATE
       SET is_subscribed = true, user_name = COALESCE($2, user_name), user_type = COALESCE($3, user_type), updated_at = CURRENT_TIMESTAMP
       RETURNING id, user_email, is_subscribed`,
      [email, name || null, userType || null]
    );
    
    res.json({
      success: true,
      message: 'Successfully subscribed to recipe updates',
      subscription: result.rows[0]
    });
  } catch (err) {
    console.error('[SUBSCRIPTIONS] Error subscribing:', err);
    res.status(500).json({ success: false, error: 'Failed to subscribe' });
  }
});

// POST /api/subscriptions/unsubscribe - Unsubscribe a user
router.post('/unsubscribe', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email required' });
    }
    
    const result = await pool.query(
      `UPDATE recipe_subscriptions
       SET is_subscribed = false, updated_at = CURRENT_TIMESTAMP
       WHERE LOWER(user_email) = LOWER($1)
       RETURNING id, user_email, is_subscribed`,
      [email]
    );
    
    if (result.rows.length === 0) {
      // Create a new unsubscribed entry for tracking
      await pool.query(
        `INSERT INTO recipe_subscriptions (user_email, is_subscribed, calendar_change_subscribed)
         VALUES (LOWER($1), false, false)`,
        [email]
      );
    }
    
    res.json({
      success: true,
      message: 'Successfully unsubscribed from recipe updates'
    });
  } catch (err) {
    console.error('[SUBSCRIPTIONS] Error unsubscribing:', err);
    res.status(500).json({ success: false, error: 'Failed to unsubscribe' });
  }
});

// POST /api/subscriptions/preferences - Save recipe and calendar subscription preferences in one request
router.post('/preferences', async (req, res) => {
  try {
    const { email, name, userType, isSubscribed, isCalendarChangeSubscribed } = req.body || {};
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email required' });
    }

    const normalizedRecipe = typeof isSubscribed === 'boolean' ? isSubscribed : null;
    const normalizedCalendar = typeof isCalendarChangeSubscribed === 'boolean' ? isCalendarChangeSubscribed : null;

    const result = await pool.query(
      `INSERT INTO recipe_subscriptions (user_email, user_name, user_type, is_subscribed, calendar_change_subscribed)
       VALUES (LOWER($1), $2, $3, COALESCE($4, false), COALESCE($5, false))
       ON CONFLICT (user_email) DO UPDATE
       SET is_subscribed = COALESCE($4, recipe_subscriptions.is_subscribed),
           calendar_change_subscribed = COALESCE($5, recipe_subscriptions.calendar_change_subscribed),
           user_name = COALESCE($2, recipe_subscriptions.user_name),
           user_type = COALESCE($3, recipe_subscriptions.user_type),
           updated_at = CURRENT_TIMESTAMP
       RETURNING id, user_email, is_subscribed, calendar_change_subscribed`,
      [email, name || null, userType || null, normalizedRecipe, normalizedCalendar]
    );

    res.json({
      success: true,
      message: 'Subscription preferences saved',
      subscription: result.rows[0]
    });
  } catch (err) {
    console.error('[SUBSCRIPTIONS] Error saving preferences:', err);
    res.status(500).json({ success: false, error: 'Failed to save subscription preferences' });
  }
});

// GET /api/subscriptions/list - Get all active subscriptions (for email sending)
router.get('/list', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT user_email, user_name, user_type FROM recipe_subscriptions WHERE is_subscribed = true ORDER BY created_at DESC'
    );
    
    res.json({
      success: true,
      subscriptions: result.rows,
      count: result.rows.length
    });
  } catch (err) {
    console.error('[SUBSCRIPTIONS] Error fetching subscription list:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch subscriptions' });
  }
});

// POST /api/subscriptions/notify - Record a notification being sent
router.post('/notify', async (req, res) => {
  try {
    const { recipeId, recipeName, recipientEmail, status } = req.body;
    if (!recipientEmail) {
      return res.status(400).json({ success: false, error: 'Recipient email required' });
    }
    
    await pool.query(
      `INSERT INTO subscription_notifications (recipe_id, recipe_name, recipient_email, status)
       VALUES ($1, $2, LOWER($3), $4)`,
      [recipeId || null, recipeName || null, recipientEmail, status || 'pending']
    );
    
    res.json({ success: true, message: 'Notification logged' });
  } catch (err) {
    console.error('[SUBSCRIPTIONS] Error logging notification:', err);
    res.status(500).json({ success: false, error: 'Failed to log notification' });
  }
});

module.exports = router;
