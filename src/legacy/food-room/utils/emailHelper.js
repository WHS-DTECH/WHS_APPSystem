/**
 * Email helper for recipe subscription notifications
 * Sends emails to subscribers when new recipes are published
 */

const nodemailer = require('../mailShim');
const pool = require('../db');

let transporter = null;

function getEmailTransporter() {
  if (transporter) return transporter;

  const host = String(process.env.SMTP_HOST || '').trim();
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();

  if (!host || !user || !pass) {
    console.warn('[EMAIL] SMTP credentials not configured. Subscription emails disabled.');
    console.warn('[EMAIL] Please set SMTP_HOST, SMTP_USER, SMTP_PASS environment variables');
    return null;
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || '').trim() === '1';

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    }
  });

  return transporter;
}

/**
 * Send recipe publication notification emails to all subscribed users
 * @param {Object} recipe - Recipe object with id, name, display_name, description
 * @param {string} recipeUrl - URL to view the recipe (e.g., https://app.example.com/view_recipe.html?id=123)
 * @returns {Promise<Object>} Result with { success, sent, failed, total }
 */
async function notifySubscribersOfNewRecipe(recipe, recipeUrl) {
  try {
    const emailer = getEmailTransporter();
    if (!emailer) {
      console.log('[EMAIL] Email notifications disabled (Gmail not configured)');
      return { success: true, sent: 0, failed: 0, total: 0, skipped: true };
    }

    if (!recipe || !recipe.id) {
      console.error('[EMAIL] Invalid recipe object provided');
      return { success: false, error: 'Invalid recipe' };
    }

    // Get all subscribed users
    const result = await pool.query(
      'SELECT user_email, user_name FROM recipe_subscriptions WHERE is_subscribed = true ORDER BY user_email'
    );

    if (result.rows.length === 0) {
      console.log('[EMAIL] No subscribed users found');
      return { success: true, sent: 0, failed: 0, total: 0 };
    }

    const subscribers = result.rows;
    const recipeName = recipe.display_name || recipe.name || 'New Recipe';
    const recipeDesc = recipe.description || '';
    const sent = [];
    const failed = [];

    for (const subscriber of subscribers) {
      try {
        const emailContent = buildRecipeNotificationEmail(
          recipeName,
          recipeDesc,
          recipeUrl,
          subscriber.user_name
        );

        await emailer.sendMail({
          from: String(process.env.SUGGESTION_EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || '').trim(),
          to: subscriber.user_email,
          subject: `🍳 New Recipe Available: ${recipeName}`,
          html: emailContent,
          text: `New recipe available: ${recipeName}\n\nView recipe: ${recipeUrl}`
        });

        sent.push(subscriber.user_email);

        // Log the notification
        await pool.query(
          `INSERT INTO subscription_notifications (recipe_id, recipe_name, recipient_email, status)
           VALUES ($1, $2, $3, $4)`,
          [recipe.id, recipeName, subscriber.user_email, 'sent']
        );

        console.log(`[EMAIL] Sent notification to ${subscriber.user_email} for recipe: ${recipeName}`);
      } catch (err) {
        failed.push(subscriber.user_email);
        console.error(`[EMAIL] Failed to send notification to ${subscriber.user_email}:`, err.message);

        // Log the failed notification
        await pool.query(
          `INSERT INTO subscription_notifications (recipe_id, recipe_name, recipient_email, status)
           VALUES ($1, $2, $3, $4)`,
          [recipe.id, recipeName, subscriber.user_email, 'failed']
        ).catch(logErr => console.error('[EMAIL] Failed to log notification error:', logErr));
      }
    }

    const summary = {
      success: true,
      sent: sent.length,
      failed: failed.length,
      total: subscribers.length,
      recipeName: recipeName
    };

    console.log(`[EMAIL] Recipe notification complete: ${sent.length} sent, ${failed.length} failed, ${subscribers.length} total`);
    return summary;
  } catch (err) {
    console.error('[EMAIL] Error notifying subscribers:', err);
    return {
      success: false,
      error: err.message,
      sent: 0,
      failed: 0
    };
  }
}

/**
 * Build HTML email content for recipe notifications
 */
function buildRecipeNotificationEmail(recipeName, description, recipeUrl, userName) {
  const greeting = userName ? `Hi ${escapeHtml(userName)},` : 'Hi,';

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #3b82f6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
            .recipe-title { font-size: 24px; font-weight: bold; margin: 20px 0; }
            .recipe-description { margin: 15px 0; font-size: 14px; }
            .cta-button { display: inline-block; background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
            .footer { margin-top: 20px; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 15px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🍳 New Recipe Alert!</h1>
            </div>
            <div class="content">
                <p>${greeting}</p>
                <p>A new recipe has been published to the Food Room recipe collection:</p>
                <div class="recipe-title">${escapeHtml(recipeName)}</div>
                ${description ? `<div class="recipe-description">${escapeHtml(description)}</div>` : ''}
                <a href="${escapeHtml(recipeUrl)}" class="cta-button">View Recipe</a>
                <p>You received this email because you're subscribed to recipe updates. You can change your subscription preferences anytime.</p>
                <div class="footer">
                    <p>This is an automated message from Westland High School Food Room.</p>
                </div>
            </div>
        </div>
    </body>
    </html>
  `;
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text || '').replace(/[&<>"']/g, (char) => map[char]);
}

module.exports = {
  notifySubscribersOfNewRecipe,
  buildRecipeNotificationEmail
};
