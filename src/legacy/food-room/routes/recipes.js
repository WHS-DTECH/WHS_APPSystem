
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const nodemailer = require('../mailShim');
const pool = require('../db');

let foodTruckModerationColumnsEnsured = false;
let recipeIssueColumnsEnsured = false;

function logJsonTransfer(routeLabel, payload, details) {
  let bytes = 0;
  try {
    bytes = Buffer.byteLength(JSON.stringify(payload || {}), 'utf8');
  } catch (_) {
    bytes = 0;
  }
  const suffix = details ? ` ${details}` : '';
  console.log(`[TRANSFER] ${routeLabel} bytes=${bytes}${suffix}`);
}

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

async function ensureRecipeMetadataColumns() {
  // Add recipe metadata columns for tracking upload info and planner usage
  await pool.query('ALTER TABLE recipes ADD COLUMN IF NOT EXISTS uploaded_by_email TEXT');
  await pool.query('ALTER TABLE recipes ADD COLUMN IF NOT EXISTS uploaded_by_name TEXT');
  await pool.query('ALTER TABLE recipes ADD COLUMN IF NOT EXISTS used_in_terms TEXT');
  await pool.query('ALTER TABLE recipes ADD COLUMN IF NOT EXISTS used_in_years INTEGER[]');
  await pool.query('ALTER TABLE recipes ADD COLUMN IF NOT EXISTS used_in_year_levels TEXT[]');
  await pool.query('ALTER TABLE recipes ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP');
}

async function ensureFoodTruckModerationColumns() {
  if (foodTruckModerationColumnsEnsured) return;
  await ensureRecipeMetadataColumns();
  await pool.query('ALTER TABLE recipes ADD COLUMN IF NOT EXISTS submitted_channel TEXT');
  await pool.query('ALTER TABLE recipes ADD COLUMN IF NOT EXISTS moderation_status TEXT');
  await pool.query('ALTER TABLE recipes ADD COLUMN IF NOT EXISTS moderation_comment TEXT');
  await pool.query('ALTER TABLE recipes ADD COLUMN IF NOT EXISTS moderation_updated_at TIMESTAMPTZ');
  await pool.query('ALTER TABLE recipes ADD COLUMN IF NOT EXISTS moderated_by_email TEXT');
  await pool.query('ALTER TABLE recipes ADD COLUMN IF NOT EXISTS moderated_by_name TEXT');
  await pool.query('ALTER TABLE recipes ADD COLUMN IF NOT EXISTS moderation_email_sent_at TIMESTAMPTZ');

  await pool.query("UPDATE recipes SET submitted_channel = 'general' WHERE submitted_channel IS NULL OR trim(submitted_channel) = ''");
  await pool.query("UPDATE recipes SET moderation_status = 'approved' WHERE submitted_channel <> 'food_truck' AND (moderation_status IS NULL OR trim(moderation_status) = '')");
  await pool.query("UPDATE recipes SET moderation_status = 'pending' WHERE submitted_channel = 'food_truck' AND (moderation_status IS NULL OR trim(moderation_status) = '')");

  foodTruckModerationColumnsEnsured = true;
}

async function ensureRecipeIssueColumns() {
  if (recipeIssueColumnsEnsured) return;
  await pool.query('ALTER TABLE recipes ADD COLUMN IF NOT EXISTS ingredients_issue_flag BOOLEAN NOT NULL DEFAULT FALSE');
  await pool.query('ALTER TABLE recipes ADD COLUMN IF NOT EXISTS ingredients_issue_note TEXT');
  await pool.query('ALTER TABLE recipes ADD COLUMN IF NOT EXISTS ingredients_issue_updated_at TIMESTAMPTZ');
  recipeIssueColumnsEnsured = true;
}

async function hasFoodTruckTeacherAccess(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  // Keep Food Truck teacher access resilient across older databases.

  try {
    const additionalRoleResult = await pool.query(
      `SELECT lower(trim(uar.role_name)) AS role_name
         FROM user_additional_roles uar
        WHERE lower(trim(uar.email)) = lower(trim($1))`,
      [normalized]
    );

    if (additionalRoleResult.rows.some((row) => {
      const role = String(row && row.role_name || '').trim().toLowerCase();
      return role === 'admin' || role === 'lead_teacher' || role === 'teacher';
    })) {
      return true;
    }
  } catch (err) {
    if (!err || err.code !== '42P01') {
      throw err;
    }
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
      if (primaryRole === 'admin' || primaryRole === 'lead_teacher' || primaryRole === 'teacher') {
        return true;
      }
    }
  } catch (err) {
    if (!err || (err.code !== '42P01' && err.code !== '42703')) {
      throw err;
    }
  }

  const fallbackPermissions = {
    'vanessapringle@westlandhigh.school.nz': true,
    'vanessa.pringle@westlandhigh.school.nz': true
  };
  return Boolean(fallbackPermissions[normalized]);
}

function getFoodTruckTeacherRequestEmail(req) {
  return normalizeEmail(
    req && req.authUserEmail ||
    req && req.headers && (req.headers['x-user-email'] || req.headers['x-staff-email']) ||
    req && req.query && req.query.userEmail ||
    req && req.body && req.body.userEmail
  );
}

async function requireFoodTruckTeacher(req, res, next) {
  const email = getFoodTruckTeacherRequestEmail(req);
  if (!email) {
    return res.status(401).json({ success: false, error: 'Sign in required.' });
  }

  try {
    const allowed = await hasFoodTruckTeacherAccess(email);
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Food Truck teacher access required.' });
    }
    req.authUserEmail = email;
    return next();
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to validate teacher access.' });
  }
}

function getDeclineMailTransport() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 0);
  const secure = String(process.env.SMTP_SECURE || '').trim().toLowerCase() === 'true';
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  const from = String(process.env.SMTP_FROM || '').trim();

  if (!host || !port || !from) {
    return null;
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined
  });

  return { transport, from };
}

function normalizeInstructionLine(line) {
  return (line || '')
    .replace(/JSON-LD\s+Recipe\s+Instructions\s*:/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[Â]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // Strip pre-existing step numbers like "2 Preheat..." or "12 Serve..." at the
    // start of a line. Only match 1–2 digit numbers followed by a space and an
    // uppercase letter so that quantities like "350 degrees" are not stripped.
    .replace(/^\d{1,2}\s+(?=[A-Z])/, '');
}

function cleanInstructionsForDisplay(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  const source = raw.trim();

  // Preferred path: extract every JSON-like "text" field from HowToStep blobs.
  const textMatches = [...source.matchAll(/"text"\s*:\s*"((?:\\.|[^"\\])*)"/g)];
  if (textMatches.length > 0) {
    const lines = textMatches
      .map((match) => {
        try {
          return normalizeInstructionLine(JSON.parse(`"${match[1]}"`));
        } catch {
          return normalizeInstructionLine(match[1].replace(/\\n/g, ' '));
        }
      })
      .filter(Boolean);
    if (lines.length > 0) return lines.join('\n');
  }

  // Fallback: aggressively remove structural JSON/schema markers, keep readable text.
  return source
    .replace(/JSON-LD\s+Recipe\s+Instructions\s*:/gi, ' ')
    .replace(/"@type"\s*:\s*"HowToStep",?/gi, '')
    .replace(/"name"\s*:\s*"((?:\\.|[^"\\])*)",?/gi, '')
    .replace(/"text"\s*:\s*/gi, '')
    .replace(/[\[\]{}]/g, ' ')
    .replace(/"/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\s*,\s*/g, '\n')
    .split('\n')
    .map(normalizeInstructionLine)
    .filter(Boolean)
    .join('\n');
}

function isMeaningfulInstructionSentence(s) {
  if (!s || s.length < 5) return false;
  const junkPatterns = [
    /^(Visible\s+List\s+Items|Recipes|Biscuits|Bread|Cakes|Cupcakes|Desserts|Loaves|Muffins|Pastry|Scones|Slices|Sweets|Products|Explore|Shop|Kids|Contact|Factory|Tours|School|Visits|Groups|Events|Home|Ingredients|Method\s*2|teaspoons|tablespoons|butter|flour|milk|sugar|cinnamon|vanilla|water|lemon|cream|cheese|onion|egg|approximately|finely|melted|chopped|grated|salt|pinch)\b/i,
    /^([A-Z][a-z]+\s+){2,}(Tour|Visits|School|Factory|Products|Recipes|Ingredients|Method)/i,
    /^\d+\s*(cups?|tsp|tbsp|g|kg|ml|teaspoon|tablespoon|gram)\b/i,
    /^(Tour|School|Visits|Factory|Products|Recipes|Ingredients|Method|Home)[\s:,]/i
  ];
  return !junkPatterns.some(pattern => pattern.test(s));
}

function formatInstructionsAsNumberedSentences(raw) {
  const normalized = normalizeInstructionLine(String(raw || ''));
  if (!normalized) return '';

  const sentenceMatches = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  const normalizedSentences = sentenceMatches
    .map((s) => normalizeInstructionLine(s))
    .filter(Boolean);
  const sentences = normalizedSentences
    .filter(isMeaningfulInstructionSentence);

  const finalSentences = sentences.length > 0 ? sentences : normalizedSentences;
  if (finalSentences.length === 0) return '';
  const listItems = finalSentences.map((s) => `<li>${s}</li>`).join('');
  return `<ol>${listItems}</ol>`;
}

function normalizeIngredientLine(line) {
  return (line || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&rsquo;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[Â]/g, '')
    .replace(/^\s*[,;:\-]+\s*/g, '')
    .replace(/\s*[,;:\-]+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitCompressedIngredientText(text) {
  if (!text) return '';
  const units = '(?:cups?|cup|tbsp|tablespoons?|tsp|teaspoons?|g|grams?|kg|kilograms?|ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|oz|ounces?|lb|pounds?|pinch(?:es)?|dash(?:es)?|cloves?|cans?|slices?|pieces?)';
  const qty = '(?:\\d+(?:\\s+\\d+\\/\\d+)?|\\d+\\/\\d+|\\d*\\.\\d+|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])';

  let normalized = String(text)
    .replace(/\bFILLING\b/gi, '\nFILLING\n')
    // Split when a quantity+unit is glued right after a word, e.g. "eggs¼ cup".
    .replace(/(?<=[A-Za-z])(?=[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, '\n')
    // Split before embedded quantity+unit tokens, e.g. "Sugar 2 tsp", preserving all characters.
    .replace(new RegExp(`\\s+(?=${qty}\\s*${units}\\b)`, 'gi'), '\n')
    // Keep existing split for letter-digit joins like "item2".
    .replace(/(?<=[A-Za-z])(?=\d)/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();

  return normalized;
}

function splitIngredientCommaSafely(line) {
  const source = String(line || '').trim();
  if (!source) return [];

  const parts = source
    .split(/\s*,\s*/)
    .map((part) => String(part || '').trim())
    .filter(Boolean);

  if (parts.length <= 1) return [source];

  const likelyNewIngredientStart = /^(?:\d+(?:\s+\d+\/\d+)?|\d+\/\d+|\d*\.\d+|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|a\b|an\b|one\b|two\b|three\b|four\b|five\b|six\b|seven\b|eight\b|nine\b|ten\b)/i;
  const continuationPhrase = /^(?:finely|roughly|coarsely|thinly|thickly|peeled|chopped|diced|minced|sliced|grated|melted|softened|drained|rinsed|beaten|crumbled|optional|plus|for\b|to\b|and\b|or\b|room\s+temperature\b|to\s+serve\b|for\s+garnish\b|for\s+serving\b|for\s+dusting\b|for\s+sprinkling\b)/i;

  const merged = [parts[0]];
  for (let i = 1; i < parts.length; i += 1) {
    const current = parts[i];
    if (likelyNewIngredientStart.test(current) && !continuationPhrase.test(current)) {
      merged.push(current);
    } else {
      merged[merged.length - 1] = `${merged[merged.length - 1]}, ${current}`;
    }
  }

  return merged;
}

function mergeIngredientContinuationLines(lines) {
  const source = Array.isArray(lines) ? lines : [];
  const continuationPhrase = /^(?:finely|roughly|coarsely|thinly|thickly|peeled|chopped|diced|minced|sliced|grated|melted|softened|drained|rinsed|beaten|crumbled|optional|plus|for\b|to\b|and\b|or\b|room\s+temperature\b|to\s+serve\b|for\s+garnish\b|for\s+serving\b|for\s+dusting\b|for\s+sprinkling\b)/i;
  const quantityStart = /^(?:\d+(?:\s+\d+\/\d+)?|\d+\/\d+|\d*\.\d+|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|a\b|an\b|one\b|two\b|three\b|four\b|five\b|six\b|seven\b|eight\b|nine\b|ten\b)/i;

  const merged = [];
  source.forEach((line) => {
    const current = String(line || '').trim();
    if (!current) return;

    if (merged.length === 0) {
      merged.push(current);
      return;
    }

    const looksLikeContinuation = continuationPhrase.test(current)
      || (!quantityStart.test(current) && current.split(/\s+/).length <= 3);

    if (looksLikeContinuation) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}, ${current}`;
      return;
    }

    merged.push(current);
  });

  return merged;
}

function isMeaningfulIngredientLine(line) {
  if (!line) return false;
  const normalized = String(line).trim();
  if (!normalized) return false;
  if (normalized === '...') return false;
  if (/^[,.;:\-]+$/.test(normalized)) return false;
  if (/^[1-5]\s*star$/i.test(normalized)) return false;
  if (/^(noopener|noreferrer|_blank)$/i.test(normalized)) return false;
  if (/^\/products\//i.test(normalized)) return false;
  return true;
}

function isLikelyInstructionToken(line) {
  const token = String(line || '').trim();
  if (!token) return false;
  // Keep quantity/measurement ingredient lines even when they contain decimal dots
  // such as "3.7kg Rice".
  if (/^\d+(?:\.\d+)?\s*(?:cups?|cup|tbsp|tablespoons?|tsp|teaspoons?|g|grams?|kg|kilograms?|ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|oz|ounces?|lb|pounds?|pinch(?:es)?|dash(?:es)?|cloves?|cans?|slices?|pieces?)\b/i.test(token)) {
    return false;
  }
  if (/[!?]/.test(token) || /\.(?:\s|$)/.test(token)) return true;
  if (/^for\s+the\s+doughboys\b/i.test(token)) return true;
  if (/\b(bring|add|boil|simmer|cook|serve|mix|top up|form|divide|mould|continue cooking)\b/i.test(token)) return true;
  return false;
}

function cleanIngredientsForDisplay(raw) {
  if (Array.isArray(raw)) {
    const lines = raw
      .flatMap((item) => splitCompressedIngredientText(String(item || '')).split(/\r?\n/))
      .map((item) => normalizeIngredientLine(String(item || '')))
      .filter(isMeaningfulIngredientLine);
    return mergeIngredientContinuationLines(lines).join('\n');
  }

  if (raw && typeof raw === 'object') {
    raw = JSON.stringify(raw);
  }

  if (typeof raw !== 'string' || !raw.trim()) return '';
  const source = raw.trim();

  // HTML/anchor path: keep visible link text, never link attributes.
  if (/<a\b/i.test(source) || /<[^>]+>/.test(source)) {
    const htmlToText = source
      .replace(/<\/?li[^>]*>/gi, '\n')
      .replace(/<\/?ul[^>]*>/gi, '\n')
      .replace(/<\/?ol[^>]*>/gi, '\n')
      .replace(/<\/?p[^>]*>/gi, '\n')
      .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&rsquo;/gi, "'")
      .replace(/&quot;/gi, '"');

    const htmlTokens = htmlToText
      .split(/\r?\n/)
      .flatMap((line) => splitCompressedIngredientText(String(line || '')).split(/\r?\n/))
      .flatMap((line) => splitIngredientCommaSafely(line))
      .map(normalizeIngredientLine)
      .filter((line) => isMeaningfulIngredientLine(line) && !isLikelyInstructionToken(line));

    if (htmlTokens.length > 0) {
      return mergeIngredientContinuationLines(htmlTokens).join('\n');
    }
  }

  // JSON-array path: many extracted ingredients are stored as JSON text.
  if (source.startsWith('[') && source.endsWith(']')) {
    try {
      const parsed = JSON.parse(source);
      if (Array.isArray(parsed)) {
        const lines = parsed
          .flatMap((item) => splitCompressedIngredientText(String(item || '')).split(/\r?\n/))
          .map((item) => normalizeIngredientLine(String(item || '')))
          .filter(isMeaningfulIngredientLine);
        return mergeIngredientContinuationLines(lines).join('\n');
      }
    } catch {
      // Continue to the regex/text fallbacks below.
    }
  }

  // HTML path: Extract only visible ingredient text from recipeIngredient paragraph nodes.
  if (/<p[^>]*itemprop=["']recipeIngredient["']/i.test(source)) {
    const htmlLines = [...source.matchAll(/<p[^>]*itemprop=["']recipeIngredient["'][^>]*>([\s\S]*?)<\/p>/gi)]
      .map((match) => normalizeIngredientLine(match[1].replace(/<[^>]+>/g, ' ')))
      .filter(isMeaningfulIngredientLine);
    if (htmlLines.length > 0) {
      return mergeIngredientContinuationLines(htmlLines).join('\n');
    }
  }

  // Preferred path: extract quoted ingredient entries from JSON-like arrays.
  const quotedItems = [...source.matchAll(/"((?:\\.|[^"\\])+)"/g)]
    .map((match) => {
      try {
        return normalizeIngredientLine(JSON.parse(`"${match[1]}"`));
      } catch {
        return normalizeIngredientLine(match[1].replace(/\\n/g, ' '));
      }
    })
    .flatMap((item) => splitCompressedIngredientText(String(item || '')).split(/\r?\n/))
    .map(normalizeIngredientLine)
    .filter((item) => isMeaningfulIngredientLine(item) && !isLikelyInstructionToken(item) && !/^(@type|name|text|recipeIngredient)$/i.test(item));

  if (quotedItems.length > 0) {
    return mergeIngredientContinuationLines(quotedItems).join('\n');
  }

  // Fallback cleanup for mixed text/HTML blobs.
  const fallbackLines = source
    .replace(/"?recipeIngredient"?\s*:\s*/gi, '')
    .replace(/[\[\]{}]/g, ' ')
    .replace(/"/g, '')
    .replace(/\\n/g, '\n')
    .split('\n')
    .flatMap((line) => splitIngredientCommaSafely(line))
    .map(normalizeIngredientLine)
    .filter((line) => isMeaningfulIngredientLine(line) && !isLikelyInstructionToken(line));
  return mergeIngredientContinuationLines(fallbackLines).join('\n');
}

function normalizeMultilineText(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function multilineTextToHtmlList(value, ordered) {
  const lines = normalizeMultilineText(value).split('\n').filter(Boolean);
  if (lines.length === 0) return '';
  const tag = ordered ? 'ol' : 'ul';
  const items = lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('');
  return `<${tag}>${items}</${tag}>`;
}

const INGREDIENT_UNITS_PATTERN = '(?:cups?|cup|tbsp|tablespoons?|tsp|teaspoons?|g|grams?|kg|kilograms?|ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|oz|ounces?|lb|pounds?|pinch(?:es)?|dash(?:es)?|cloves?|cans?|slices?|pieces?)';
const INGREDIENT_QTY_PATTERN = '(?:\\d+(?:\\s+\\d+\\/\\d+)?|\\d+\\/\\d+|\\d*\\.\\d+|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])';
const leadingMeasureRegex = new RegExp(`^(${INGREDIENT_QTY_PATTERN}(?:\\s*[-–]\\s*${INGREDIENT_QTY_PATTERN})?)\\s*(${INGREDIENT_UNITS_PATTERN})\\b\\s*(.+)?$`, 'i');
const trailingMeasureRegex = new RegExp(`^(.*?)\\s*[-:–]\\s*(${INGREDIENT_QTY_PATTERN}(?:\\s*[-–]\\s*${INGREDIENT_QTY_PATTERN})?)\\s*(${INGREDIENT_UNITS_PATTERN})\\b\\s*(.*)$`, 'i');
const qtyUnitOnlyRegex = new RegExp(`^${INGREDIENT_QTY_PATTERN}\\s*${INGREDIENT_UNITS_PATTERN}\\b$`, 'i');

function formatIngredientsAsMeasureFooditem(cleanedLines) {
  if (!Array.isArray(cleanedLines)) return [];

  let previousFooditem = '';
  return cleanedLines
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .map((line) => {
      let measurement = '';
      let fooditem = '';

      const leading = line.match(leadingMeasureRegex);
      if (leading) {
        measurement = `${leading[1]} ${leading[2]}`.replace(/\\s+/g, ' ').trim();
        fooditem = String(leading[3] || '').trim();
      } else {
        const trailing = line.match(trailingMeasureRegex);
        if (trailing) {
          measurement = `${trailing[2]} ${trailing[3]}`.replace(/\\s+/g, ' ').trim();
          fooditem = `${String(trailing[1] || '').trim()} ${String(trailing[4] || '').trim()}`.replace(/\\s+/g, ' ').trim();
        } else {
          fooditem = line;
        }
      }

      if (!fooditem && measurement && previousFooditem && qtyUnitOnlyRegex.test(line)) {
        fooditem = previousFooditem;
      }

      if (fooditem) {
        previousFooditem = fooditem.replace(/[-:–]\\s*$/, '').trim() || previousFooditem;
      }

      const merged = measurement && fooditem ? `${measurement} ${fooditem}` : (fooditem || measurement);
      return merged.replace(/\s*,\s*/g, ' ').replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean);
}

function splitExtractedIngredientsPreserveOrder(rawExtractedIngredients) {
  const raw = String(rawExtractedIngredients || '').trim();
  if (!raw) return [];

  const qtyToken = `${INGREDIENT_QTY_PATTERN}(?:\\s*[-–]\\s*${INGREDIENT_QTY_PATTERN})?`;
  const qtyFirstBoundary = new RegExp(`\\s*,\\s*(?=${qtyToken}\\s*${INGREDIENT_UNITS_PATTERN}\\b)`, 'gi');

  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .split(/\r?\n/)
    .flatMap((line) => splitCompressedIngredientText(String(line || '')).split(/\r?\n/))
    .flatMap((line) => String(line || '').split(qtyFirstBoundary))
    .map(normalizeIngredientLine)
    .filter((line) => isMeaningfulIngredientLine(line) && !isLikelyInstructionToken(line));
}

// PUT /api/recipes/:id/raw - Save raw data for a recipe (DB + file)
router.put('/:id/raw', async (req, res) => {
  const { id } = req.params;
  const { raw_data } = req.body;
  if (!raw_data) return res.status(400).json({ success: false, error: 'Missing raw_data' });

  // Save to DB (primary, persists across deploys)
  try {
    await pool.query(
      'UPDATE uploads SET raw_data = $1 WHERE id = (SELECT uploaded_recipe_id FROM recipes WHERE id = $2)',
      [raw_data, id]
    );
  } catch (dbErr) {
    console.error('[PUT /:id/raw] Failed to save raw_data to DB:', dbErr.message);
  }

  // Save to file (secondary, may not survive Render deploys)
  const rawDataDir = path.join(require('../paths').publicDir, 'RawDataTXT');
  if (!fs.existsSync(rawDataDir)) {
    fs.mkdirSync(rawDataDir, { recursive: true });
  }
  const filePath = path.join(rawDataDir, `${id}.txt`);
  fs.writeFile(filePath, raw_data, (fileErr) => {
    if (fileErr) {
      console.error('[PUT /:id/raw] Failed to write raw data file:', fileErr.message);
    }
    res.json({ success: true });
  });
});


// GET /api/recipes/display-dropdown - Get all recipes from recipe_display for dropdown
// Updated: Return both id (primary key), recipeID, and name
router.get('/display-dropdown', async (req, res) => {
  try {
    await ensureFoodTruckModerationColumns();
    const scope = String(req.query && req.query.scope || '').trim().toLowerCase();
    const result = await pool.query(
      `SELECT rd.id, rd.recipeid, rd.name, rd.serving_size
         FROM recipe_display rd
         LEFT JOIN recipes r ON r.id = rd.recipeid
        WHERE ($1 <> 'food_truck')
           OR (
             coalesce(r.submitted_channel, 'general') = 'food_truck'
             AND coalesce(r.moderation_status, 'pending') = 'approved'
           )
        ORDER BY rd.name`,
      [scope]
    );
    res.json({ recipes: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/recipes/display-table - Get all rows from recipe_display
router.get('/display-table', async (req, res) => {
  try {
    await ensureFoodTruckModerationColumns();
    const scope = String(req.query && req.query.scope || '').trim().toLowerCase();
    const fieldsMode = String(req.query && req.query.fields || '').trim().toLowerCase();

    const sql = `
      SELECT rd.*,
             coalesce(r.ft_images, '[]') AS ft_images,
             r.ft_primary_slot
        FROM recipe_display rd
        LEFT JOIN recipes r ON r.id = rd.recipeid
       WHERE (
          $1 <> 'food_truck'
          OR (
            coalesce(r.submitted_channel, 'general') = 'food_truck'
            AND coalesce(r.moderation_status, 'pending') = 'approved'
          )
       )
       ORDER BY rd.id DESC`;
    const result = await pool.query(sql, [scope]);

    let rows = result.rows;
    if (fieldsMode === 'summary') {
      rows = result.rows.map((row) => ({
        id: row.id,
        recipeid: row.recipeid,
        recipe_id: row.recipe_id,
        name: row.name,
        url: row.url,
        image_url: row.image_url,
        ft_images: row.ft_images,
        ft_primary_slot: row.ft_primary_slot,
        planner_stream: row.planner_stream,
        department: row.department
      }));
    }

    logJsonTransfer('GET /api/recipes/display-table', rows, `rows=${rows.length} scope=${scope || 'all'} fields=${fieldsMode || 'full'}`);
    res.json(rows);
  } catch (err) {
    console.error('[ERROR][GET /api/recipes/display-table]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Stepwise Cleanup Instructions API with Progress ---
// let cleanupProgress = { total: 0, current: 0, running: false }; // Removed duplicate declaration
router.post('/cleanup-instructions-stepwise', async (req, res) => {
  if (cleanupProgress.running) return res.status(429).json({ error: 'Cleanup already running' });
  console.log('[CLEANUP] Starting stepwise cleanup of instructions...');
  cleanupProgress.running = true;
  try {
    const requestedRecipeId = Number(req.body?.recipeId);
    if (req.body?.recipeId !== undefined && (!Number.isInteger(requestedRecipeId) || requestedRecipeId <= 0)) {
      cleanupProgress.running = false;
      return res.status(400).json({ error: 'Invalid recipeId' });
    }
    const result = req.body?.recipeId !== undefined
      ? await pool.query('SELECT id, instructions, instructions_extracted FROM recipes WHERE id = $1', [requestedRecipeId])
      : await pool.query('SELECT id, instructions, instructions_extracted FROM recipes');
    const rows = result.rows;
    cleanupProgress.total = rows.length;
    cleanupProgress.current = 0;
    for (const row of rows) {
      const rawExtracted = row.instructions_extracted;
      let cleanedExtracted = cleanInstructionsForDisplay(row.instructions_extracted);
      if (!cleanedExtracted) {
        cleanedExtracted = cleanInstructionsForDisplay(row.instructions);
      }
      const numberedDisplay = formatInstructionsAsNumberedSentences(cleanedExtracted);
      // Debug output for extracted instructions
      console.log(`[CLEANUP] Recipe ID ${row.id}: rawExtracted=`, rawExtracted);
      console.log(`[CLEANUP] Recipe ID ${row.id}: cleanedExtracted=`, cleanedExtracted);
      // Always write to instructions_display, never overwrite instructions
      if (numberedDisplay && numberedDisplay.length > 0) {
        try {
          const updateResult = await pool.query('UPDATE recipes SET instructions_display = $1 WHERE id = $2', [numberedDisplay, row.id]);
          console.log(`[CLEANUP] Recipe ID ${row.id}: Cleaned extracted_instructions and copied to instructions_display. Updated rows: ${updateResult.rowCount}`);
        } catch (err) {
          console.error(`[CLEANUP][ERROR] Recipe ID ${row.id}: Failed to update instructions_display.`, err);
        }
      } else if (row.instructions) {
        let cleaned = row.instructions
          .replace(/"recipeInstructions"\s*:\s*\[.*?\]/gs, '')
          .replace(/\{\s*"@type"\s*:\s*"HowToStep".*?\}/gs, '')
          .replace(/JSON-LD\s+Recipe\s+Instructions\s*:/gi, ' ')
          .replace(/<\/?p>/gi, ' ')
          .replace(/<br\s*\/?\s*>/gi, ' ')
          .replace(/<[^>]+>/g, '')
          .replace(/[Â]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        const numberedFallback = formatInstructionsAsNumberedSentences(cleaned);
        try {
          const updateResult = await pool.query('UPDATE recipes SET instructions_display = $1 WHERE id = $2', [numberedFallback || cleaned, row.id]);
          console.log(`[CLEANUP] Recipe ID ${row.id}: Cleaned instructions and copied to instructions_display. Updated rows: ${updateResult.rowCount}`);
        } catch (err) {
          console.error(`[CLEANUP][ERROR] Recipe ID ${row.id}: Failed to update instructions_display.`, err);
        }
      } else {
        console.log(`[CLEANUP] Recipe ID ${row.id}: No instructions, skipping.`);
      }
      cleanupProgress.current++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    cleanupProgress.running = false;
    console.log(`[CLEANUP] Stepwise cleanup complete. Updated ${cleanupProgress.current} recipes.`);
    res.json({ success: true, message: 'Stepwise cleanup complete.' });
  } catch (e) {
    cleanupProgress.running = false;
    console.error('[CLEANUP] Error during cleanup:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/recipes/:id/display - Copy recipe to recipe_display table
router.post('/:id/display', async (req, res) => {
  const recipeId = req.params.id;
  try {
    // Fetch the recipe from Postgres
    const recipeResult = await pool.query('SELECT * FROM recipes WHERE id = $1', [recipeId]);
    if (recipeResult.rows.length === 0) {
      console.error(`[DISPLAY][ERROR] Recipe not found for id=${recipeId}`);
      return res.status(404).json({ success: false, error: 'Recipe not found' });
    }
    const row = recipeResult.rows[0];
    // Use display columns when publishing, with fallback to original fields.
    const ingredients = row.ingredients_display || row.ingredients;
    const instructions = row.instructions_display || row.instructions;
    // Debug log the data being upserted
    console.log('[DISPLAY][DEBUG] Upserting to recipe_display:', {
      name: row.name,
      description: row.description,
      ingredients,
      serving_size: row.serving_size,
      url: row.url,
      instructions,
      recipeid: row.id
    });
    // Insert or update into recipe_display
    const upsertSql = `
      INSERT INTO recipe_display (name, description, ingredients, serving_size, url, instructions, recipeid)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (recipeid) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        ingredients = EXCLUDED.ingredients,
        serving_size = EXCLUDED.serving_size,
        url = EXCLUDED.url,
        instructions = EXCLUDED.instructions
    `;
    const upsertResult = await pool.query(upsertSql, [
      row.name,
      row.description,
      ingredients,
      row.serving_size,
      row.url,
      instructions,
      row.id
    ]);
    console.log('[DISPLAY][DEBUG] Upsert result:', upsertResult.command, upsertResult.rowCount);

    // Clear raw_data blob now that the recipe is published — it's no longer needed
    // and was a major source of Neon egress when fetched via SELECT *
    try {
      await pool.query(
        'UPDATE uploads SET raw_data = NULL WHERE id = (SELECT uploaded_recipe_id FROM recipes WHERE id = $1 AND uploaded_recipe_id IS NOT NULL)',
        [recipeId]
      );
    } catch (cleanupErr) {
      // Non-fatal: log but don't fail the publish
      console.warn('[DISPLAY] Could not clear raw_data for recipe', recipeId, cleanupErr.message);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[DISPLAY][ERROR] Exception during upsert:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/recipes/:id/verify - Mark recipe ingredients as verified with timestamp
router.post('/:id/verify', async (req, res) => {
  const recipeId = req.params.id;
  try {
    await ensureRecipeIssueColumns();

    // Check if recipe exists
    const recipeResult = await pool.query('SELECT id FROM recipes WHERE id = $1', [recipeId]);
    if (recipeResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Recipe not found' });
    }

    // Update verified_date to current timestamp
    const updateResult = await pool.query(
      `UPDATE recipes
          SET verified_date = CURRENT_TIMESTAMP,
              ingredients_issue_flag = FALSE,
              ingredients_issue_note = NULL,
              ingredients_issue_updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, verified_date`,
      [recipeId]
    );

    if (updateResult.rows.length === 0) {
      return res.status(500).json({ success: false, error: 'Failed to update verified_date' });
    }

    console.log(`[VERIFY][DEBUG] Recipe ${recipeId} marked as verified at`, updateResult.rows[0].verified_date);
    return res.json({ success: true, verified_date: updateResult.rows[0].verified_date });
  } catch (err) {
    console.error('[VERIFY][ERROR]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/recipes/:id/flag-ingredients-issue - mark recipe as needing ingredient fixes
router.post('/:id/flag-ingredients-issue', async (req, res) => {
  const recipeId = Number(req.params.id);
  const issueNoteRaw = String(req.body?.note || '').trim();
  const issueNote = issueNoteRaw ? issueNoteRaw.slice(0, 1000) : null;

  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid recipe id.' });
  }

  try {
    await ensureRecipeIssueColumns();

    const result = await pool.query(
      `UPDATE recipes
          SET ingredients_issue_flag = TRUE,
              ingredients_issue_note = $1,
              ingredients_issue_updated_at = CURRENT_TIMESTAMP,
              verified_date = NULL
        WHERE id = $2
        RETURNING id, ingredients_issue_flag, ingredients_issue_note, ingredients_issue_updated_at`,
      [issueNote, recipeId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Recipe not found.' });
    }

    return res.json({ success: true, recipe: result.rows[0] });
  } catch (err) {
    console.error('[FLAG_INGREDIENTS_ISSUE][ERROR]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/recipes/:id/ingredients-display - Update editable ingredients content
router.put('/:id/ingredients-display', async (req, res) => {
  const recipeId = Number(req.params.id);
  const ingredientsDisplay = String(req.body?.ingredients_display ?? '').trim();

  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid recipe id.' });
  }

  try {
    const result = await pool.query(
      'UPDATE recipes SET ingredients_display = $1 WHERE id = $2 RETURNING id, ingredients_display',
      [ingredientsDisplay, recipeId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Recipe not found.' });
    }

    return res.json({ success: true, recipe: result.rows[0] });
  } catch (err) {
    console.error('[INGREDIENTS_DISPLAY][ERROR]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/recipes/display-table/:id - Unpublish a recipe from recipe_display (by id)
router.delete('/display-table/:id', async (req, res) => {
  let displayId = req.params.id;
  displayId = parseInt(displayId, 10);
  console.log('[UNPUBLISH][DEBUG] Attempting to delete from recipe_display with id:', displayId, 'Type:', typeof displayId);
  try {
    const result = await pool.query('DELETE FROM recipe_display WHERE id = $1', [displayId]);
    console.log('[UNPUBLISH][DEBUG] Delete result:', result.command, 'rowCount:', result.rowCount);
    if (result.rowCount > 0) {
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, error: 'Recipe not found in display table.' });
    }
  } catch (err) {
    console.error('[UNPUBLISH][ERROR]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/recipes/display-by-recipe/:recipeId - Unpublish using recipeid key
router.delete('/display-by-recipe/:recipeId', async (req, res) => {
  const recipeId = parseInt(req.params.recipeId, 10);
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid recipeId.' });
  }

  try {
    const result = await pool.query('DELETE FROM recipe_display WHERE recipeid = $1', [recipeId]);
    if (!result.rowCount) {
      return res.status(404).json({ success: false, error: 'Recipe not found in display table.' });
    }

    return res.json({ success: true, deleted: result.rowCount, recipeId });
  } catch (err) {
    console.error('[UNPUBLISH_BY_RECIPE][ERROR]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// --- Stepwise Cleanup Ingredients API with Progress ---

let cleanupIngredientsProgress = { total: 0, current: 0, running: false };
router.post('/cleanup-ingredients-stepwise', async (req, res) => {
  if (cleanupIngredientsProgress.running) return res.status(429).json({ error: 'Cleanup already running' });
  console.log('[CLEANUP] Starting stepwise cleanup of ingredients...');
  cleanupIngredientsProgress.running = true;
  try {
    const requestedRecipeId = Number(req.body?.recipeId);
    if (req.body?.recipeId !== undefined && (!Number.isInteger(requestedRecipeId) || requestedRecipeId <= 0)) {
      cleanupIngredientsProgress.running = false;
      return res.status(400).json({ error: 'Invalid recipeId' });
    }
    // Use Postgres
    const result = req.body?.recipeId !== undefined
      ? await pool.query('SELECT id, extracted_ingredients, ingredients FROM recipes WHERE id = $1', [requestedRecipeId])
      : await pool.query('SELECT id, extracted_ingredients, ingredients FROM recipes');
    const rows = result.rows;
    cleanupIngredientsProgress.total = rows.length;
    cleanupIngredientsProgress.current = 0;
    for (const row of rows) {
      const rawExtractedIngredients = row.extracted_ingredients;
      const rawIngredients = row.ingredients;
      const rawSource = rawExtractedIngredients || rawIngredients || '';
      const extractedOrderedLines = splitExtractedIngredientsPreserveOrder(rawExtractedIngredients);
      const cleaned = extractedOrderedLines.length ? '' : cleanIngredientsForDisplay(rawSource);
      const cleanedLines = extractedOrderedLines.length
        ? extractedOrderedLines
        : cleaned
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean);
      const formattedLines = formatIngredientsAsMeasureFooditem(cleanedLines);
      const listItems = formattedLines
        .map(line => String(line || '').trim())
        .filter(Boolean)
        .map(line => `<li>${line}</li>`)
        .join('');
      const cleanedForDisplay = listItems ? `<ul>${listItems}</ul>` : '';

      const rawExtractedPreview = String(rawExtractedIngredients || '').slice(0, 500);
      const rawIngredientsPreview = String(rawIngredients || '').slice(0, 500);
      const cleanedPreview = String(cleanedForDisplay || '').slice(0, 500);

      console.log(`[CLEANUP][INGREDIENTS] Recipe ID ${row.id} raw extracted preview:`, rawExtractedPreview);
      console.log(`[CLEANUP][INGREDIENTS] Recipe ID ${row.id} raw ingredients preview:`, rawIngredientsPreview);
      console.log(`[CLEANUP][INGREDIENTS] Recipe ID ${row.id} cleaned display preview:`, cleanedPreview);
      console.log(`[CLEANUP][INGREDIENTS] Recipe ID ${row.id} source length=${String(rawSource || '').length}, cleaned length=${String(cleanedForDisplay || '').length}`);

      const updateResult = await pool.query(
        'UPDATE recipes SET ingredients_display = $1 WHERE id = $2 RETURNING id, ingredients_display',
        [cleanedForDisplay, row.id]
      );
      console.log(`[CLEANUP][INGREDIENTS] Recipe ID ${row.id}: Updated ingredients_display. Updated rows: ${updateResult.rowCount}`);
      if (updateResult.rows[0]) {
        console.log(`[CLEANUP][INGREDIENTS] Recipe ID ${row.id}: ingredients_display saved preview=`, String(updateResult.rows[0].ingredients_display || '').slice(0, 500));
      }
      cleanupIngredientsProgress.current++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    cleanupIngredientsProgress.running = false;
    console.log(`[CLEANUP] Stepwise ingredients cleanup complete. Updated ${cleanupIngredientsProgress.current} recipes.`);
    res.json({ success: true, message: 'Stepwise ingredients cleanup complete.' });
  } catch (e) {
    cleanupIngredientsProgress.running = false;
    console.error('[CLEANUP] Error during ingredients cleanup:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/cleanup-ingredients-progress', (req, res) => {
  res.json(cleanupIngredientsProgress);
});

// --- Stepwise Cleanup Instructions API with Progress ---
let cleanupProgress = { total: 0, current: 0, running: false };
router.post('/cleanup-instructions-stepwise', async (req, res) => {
  if (cleanupProgress.running) return res.status(429).json({ error: 'Cleanup already running' });
  console.log('[CLEANUP] Starting stepwise cleanup of instructions...');
  cleanupProgress.running = true;
  try {
    const result = await pool.query('SELECT id, instructions, instructions_extracted FROM recipes');
    const rows = result.rows;
    cleanupProgress.total = rows.length;
    cleanupProgress.current = 0;
    for (const row of rows) {
      let cleanedExtracted = row.instructions_extracted;
      let rawExtracted = row.instructions_extracted;
      if (typeof cleanedExtracted === 'string') {
        // Try to extract JSON-LD recipeInstructions array
        let match = cleanedExtracted.match(/"recipeInstructions"\s*:\s*(\[.*\])/s);
        if (match) {
          try {
            // Attempt to parse the array
            let arr = JSON.parse(match[1]
              .replace(/\n/g, '')
              .replace(/\r/g, '')
              .replace(/\s+/g, ' ')
              .replace(/([,{])\s*([a-zA-Z0-9_@]+)\s*:/g, '$1"$2":') // ensure keys are quoted
            );
            if (Array.isArray(arr)) {
              // Only keep the instruction text, remove all keys like '@type'.
              cleanedExtracted = arr.map(step => {
                if (typeof step === 'string') {
                  // Remove any leading/trailing quotes or whitespace
                  return step.trim().replace(/^"|"$/g, '');
                }
                if (step && typeof step.text === 'string') {
                  // Remove leading/trailing whitespace from text
                  return step.text.trim();
                }
                return '';
              }).filter(Boolean).join('\n');
              cleanedExtracted = cleanedExtracted.replace(/[Â]/g, '');
            }
          } catch (e) {
            // fallback to regex cleaning if JSON parse fails
            cleanedExtracted = cleanedExtracted
              .replace(/"recipeInstructions"\s*:\s*\[.*?\]/gs, '')
              .replace(/\{\s*"@type"\s*:\s*"HowToStep".*?\}/gs, '')
              .replace(/<\/?p>/gi, ' ')
              .replace(/<br\s*\/?\s*>/gi, ' ')
              .replace(/<[^>]+>/g, '')
              .replace(/[Â]/g, '')
              .replace(/\s+/g, ' ')
              .trim();
          }
        } else {
          cleanedExtracted = cleanedExtracted
            .replace(/"recipeInstructions"\s*:\s*\[.*?\]/gs, '')
            .replace(/\{\s*"@type"\s*:\s*"HowToStep".*?\}/gs, '')
            .replace(/<\/?p>/gi, ' ')
            .replace(/<br\s*\/?\s*>/gi, ' ')
            .replace(/<[^>]+>/g, '')
            .replace(/[Â]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        }
      }
      cleanedExtracted = String(cleanedExtracted || '').replace(/JSON-LD\s+Recipe\s+Instructions\s*:/gi, ' ').trim();
      const numberedDisplay = formatInstructionsAsNumberedSentences(cleanedExtracted);

      // Debug output for extracted instructions
      console.log(`[CLEANUP] Recipe ID ${row.id}: rawExtracted=`, rawExtracted);
      console.log(`[CLEANUP] Recipe ID ${row.id}: cleanedExtracted=`, cleanedExtracted);
      // Always write to instructions_display, never overwrite instructions
      if (numberedDisplay && numberedDisplay.length > 0) {
        await pool.query('UPDATE recipes SET instructions_display = $1 WHERE id = $2', [numberedDisplay, row.id]);
        console.log(`[CLEANUP] Recipe ID ${row.id}: Cleaned extracted_instructions and copied to instructions_display.`);
      } else if (row.instructions) {
        let cleaned = row.instructions
          .replace(/JSON-LD\s+Recipe\s+Instructions\s*:/gi, ' ')
          .replace(/"recipeInstructions"\s*:\s*\[.*?\]/gs, '')
          .replace(/\{\s*"@type"\s*:\s*"HowToStep".*?\}/gs, '')
          .replace(/<\/?p>/gi, ' ')
          .replace(/<br\s*\/?\s*>/gi, ' ')
          .replace(/<[^>]+>/g, '')
          .replace(/[Â]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        const numberedFallback = formatInstructionsAsNumberedSentences(cleaned);
        await pool.query('UPDATE recipes SET instructions_display = $1 WHERE id = $2', [numberedFallback || cleaned, row.id]);
        console.log(`[CLEANUP] Recipe ID ${row.id}: Cleaned instructions and copied to instructions_display.`);
      } else {
        console.log(`[CLEANUP] Recipe ID ${row.id}: No instructions, skipping.`);
      }
      cleanupProgress.current++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    cleanupProgress.running = false;
    console.log(`[CLEANUP] Stepwise cleanup complete. Updated ${cleanupProgress.current} recipes.`);
    res.json({ success: true, message: 'Stepwise cleanup complete.' });
  } catch (e) {
    cleanupProgress.running = false;
    console.error('[CLEANUP] Error during cleanup:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/cleanup-instructions-progress', (req, res) => {
  res.json(cleanupProgress);
});
// --- Cleanup Instructions API ---
router.post('/cleanup-instructions', (req, res) => {
  console.log('[CLEANUP] Starting cleanup of instructions...');
  db.all('SELECT id, instructions FROM recipes', [], (err, rows) => {
    if (err) {
      console.error('[CLEANUP] DB error:', err);
      return res.status(500).json({ error: err.message });
    }
    let updated = 0;
    let checked = 0;
    let total = rows.length;
    let finished = 0;
    if (total === 0) {
      console.log('[CLEANUP] No recipes found.');
      return res.json({ success: true, updated: 0 });
    }
    rows.forEach(row => {
      checked++;
      if (!row.instructions) {
        console.log(`[CLEANUP] Recipe ID ${row.id}: No instructions, skipping.`);
        finished++;
        if (finished === total) {
          console.log(`[CLEANUP] Checked ${checked} recipes, updated ${updated}.`);
          res.json({ success: true, updated });
        }
        return;
      }
      // Remove <p>, </p>, <br>, <br/>, <br /> and all HTML tags
      let cleaned = row.instructions
        .replace(/<\/?p>/gi, ' ')
        .replace(/<br\s*\/?\s*>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ') // collapse whitespace
        .trim();
      if (cleaned !== row.instructions.trim()) {
        db.run('UPDATE recipes SET instructions = ? WHERE id = ?', [cleaned, row.id], function(err2) {
          if (!err2) {
            updated++;
            console.log(`[CLEANUP] Recipe ID ${row.id}: Cleaned and updated.`);
          } else {
            console.error(`[CLEANUP] Recipe ID ${row.id}: Update error:`, err2);
          }
          finished++;
          if (finished === total) {
            console.log(`[CLEANUP] Checked ${checked} recipes, updated ${updated}.`);
            res.json({ success: true, updated });
          }
        });
      } else {
        console.log(`[CLEANUP] Recipe ID ${row.id}: No change needed.`);
        finished++;
        if (finished === total) {
          console.log(`[CLEANUP] Checked ${checked} recipes, updated ${updated}.`);
          res.json({ success: true, updated });
        }
      }
    });
  });
});

// Get all recipes (with upload raw_data)
router.get('/', async (req, res) => {
  const sql = `
    SELECT recipes.*, recipes.instructions_display, recipes.ingredients_display, uploads.raw_data as upload_raw_data
    FROM recipes
    LEFT JOIN uploads ON recipes.uploaded_recipe_id = uploads.id
    ORDER BY recipes.id DESC
  `;
  try {
    // Best-effort schema guard: do not block recipe reads on transient DB hiccups.
    await ensureRecipeIssueColumns().catch((schemaErr) => {
      console.warn('[DEBUG /api/recipes] ensureRecipeIssueColumns skipped:', schemaErr.message);
    });
    const result = await pool.query(sql);
    console.log('[DEBUG /api/recipes] Number of recipes returned:', result.rows.length);
    res.json(result.rows);
  } catch (err) {
    console.error('[DEBUG /api/recipes] Error:', err);
    if (err && err.code === 'ECONNRESET') {
      // Keep liveness endpoints from failing hard while database connections recover.
      return res.status(200).json([]);
    }
    res.status(500).json({ error: err.message });
  }
});

// Get the next auto-assigned recipe ID preview for manual entry.
router.get('/next-id', async (_req, res) => {
  try {
    const result = await pool.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM recipes');
    const nextId = Number(result.rows[0] && result.rows[0].next_id) || 1;
    res.json({ success: true, nextId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch next recipe ID.' });
  }
});

// Create a recipe by manual copy/paste entry.
router.post('/manual', async (req, res) => {
  const name = String(req.body && req.body.name || '').trim();
  const studentName = String(req.body && req.body.student_name || '').trim();
  const description = String(req.body && req.body.description || '').trim();
  const url = String(req.body && req.body.url || '').trim();
  const servingRaw = String(req.body && req.body.serving_size || '').trim();
  const ingredientsText = normalizeMultilineText(req.body && req.body.ingredients_text);
  const instructionsText = normalizeMultilineText(req.body && req.body.instructions_text);
  const rawText = normalizeMultilineText(req.body && req.body.raw_text);

  if (!name) {
    return res.status(400).json({ success: false, error: 'Recipe name is required.' });
  }

  if (!ingredientsText && !instructionsText && !rawText) {
    return res.status(400).json({
      success: false,
      error: 'Paste at least ingredients, instructions, or full raw text.'
    });
  }

  const servingSize = servingRaw === '' ? null : Number(servingRaw);
  if (servingRaw !== '' && (!Number.isFinite(servingSize) || servingSize < 0)) {
    return res.status(400).json({ success: false, error: 'Serving size must be a positive number.' });
  }

  const ingredientsDisplay = multilineTextToHtmlList(ingredientsText, false);
  const instructionsDisplay = multilineTextToHtmlList(instructionsText, true);
  const createdByEmail = normalizeEmail(req && req.authUserEmail);
  const createdByName = authUserName(req);

  try {
    await ensureFoodTruckModerationColumns();
    const insertResult = await pool.query(
      `INSERT INTO recipes (
        name,
        description,
        url,
        serving_size,
        ingredients,
        instructions,
        extracted_ingredients,
        instructions_extracted,
        ingredients_display,
        instructions_display,
        student_name,
        created_by_email,
        created_by_name,
        submitted_channel,
        moderation_status,
        moderation_comment,
        moderation_updated_at,
        moderated_by_email,
        moderated_by_name
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),NULL,NULL)
      RETURNING id`,
      [
        name,
        description || null,
        url || null,
        servingSize,
        ingredientsText || null,
        instructionsText || null,
        ingredientsText || null,
        instructionsText || null,
        ingredientsDisplay || null,
        instructionsDisplay || null,
        studentName || null,
        createdByEmail || null,
        createdByName || null,
        'food_truck',
        'pending',
        null
      ]
    );

    const recipeId = Number(insertResult.rows[0] && insertResult.rows[0].id);

    if (recipeId && rawText) {
      const rawDataDir = path.join(require('../paths').publicDir, 'RawDataTXT');
      if (!fs.existsSync(rawDataDir)) {
        fs.mkdirSync(rawDataDir, { recursive: true });
      }
      const filePath = path.join(rawDataDir, `${recipeId}.txt`);
      fs.writeFileSync(filePath, rawText, 'utf8');
    }

    res.json({ success: true, recipeId, moderationStatus: 'pending' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to save manual recipe.' });
  }
});

router.put('/manual/:id', requireFoodTruckTeacher, async (req, res) => {
  const recipeId = Number(req.params.id);
  const name = String(req.body && req.body.name || '').trim();
  const studentName = String(req.body && req.body.student_name || '').trim();
  const description = String(req.body && req.body.description || '').trim();
  const url = String(req.body && req.body.url || '').trim();
  const servingRaw = String(req.body && req.body.serving_size || '').trim();
  const ingredientsText = normalizeMultilineText(req.body && req.body.ingredients_text);
  const instructionsText = normalizeMultilineText(req.body && req.body.instructions_text);

  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid recipe ID.' });
  }

  if (!name) {
    return res.status(400).json({ success: false, error: 'Recipe name is required.' });
  }

  if (!ingredientsText && !instructionsText) {
    return res.status(400).json({ success: false, error: 'Paste at least ingredients or instructions.' });
  }

  const servingSize = servingRaw === '' ? null : Number(servingRaw);
  if (servingRaw !== '' && (!Number.isFinite(servingSize) || servingSize < 0)) {
    return res.status(400).json({ success: false, error: 'Serving size must be a positive number.' });
  }

  const ingredientsDisplay = multilineTextToHtmlList(ingredientsText, false);
  const instructionsDisplay = multilineTextToHtmlList(instructionsText, true);

  try {
    await ensureFoodTruckModerationColumns();

    const existingResult = await pool.query('SELECT id FROM recipes WHERE id = $1 LIMIT 1', [recipeId]);
    if (!existingResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Recipe not found.' });
    }

    await pool.query(
      `UPDATE recipes
          SET name = $1,
              description = $2,
              url = $3,
              serving_size = $4,
              ingredients = $5,
              instructions = $6,
              extracted_ingredients = $5,
              instructions_extracted = $6,
              ingredients_display = $7,
              instructions_display = $8,
              student_name = $9,
              submitted_channel = 'food_truck',
              moderation_status = 'pending',
              moderation_comment = NULL,
              moderation_updated_at = NOW(),
              moderated_by_email = NULL,
              moderated_by_name = NULL,
              moderation_email_sent_at = NULL
        WHERE id = $10`,
      [
        name,
        description || null,
        url || null,
        servingSize,
        ingredientsText || null,
        instructionsText || null,
        ingredientsDisplay || null,
        instructionsDisplay || null,
        studentName || null,
        recipeId
      ]
    );

    await pool.query('DELETE FROM recipe_display WHERE recipeid = $1', [recipeId]);

    res.json({ success: true, recipeId, moderationStatus: 'pending' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to update manual recipe.' });
  }
});

router.get('/food-truck/moderation-list', requireFoodTruckTeacher, async (req, res) => {
  try {
    await ensureFoodTruckModerationColumns();
    const status = String(req.query && req.query.status || 'pending').trim().toLowerCase();
    const normalizedStatus = ['pending', 'approved', 'declined', 'all'].includes(status) ? status : 'pending';

    const result = await pool.query(
      `SELECT r.id,
              r.name,
              r.student_name,
              r.created_by_name,
              r.created_by_email,
              r.submitted_channel,
              r.moderation_status,
              r.moderation_comment,
              r.moderation_updated_at,
              r.moderated_by_name,
              r.moderated_by_email,
              EXISTS (SELECT 1 FROM recipe_display rd WHERE rd.recipeid = r.id) AS is_published
         FROM recipes r
        WHERE coalesce(r.submitted_channel, '') = 'food_truck'
          AND ($1 = 'all' OR coalesce(r.moderation_status, 'pending') = $1)
        ORDER BY r.id DESC`,
      [normalizedStatus]
    );

    res.json({ success: true, recipes: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to load moderation list.' });
  }
});

router.post('/food-truck/admin/reclassify-pending', requireFoodTruckTeacher, async (req, res) => {
  const recipeId = Number(req.body && req.body.recipeId);
  const recipeName = String(req.body && req.body.name || '').trim();
  const studentName = String(req.body && req.body.studentName || '').trim();
  const createdByEmail = normalizeEmail(req.body && req.body.createdByEmail);

  if ((!Number.isInteger(recipeId) || recipeId <= 0) && !recipeName) {
    return res.status(400).json({
      success: false,
      error: 'Provide recipeId or name to reclassify a Food Truck recipe.'
    });
  }

  try {
    await ensureFoodTruckModerationColumns();

    let recipeResult;
    if (Number.isInteger(recipeId) && recipeId > 0) {
      recipeResult = await pool.query(
        `SELECT id, name, student_name, created_by_email, moderation_status
           FROM recipes
          WHERE id = $1
          LIMIT 1`,
        [recipeId]
      );
    } else {
      recipeResult = await pool.query(
        `SELECT id, name, student_name, created_by_email, moderation_status
           FROM recipes
          WHERE lower(trim(name)) = lower(trim($1))
            AND ($2 = '' OR lower(trim(coalesce(student_name, ''))) = lower(trim($2)))
            AND ($3 = '' OR lower(trim(coalesce(created_by_email, ''))) = lower(trim($3)))
          ORDER BY id DESC`,
        [recipeName, studentName, createdByEmail]
      );
    }

    if (!recipeResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Recipe not found.' });
    }

    if (recipeResult.rows.length > 1) {
      return res.status(409).json({
        success: false,
        error: 'Multiple recipes matched. Retry with recipeId or more filters.',
        matches: recipeResult.rows
      });
    }

    const row = recipeResult.rows[0];
    await pool.query(
      `UPDATE recipes
          SET submitted_channel = 'food_truck',
              moderation_status = 'pending',
              moderation_comment = NULL,
              moderation_updated_at = NOW(),
              moderated_by_email = $1,
              moderated_by_name = $2,
              moderation_email_sent_at = NULL
        WHERE id = $3`,
      [normalizeEmail(req.authUserEmail), authUserName(req), row.id]
    );

    const unpublished = await pool.query('DELETE FROM recipe_display WHERE recipeid = $1', [row.id]);

    return res.json({
      success: true,
      recipe: {
        id: row.id,
        name: row.name,
        student_name: row.student_name,
        created_by_email: row.created_by_email,
        moderation_status: 'pending'
      },
      unpublished: unpublished.rowCount > 0
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to reclassify recipe.'
    });
  }
});

router.post('/:id/food-truck/approve', requireFoodTruckTeacher, async (req, res) => {
  const recipeId = Number(req.params.id);
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid recipe ID.' });
  }

  try {
    await ensureFoodTruckModerationColumns();

    const recipeResult = await pool.query(
      `SELECT *
         FROM recipes
        WHERE id = $1
          AND coalesce(submitted_channel, '') = 'food_truck'
        LIMIT 1`,
      [recipeId]
    );

    if (!recipeResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Food Truck recipe not found.' });
    }

    const row = recipeResult.rows[0];
    const ingredients = row.ingredients_display || row.ingredients;
    const instructions = row.instructions_display || row.instructions;

    await pool.query(
      `INSERT INTO recipe_display (name, description, ingredients, serving_size, url, instructions, recipeid)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (recipeid) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         ingredients = EXCLUDED.ingredients,
         serving_size = EXCLUDED.serving_size,
         url = EXCLUDED.url,
         instructions = EXCLUDED.instructions`,
      [
        row.name,
        row.description,
        ingredients,
        row.serving_size,
        row.url,
        instructions,
        row.id
      ]
    );

    await pool.query(
      `UPDATE recipes
          SET moderation_status = 'approved',
              moderation_comment = NULL,
              moderation_updated_at = NOW(),
              moderated_by_email = $1,
              moderated_by_name = $2
        WHERE id = $3`,
      [normalizeEmail(req.authUserEmail), authUserName(req), recipeId]
    );

    // Clear raw_data blob now that the recipe is approved — no longer needed
    try {
      await pool.query(
        'UPDATE uploads SET raw_data = NULL WHERE id = (SELECT uploaded_recipe_id FROM recipes WHERE id = $1 AND uploaded_recipe_id IS NOT NULL)',
        [recipeId]
      );
    } catch (cleanupErr) {
      console.warn('[APPROVE] Could not clear raw_data for recipe', recipeId, cleanupErr.message);
    }

    res.json({ success: true, message: 'Recipe approved and published.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to approve recipe.' });
  }
});

// Preview-only endpoint: sends decline email to the teacher only, no DB changes.
router.post('/:id/food-truck/decline-preview', requireFoodTruckTeacher, async (req, res) => {
  const recipeId = Number(req.params.id);
  const reason = String(req.body && req.body.reason || '').trim();
  const previewTo = normalizeEmail(req.body && req.body.previewTo);
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid recipe ID.' });
  }
  if (!reason) {
    return res.status(400).json({ success: false, error: 'Decline reason is required.' });
  }
  if (!previewTo) {
    return res.status(400).json({ success: false, error: 'previewTo email is required.' });
  }

  try {
    const recipeResult = await pool.query(
      `SELECT id, name, student_name FROM recipes WHERE id = $1 LIMIT 1`,
      [recipeId]
    );
    const row = recipeResult.rows[0];
    if (!row) return res.status(404).json({ success: false, error: 'Recipe not found.' });

    const mailConfig = getDeclineMailTransport();
    if (!mailConfig) {
      return res.status(503).json({ success: false, error: 'SMTP is not configured for decline emails.' });
    }

    const studentFirstName = String(row.student_name || '').trim() || 'student';
    const recipeName = row.name || `Recipe ${recipeId}`;
    await mailConfig.transport.sendMail({
      from: mailConfig.from,
      to: previewTo,
      subject: `[PREVIEW] Food Truck recipe update: ${recipeName}`,
      text: `[TEST PREVIEW — this is what the student would receive]\n\nHi ${studentFirstName},\n\nYour Food Truck recipe submission "${recipeName}" was declined by a teacher.\n\nReason:\n${reason}\n\nPlease update your recipe and submit it again.\n`,
      html: `<p style="background:#fff3cd;padding:0.5em;border:1px solid #ffe082;border-radius:4px;"><strong>TEST PREVIEW</strong> — this is what the student would receive.</p><p>Hi ${escapeHtml(studentFirstName)},</p><p>Your Food Truck recipe submission <strong>${escapeHtml(recipeName)}</strong> was declined by a teacher.</p><p><strong>Reason:</strong><br>${escapeHtml(reason).replace(/\n/g, '<br>')}</p><p>Please update your recipe and submit it again.</p>`
    });

    res.json({ success: true, message: 'Preview email sent to ' + previewTo });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to send preview email.' });
  }
});

router.post('/:id/food-truck/decline', requireFoodTruckTeacher, async (req, res) => {
  const recipeId = Number(req.params.id);
  const reason = String(req.body && req.body.reason || '').trim();
  const ccEmail = normalizeEmail(req.body && req.body.ccEmail);
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid recipe ID.' });
  }
  if (!reason) {
    return res.status(400).json({ success: false, error: 'Decline reason is required.' });
  }

  try {
    await ensureFoodTruckModerationColumns();

    const recipeResult = await pool.query(
      `SELECT id, name, created_by_email, student_name
         FROM recipes
        WHERE id = $1
          AND coalesce(submitted_channel, '') = 'food_truck'
        LIMIT 1`,
      [recipeId]
    );

    if (!recipeResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Food Truck recipe not found.' });
    }

    const row = recipeResult.rows[0];
    await pool.query(
      `UPDATE recipes
          SET moderation_status = 'declined',
              moderation_comment = $1,
              moderation_updated_at = NOW(),
              moderated_by_email = $2,
              moderated_by_name = $3
        WHERE id = $4`,
      [reason, normalizeEmail(req.authUserEmail), authUserName(req), recipeId]
    );

    await pool.query('DELETE FROM recipe_display WHERE recipeid = $1', [recipeId]);

    let mailSent = false;
    let mailError = '';
    const studentEmail = normalizeEmail(row.created_by_email);
    const mailConfig = getDeclineMailTransport();

    if (studentEmail && mailConfig) {
      try {
        const mailOptions = {
          from: mailConfig.from,
          to: studentEmail,
          subject: `Food Truck recipe update: ${row.name || `Recipe ${recipeId}`}`,
          text: `Hi ${String(row.student_name || '').trim() || 'student'},\n\nYour Food Truck recipe submission \"${row.name || `Recipe ${recipeId}`}\" was declined by a teacher.\n\nReason:\n${reason}\n\nPlease update your recipe and submit it again.\n`,
          html: `<p>Hi ${escapeHtml(String(row.student_name || '').trim() || 'student')},</p><p>Your Food Truck recipe submission <strong>${escapeHtml(row.name || `Recipe ${recipeId}`)}</strong> was declined by a teacher.</p><p><strong>Reason:</strong><br>${escapeHtml(reason).replace(/\n/g, '<br>')}</p><p>Please update your recipe and submit it again.</p>`
        };
        if (ccEmail && ccEmail !== studentEmail) mailOptions.cc = ccEmail;
        await mailConfig.transport.sendMail(mailOptions);
        mailSent = true;
        await pool.query('UPDATE recipes SET moderation_email_sent_at = NOW() WHERE id = $1', [recipeId]);
      } catch (err) {
        mailError = err && err.message ? err.message : 'Failed to send decline email.';
      }
    } else if (!studentEmail) {
      mailError = 'Student email not available for this recipe.';
    } else {
      mailError = 'SMTP is not configured for decline emails.';
    }

    res.json({
      success: true,
      message: 'Recipe declined.',
      mailSent,
      mailError
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to decline recipe.' });
  }
});

// Create a new recipe
router.post('/recipes', async (req, res) => {
  const { name, description, url } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Recipe name is required.' });
  }
  try {
    const normalizedName = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const duplicateResult = await pool.query(
      `SELECT id, name, url
       FROM recipes
       WHERE lower(regexp_replace(coalesce(name, ''), '[^a-z0-9]+', '', 'g')) = $1
          OR ($2 <> '' AND lower(coalesce(url, '')) = lower($2))
       ORDER BY id ASC
       LIMIT 1`,
      [normalizedName, String(url || '').trim()]
    );

    if (duplicateResult.rows.length > 0) {
      const existing = duplicateResult.rows[0];
      return res.status(409).json({
        error: 'Recipe already exists.',
        existingRecipe: existing
      });
    }

    const result = await pool.query(
      'INSERT INTO recipes (name, description, url) VALUES ($1, $2, $3) RETURNING id',
      [name, description, url || '']
    );
    res.json({ id: result.rows[0].id, name, description, url: url || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update recipe
router.put('/recipes/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Recipe name is required.' });
  }
  try {
    const result = await pool.query('UPDATE recipes SET name = $1, description = $2 WHERE id = $3 RETURNING id', [name, description, id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Recipe not found.' });
    res.json({ id, name, description });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete recipe
router.delete('/recipes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM recipes WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Recipe not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get recipe options for dropdown
router.get('/dropdown', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name FROM recipes ORDER BY id DESC');
    res.json({ recipes: result.rows || [] });
  } catch (err) {
    console.error('[DEBUG] Error fetching recipes:', err);
    res.status(500).json({ error: 'Failed to fetch recipes.' });
  }
});

// Get a single recipe by ID (for Recipe Details page) - THIS ROUTE MUST BE LAST
router.get('/recipes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT *,
        CASE WHEN instructions IS NULL OR instructions = '' THEN instructions_extracted ELSE instructions END as instructions
       FROM recipes WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Recipe not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recipe.' });
  }
});

// POST /api/recipes/:id/adjust — Clone a recipe with user modifications
// Body: { name, ingredients, serving_size, description }
// Auth: requires logged-in user (email + name from session)
router.post('/:id/adjust', async (req, res) => {
  const baseId = parseInt(req.params.id, 10);
  if (!Number.isInteger(baseId) || baseId <= 0) {
    return res.status(400).json({ error: 'Invalid base recipe ID.' });
  }

  const createdByEmail = String(req.authUserEmail || '').trim().toLowerCase();
  const createdByName = String((req.authUser && req.authUser.name) || createdByEmail || '').trim();
  if (!createdByEmail) {
    return res.status(401).json({ error: 'You must be logged in to adjust a recipe.' });
  }

  const name = String(req.body.name || '').trim();
  if (!name) {
    return res.status(400).json({ error: 'Recipe name is required.' });
  }

  const ingredientsText = String(req.body.ingredients || '').trim();
  const servingRaw = req.body.serving_size;
  const servingSize = servingRaw != null && servingRaw !== '' ? Number(servingRaw) : null;
  const description = String(req.body.description || '').trim() || null;

  try {
    // Fetch base recipe so we can copy fields we are not changing
    const baseResult = await pool.query('SELECT * FROM recipes WHERE id = $1', [baseId]);
    if (baseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Base recipe not found.' });
    }
    const base = baseResult.rows[0];

    const finalIngredients = ingredientsText || base.ingredients || null;
    const ingredientsDisplay = finalIngredients ? multilineTextToHtmlList(finalIngredients, false) : (base.ingredients_display || null);
    const finalServing = (servingSize != null && Number.isFinite(servingSize)) ? servingSize : base.serving_size;

    const insertWithInventorySql = `INSERT INTO recipes (
      name, description, url,
      serving_size,
      ingredients, instructions, extracted_ingredients, instructions_extracted,
      ingredients_display, instructions_display, ingredients_inventories,
      adjusted_from_id, created_by_email, created_by_name
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    RETURNING id`;

    const insertWithoutInventorySql = `INSERT INTO recipes (
      name, description, url,
      serving_size,
      ingredients, instructions, extracted_ingredients, instructions_extracted,
      ingredients_display, instructions_display,
      adjusted_from_id, created_by_email, created_by_name
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING id`;

    const insertWithInventoryParams = [
      name,
      description || `Adjusted from "${base.name}"`,
      base.url || null,
      finalServing,
      finalIngredients,
      base.instructions || null,
      finalIngredients,
      base.instructions_extracted || null,
      ingredientsDisplay,
      base.instructions_display || null,
      base.ingredients_inventories || null,
      baseId,
      createdByEmail,
      createdByName
    ];

    let insertResult;
    try {
      insertResult = await pool.query(insertWithInventorySql, insertWithInventoryParams);
    } catch (insertErr) {
      // Some deployed DBs do not yet have the ingredients_inventories column.
      if (insertErr && insertErr.code === '42703') {
        insertResult = await pool.query(insertWithoutInventorySql, [
          name,
          description || `Adjusted from "${base.name}"`,
          base.url || null,
          finalServing,
          finalIngredients,
          base.instructions || null,
          finalIngredients,
          base.instructions_extracted || null,
          ingredientsDisplay,
          base.instructions_display || null,
          baseId,
          createdByEmail,
          createdByName
        ]);
      } else {
        throw insertErr;
      }
    }

    const newId = insertResult.rows[0].id;

    // Make adjusted versions immediately selectable in Book a Class.
    try {
      const adjustedRecipeResult = await pool.query('SELECT * FROM recipes WHERE id = $1', [newId]);
      if (adjustedRecipeResult.rows.length > 0) {
        const adjusted = adjustedRecipeResult.rows[0];
        const displayIngredients = adjusted.ingredients_display || adjusted.ingredients;
        const displayInstructions = adjusted.instructions_display || adjusted.instructions;
        await pool.query(
          `INSERT INTO recipe_display (name, description, ingredients, serving_size, url, instructions, recipeid)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (recipeid) DO UPDATE SET
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             ingredients = EXCLUDED.ingredients,
             serving_size = EXCLUDED.serving_size,
             url = EXCLUDED.url,
             instructions = EXCLUDED.instructions`,
          [
            adjusted.name,
            adjusted.description,
            displayIngredients,
            adjusted.serving_size,
            adjusted.url,
            displayInstructions,
            adjusted.id
          ]
        );
      }
    } catch (publishErr) {
      console.warn('[adjust recipe] Auto publish to recipe_display failed:', publishErr && publishErr.message ? publishErr.message : publishErr);
    }

    res.json({ success: true, recipeId: newId, name });
  } catch (err) {
    console.error('[adjust recipe]', err);
    res.status(500).json({ error: err.message || 'Failed to save adjusted recipe.' });
  }
});

// GET /api/recipes/mine — Recipes created/adjusted by the logged-in user
router.get('/mine', async (req, res) => {
  const email = String(req.authUserEmail || '').trim().toLowerCase();
  if (!email) return res.status(401).json({ error: 'Not authenticated.' });
  try {
    const result = await pool.query(
      `SELECT r.id, r.name, r.description, r.url, r.serving_size, r.adjusted_from_id,
              b.name AS base_recipe_name
       FROM recipes r
       LEFT JOIN recipes b ON b.id = r.adjusted_from_id
       WHERE lower(coalesce(r.created_by_email,'')) = $1
       ORDER BY r.id DESC`,
      [email]
    );
    res.json({ recipes: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/recipes/:id/teacher-details - Get recipe details with metadata (teachers only)
router.get('/:id/teacher-details', async (req, res) => {
  try {
    const recipeId = Number(req.params.id);
    if (!recipeId || recipeId < 1) {
      return res.status(400).json({ success: false, error: 'Invalid recipe ID' });
    }

    // Check if user is authenticated teacher/lead_teacher
    const userEmail = normalizeEmail(req.authUserEmail);
    if (!userEmail) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const hasAccess = await hasFoodTruckTeacherAccess(userEmail);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Not authorized. This page is for teachers only.' });
    }

    // Get recipe with metadata
    const result = await pool.query(
      `SELECT 
         id, name, description, ingredients, ingredients_display, 
         instructions, instructions_display, serving_size, url,
         uploaded_by_email, uploaded_by_name, 
         used_in_terms, used_in_years, used_in_year_levels,
         uploaded_at,
         submitted_channel, moderation_status
       FROM recipes
       WHERE id = $1`,
      [recipeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Recipe not found' });
    }

    const recipe = result.rows[0];
    res.json({
      success: true,
      recipe: {
        id: recipe.id,
        name: recipe.name,
        description: recipe.description,
        ingredients: recipe.ingredients_display || recipe.ingredients,
        instructions: recipe.instructions_display || recipe.instructions,
        servingSize: recipe.serving_size,
        url: recipe.url,
        // Teacher-only metadata
        uploadedBy: {
          email: recipe.uploaded_by_email,
          name: recipe.uploaded_by_name
        },
        usageHistory: {
          terms: recipe.used_in_terms ? recipe.used_in_terms.split(',').map(t => t.trim()).filter(Boolean) : [],
          years: recipe.used_in_years || [],
          yearLevels: recipe.used_in_year_levels || []
        },
        uploadedAt: recipe.uploaded_at,
        moderationStatus: recipe.moderation_status,
        submittedChannel: recipe.submitted_channel
      }
    });
  } catch (err) {
    console.error('[RECIPES] Error fetching teacher recipe details:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
