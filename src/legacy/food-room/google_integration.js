const { google } = require('googleapis');
const cron = require('node-cron');
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const pool = require('./db');
const { parseDocxCalendar } = require('./routes/recipe_calendar_pdf');

// Load client secrets from a local file
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

let oAuth2Client;
let configuredRedirectUri = '';
let plannerSyncTask = null;

async function ensureGoogleOAuthTokenSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS google_oauth_tokens (
            id SMALLINT PRIMARY KEY,
            token_json TEXT NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
}

async function loadStoredTokenFromDatabase() {
    await ensureGoogleOAuthTokenSchema();
    const result = await pool.query('SELECT token_json FROM google_oauth_tokens WHERE id = 1 LIMIT 1');
    if (!result.rowCount) {
        return null;
    }
    const raw = String(result.rows[0].token_json || '').trim();
    if (!raw) {
        return null;
    }
    return JSON.parse(raw);
}

async function persistTokenToDatabase(token) {
    if (!token || typeof token !== 'object') {
        return;
    }
    await ensureGoogleOAuthTokenSchema();
    await pool.query(
        `INSERT INTO google_oauth_tokens (id, token_json, updated_at)
         VALUES (1, $1, NOW())
         ON CONFLICT (id)
         DO UPDATE SET token_json = EXCLUDED.token_json, updated_at = NOW()`,
        [JSON.stringify(token)]
    );
}

async function loadStoredTokenAny() {
    const envToken = String(process.env.GOOGLE_TOKEN_JSON || '').trim();
    if (envToken) {
        return JSON.parse(envToken);
    }
    if (fs.existsSync(TOKEN_PATH)) {
        return readJsonFile(TOKEN_PATH);
    }
    try {
        return await loadStoredTokenFromDatabase();
    } catch (err) {
        console.warn('[Google OAuth] Failed to load token from database:', err.message);
        return null;
    }
}

function hasOAuthCredentials() {
    const creds = oAuth2Client && oAuth2Client.credentials ? oAuth2Client.credentials : null;
    return Boolean(creds && (creds.refresh_token || creds.access_token));
}

async function ensureOAuthCredentialsLoaded() {
    if (!oAuth2Client) {
        throw new Error('Google client is not initialized.');
    }
    if (hasOAuthCredentials()) {
        return;
    }
    const token = await loadStoredTokenAny();
    if (token) {
        oAuth2Client.setCredentials(token);
    }
}

function readJsonFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadGoogleCredentials() {
    const raw = String(process.env.GOOGLE_CREDENTIALS || '').trim();
    if (raw) {
        return JSON.parse(raw);
    }
    return readJsonFile(CREDENTIALS_PATH);
}

function loadStoredToken() {
    const envToken = String(process.env.GOOGLE_TOKEN_JSON || '').trim();
    if (envToken) {
        return JSON.parse(envToken);
    }
    if (fs.existsSync(TOKEN_PATH)) {
        return readJsonFile(TOKEN_PATH);
    }
    return null;
}

function getRedirectUriFromEnvOrRuntime(configRedirectUris = []) {
    const explicit = String(process.env.GOOGLE_OAUTH_REDIRECT_URI || '').trim();
    if (explicit) {
        return explicit;
    }

    const renderBase = String(process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, '');
    if (renderBase) {
        return `${renderBase}/google/oauth2callback`;
    }

    return Array.isArray(configRedirectUris) ? String(configRedirectUris[0] || '').trim() : '';
}

async function ensureGooglePlannerSyncSchema() {
    await pool.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS source_document_id TEXT");
    await pool.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS source_document_title TEXT");
    await pool.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS source_document_revision_id TEXT");
    await pool.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS source_document_synced_at TIMESTAMPTZ");
    await pool.query(`
        CREATE TABLE IF NOT EXISTS google_planner_sync_history (
            id BIGSERIAL PRIMARY KEY,
            ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            trigger_source TEXT NOT NULL DEFAULT 'manual',
            document_id TEXT,
            document_title TEXT,
            parsed_rows INTEGER NOT NULL DEFAULT 0,
            inserted_rows INTEGER NOT NULL DEFAULT 0,
            skipped BOOLEAN NOT NULL DEFAULT FALSE,
            success BOOLEAN NOT NULL DEFAULT TRUE,
            error_message TEXT
        )
    `);
}

async function recordPlannerSyncHistory(result, triggerSource) {
    await ensureGooglePlannerSyncSchema();

    const success = !(result && result.error);
    await pool.query(
        `INSERT INTO google_planner_sync_history (
            trigger_source,
            document_id,
            document_title,
            parsed_rows,
            inserted_rows,
            skipped,
            success,
            error_message
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
            String(triggerSource || 'manual').trim() || 'manual',
            result && result.documentId ? String(result.documentId) : null,
            result && result.title ? String(result.title) : null,
            Number(result && result.parsedRows ? result.parsedRows : 0),
            Number(result && result.inserted ? result.inserted : 0),
            Boolean(result && result.skipped),
            success,
            success ? null : String(result && result.error ? result.error : 'Unknown sync error')
        ]
    );
}

async function getPlannerSyncHistory(limit = 50) {
    await ensureGooglePlannerSyncSchema();
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const result = await pool.query(
        `SELECT id, ran_at, trigger_source, document_id, document_title,
                parsed_rows, inserted_rows, skipped, success, error_message
           FROM google_planner_sync_history
          ORDER BY ran_at DESC, id DESC
          LIMIT $1`,
        [safeLimit]
    );
    return result.rows;
}

function getConfiguredPlannerDocIds() {
    const bundledDocIds = [
        // 12HOSP planner supplied by school admin.
        '1SPo6NsfrHd3qH01DH8GEvNKrmUtnFlwyAXWzSlL3ybg'
    ];

    const raw = String(process.env.GOOGLE_PLANNER_DOC_IDS || '').trim();
    const envDocIds = raw
        .split(',')
        .map((entry) => String(entry || '').trim())
        .filter(Boolean);

    return Array.from(new Set([...envDocIds, ...bundledDocIds]));
}

function inferPlannerStreamFromDocTitle(title) {
    const text = String(title || '').trim().toLowerCase();
    if (!text) return 'Middle';
    if (text.includes('junior')) return 'Junior';
    if (/\bhp\s*100\b|\bhp100\b|\b100\s*hosp\b|\bhosp\s*100\b/.test(text)) return 'Senior';
    if (/\bhp\s*200\b|\bhp200\b|\b200\s*hosp\b|\bhosp\s*200\b/.test(text)) return 'Senior';
    if (/\bhp\s*300\b|\bhp300\b|\b300\s*hosp\b|\bhosp\s*300\b/.test(text)) return 'Senior';
    if (text.includes('senior') || text.includes('hosp')) return 'Senior';
    if (text.includes('middle')) return 'Middle';
    return 'Middle';
}

function defaultClassNameForStream(stream, title) {
    const text = String(title || '').trim().toLowerCase();
    if (/\bhp\s*100\b|\bhp100\b|\b100\s*hosp\b|\bhosp\s*100\b/.test(text)) return '11HOSP';
    if (/\bhp\s*200\b|\bhp200\b|\b200\s*hosp\b|\bhosp\s*200\b/.test(text)) return '12HOSP';
    if (/\bhp\s*300\b|\bhp300\b|\b300\s*hosp\b|\bhosp\s*300\b/.test(text)) return '13HOSP';

    const normalized = String(stream || '').trim().toLowerCase();
    if (normalized === 'junior') return 'JFOOD';
    if (normalized === 'senior') return '11HOSP';
    return 'MFOOD';
}

function mapDocxWeeksToPlannerRows(docxParsed, document, documentId) {
    const weeks = Array.isArray(docxParsed && docxParsed.weeks) ? docxParsed.weeks : [];
    const title = String(document && document.title ? document.title : '').trim();
    const plannerStream = inferPlannerStreamFromDocTitle(title);
    const className = defaultClassNameForStream(plannerStream, title);

    return weeks
        .map((week) => {
            const bookingDate = parseGooglePlannerDate(week && week.startDate ? week.startDate : '');
            const recipe = String(week && week.recipe ? week.recipe : '').trim();
            const recipeUrl = String(week && week.url ? week.url : '').trim();
            if (!bookingDate || !recipe) {
                return null;
            }

            return {
                staff_id: null,
                staff_name: null,
                class_name: className,
                booking_date: bookingDate,
                period: 'Planner',
                recipe,
                recipe_url: recipeUrl,
                recipe_id: null,
                class_size: null,
                planner_stream: plannerStream,
                source_document_id: documentId,
                source_document_title: title,
                source_document_revision_id: String(document && document.revisionId ? document.revisionId : '').trim()
            };
        })
        .filter(Boolean);
}

function normalizeHeaderKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

function extractTextFromStructuralElement(element) {
    if (!element) {
        return '';
    }
    if (element.paragraph && Array.isArray(element.paragraph.elements)) {
        return element.paragraph.elements
            .map((part) => String(part && part.textRun && part.textRun.content ? part.textRun.content : ''))
            .join('')
            .replace(/\s+/g, ' ')
            .trim();
    }
    if (element.table) {
        return element.table.tableRows
            .map((row) => row.tableCells.map((cell) => extractTextFromStructuralElement(cell)).join(' | '))
            .join('\n');
    }
    if (element.tableCell && Array.isArray(element.tableCell.content)) {
        return element.tableCell.content
            .map((child) => extractTextFromStructuralElement(child))
            .filter(Boolean)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    if (element.tableRow && Array.isArray(element.tableRow.tableCells)) {
        return element.tableRow.tableCells
            .map((cell) => extractTextFromStructuralElement(cell))
            .join(' | ');
    }
    if (Array.isArray(element.content)) {
        return element.content
            .map((child) => extractTextFromStructuralElement(child))
            .filter(Boolean)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    return '';
}

function parseGooglePlannerDate(value) {
    const text = String(value || '').trim();
    if (!text) {
        return '';
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return text;
    }

    const slashMatch = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (slashMatch) {
        const day = String(slashMatch[1]).padStart(2, '0');
        const month = String(slashMatch[2]).padStart(2, '0');
        let year = String(slashMatch[3]);
        if (year.length === 2) {
            year = Number(year) < 70 ? `20${year}` : `19${year}`;
        }
        return `${year}-${month}-${day}`;
    }

    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
        const year = parsed.getFullYear();
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        const day = String(parsed.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return '';
}

function inferPlannerStreamFromText(value) {
    const text = String(value || '').trim().toUpperCase();
    if (!text) {
        return 'Middle';
    }
    if (text.includes('HP100') || text.includes('HP200') || text.includes('HP300')) {
        return 'Senior';
    }
    if (text.includes('HOSP')) {
        return 'Senior';
    }
    if (text.includes('JFOOD') || text.includes('VEFOOD') || text.includes('MMFOOD') || text.includes('SDFOOD') || text.includes('PIFOOD') || text.includes('SRFOOD') || text.includes('MFOOD')) {
        return text.includes('MFOOD') ? 'Middle' : 'Junior';
    }
    return 'Middle';
}

function parseNumericValue(value) {
    const text = String(value || '').trim();
    if (!text) {
        return null;
    }
    const parsed = Number(text.replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
}

function parsePlannerRowsFromDocument(document, documentId) {
    const rows = [];
    const content = document && document.body && Array.isArray(document.body.content)
        ? document.body.content
        : [];

    const tables = content.filter((part) => part && part.table);
    for (const tableBlock of tables) {
        const table = tableBlock.table;
        const tableRows = Array.isArray(table && table.tableRows) ? table.tableRows : [];
        if (!tableRows.length) {
            continue;
        }

        const rowValues = tableRows.map((tableRow) => {
            const cells = Array.isArray(tableRow.tableCells) ? tableRow.tableCells : [];
            return cells.map((cell) => extractTextFromStructuralElement(cell)).map((text) => String(text || '').trim());
        });

        const headers = rowValues[0] || [];
        const headerIndex = new Map();
        headers.forEach((header, index) => {
            const key = normalizeHeaderKey(header);
            if (key && !headerIndex.has(key)) {
                headerIndex.set(key, index);
            }
        });

        const getValue = (row, keys) => {
            for (const key of keys) {
                const idx = headerIndex.get(key);
                if (idx != null && row[idx] != null && String(row[idx]).trim()) {
                    return String(row[idx]).trim();
                }
            }
            return '';
        };

        for (const row of rowValues.slice(1)) {
            const bookingDate = parseGooglePlannerDate(getValue(row, ['bookingdate', 'date', 'day', 'weekdate']));
            const className = getValue(row, ['classname', 'class', 'classcode', 'code', 'subject']);
            const recipe = getValue(row, ['recipe', 'meal', 'dish', 'activity']);
            const recipeUrl = getValue(row, ['recipeurl', 'url', 'link']);
            const recipeId = parseNumericValue(getValue(row, ['recipeid', 'id']));
            const classSize = parseNumericValue(getValue(row, ['classsize', 'size', 'roll', 'students']));
            const plannerStream = getValue(row, ['plannerstream', 'stream']) || inferPlannerStreamFromText(className);
            const period = getValue(row, ['period']) || 'Planner';
            const staffId = getValue(row, ['staffid', 'teacherid', 'staffcode']);
            const staffName = getValue(row, ['staffname', 'teacher', 'teachername']);

            if (!bookingDate || !className || !recipe) {
                continue;
            }

            rows.push({
                staff_id: staffId,
                staff_name: staffName,
                class_name: className,
                booking_date: bookingDate,
                period,
                recipe,
                recipe_url: recipeUrl,
                recipe_id: recipeId,
                class_size: classSize,
                planner_stream: plannerStream,
                source_document_id: documentId,
                source_document_title: String(document && document.title ? document.title : '').trim(),
                source_document_revision_id: String(document && document.revisionId ? document.revisionId : '').trim()
            });
        }
    }

    return rows;
}

async function syncPlannerDocument(documentId) {
    if (!oAuth2Client) {
        throw new Error('Google client is not initialized.');
    }

    await ensureOAuthCredentialsLoaded();

    const docs = google.docs({ version: 'v1', auth: oAuth2Client });
    const drive = google.drive({ version: 'v3', auth: oAuth2Client });
    const response = await docs.documents.get({ documentId });
    const document = response && response.data ? response.data : response;
    let parsedRows = parsePlannerRowsFromDocument(document, documentId);

    if (!parsedRows.length) {
        try {
            const exportResponse = await drive.files.export(
                {
                    fileId: documentId,
                    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                },
                { responseType: 'arraybuffer' }
            );
            const docxBuffer = Buffer.from(exportResponse.data);
            const docxParsed = await parseDocxCalendar(docxBuffer);
            parsedRows = mapDocxWeeksToPlannerRows(docxParsed, document, documentId);
        } catch (fallbackErr) {
            console.warn('[Google Planner Sync] DOCX fallback parse failed:', fallbackErr.message);
        }
    }

    if (!parsedRows.length) {
        return {
            documentId,
            title: String(document && document.title ? document.title : '').trim(),
            parsedRows: 0,
            inserted: 0,
            skipped: true,
            reason: 'No planner rows were parsed from the document.'
        };
    }

    await ensureGooglePlannerSyncSchema();

    // Load existing planner bookings to preserve manual recipe links
    const existing = await pool.query(
        `SELECT id, booking_date, planner_stream, class_name, recipe_id, recipe_url FROM bookings 
         WHERE period = 'Planner' AND coalesce(source_document_id, '') = $1`,
        [documentId]
    );
    const existingByKey = new Map();
    for (const row of existing.rows) {
        const key = `${row.booking_date}|${row.planner_stream || 'Middle'}|${row.class_name}`.toLowerCase();
        existingByKey.set(key, row);
    }

    let inserted = 0;
    const seenKeys = new Set();
    for (const row of parsedRows) {
        const dedupeKey = `${row.booking_date}|${row.planner_stream}|${row.class_name}`.toLowerCase();
        if (seenKeys.has(dedupeKey)) {
            continue;
        }
        seenKeys.add(dedupeKey);

        const existingRow = existingByKey.get(dedupeKey);

        if (existingRow) {
            // Update existing row, preserving manual recipe link if present
            await pool.query(
                `UPDATE bookings SET
                    staff_id = $1,
                    staff_name = $2,
                    class_size = $3,
                    recipe = CASE WHEN recipe_id IS NOT NULL THEN recipe ELSE $4 END,
                    recipe_url = CASE WHEN recipe_id IS NOT NULL THEN recipe_url ELSE $5 END,
                    recipe_id = CASE WHEN recipe_id IS NOT NULL THEN recipe_id ELSE $6 END,
                    source_document_id = $7,
                    source_document_title = $8,
                    source_document_revision_id = $9,
                    source_document_synced_at = NOW()
                 WHERE id = $10`,
                [
                    row.staff_id || null,
                    row.staff_name || null,
                    row.class_size || null,
                    row.recipe,
                    row.recipe_url || '',
                    row.recipe_id || null,
                    documentId,
                    document && document.title ? String(document.title) : null,
                    row.source_document_revision_id || null,
                    existingRow.id
                ]
            );
        } else {
            // Insert new row
            await pool.query(
                `INSERT INTO bookings (
                    staff_id, staff_name, class_name, booking_date, period,
                    recipe, recipe_url, recipe_id, class_size, planner_stream,
                    source_document_id, source_document_title, source_document_revision_id, source_document_synced_at
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())`,
                [
                    row.staff_id || null,
                    row.staff_name || null,
                    row.class_name,
                    row.booking_date,
                    row.period || 'Planner',
                    row.recipe,
                    row.recipe_url || '',
                    row.recipe_id || null,
                    row.class_size || null,
                    row.planner_stream || 'Middle',
                    documentId,
                    document && document.title ? String(document.title) : null,
                    row.source_document_revision_id || null
                ]
            );
            inserted += 1;
        }
    }

    // Delete any planner rows from this document that weren't in the new sync (cleanup stale entries)
    const syncedKeys = new Set();
    for (const row of parsedRows) {
        const key = `${row.booking_date}|${row.planner_stream || 'Middle'}|${row.class_name}`.toLowerCase();
        syncedKeys.add(key);
    }
    for (const [key, row] of existingByKey) {
        if (!syncedKeys.has(key)) {
            await pool.query('DELETE FROM bookings WHERE id = $1', [row.id]);
        }
    }

    return {
        documentId,
        title: String(document && document.title ? document.title : '').trim(),
        parsedRows: parsedRows.length,
        inserted
    };
}

async function dedupePlannerBookingsKeepLatest() {
    // Keep only the newest planner row for each class/date/stream/period slot.
    const result = await pool.query(`
        WITH ranked AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY
                        booking_date,
                        lower(trim(coalesce(class_name, ''))),
                        lower(trim(coalesce(planner_stream, 'middle'))),
                        lower(trim(coalesce(period, 'planner')))
                    ORDER BY
                        coalesce(source_document_synced_at, to_timestamp(0)) DESC,
                        id DESC
                ) AS row_rank
            FROM bookings
            WHERE period = 'Planner'
        )
        DELETE FROM bookings b
        USING ranked r
        WHERE b.id = r.id
          AND r.row_rank > 1
        RETURNING b.id
    `);

    return Number(result.rowCount || 0);
}

async function syncConfiguredPlannerDocs(triggerSource = 'manual') {
    const documentIds = getConfiguredPlannerDocIds();
    if (!documentIds.length) {
        return { success: true, synced: [], skipped: true, reason: 'No planner document IDs configured.' };
    }

    const synced = [];
    for (const documentId of documentIds) {
        try {
            const result = await syncPlannerDocument(documentId);
            synced.push(result);
            await recordPlannerSyncHistory(result, triggerSource);
        } catch (error) {
            const failedResult = {
                documentId,
                title: '',
                parsedRows: 0,
                inserted: 0,
                skipped: false,
                error: error && error.message ? error.message : 'Unknown sync error'
            };
            synced.push(failedResult);
            await recordPlannerSyncHistory(failedResult, triggerSource);
        }
    }

    let deduped = 0;
    try {
        deduped = await dedupePlannerBookingsKeepLatest();
        if (deduped > 0) {
            console.log(`[Google Planner Sync] Removed ${deduped} duplicate planner booking row(s).`);
        }
    } catch (dedupeErr) {
        console.warn('[Google Planner Sync] Planner dedupe failed:', dedupeErr.message);
    }

    const hasErrors = synced.some((entry) => Boolean(entry && entry.error));
    return { success: !hasErrors, synced, skipped: false, deduped };
}

function startPlannerSyncScheduler() {
    if (plannerSyncTask) {
        return;
    }

    const cronExpression = String(process.env.GOOGLE_PLANNER_SYNC_CRON || '*/15 * * * *').trim();
    const documentIds = getConfiguredPlannerDocIds();
    if (!documentIds.length || !cron.validate(cronExpression)) {
        return;
    }

    plannerSyncTask = cron.schedule(cronExpression, () => {
        syncConfiguredPlannerDocs('scheduled').catch((err) => {
            console.error('[Google Planner Sync] Scheduled sync failed:', err.message);
        });
    }, {
        timezone: String(process.env.GOOGLE_PLANNER_SYNC_TIMEZONE || 'Pacific/Auckland').trim()
    });

    console.log(`[Google Planner Sync] Scheduled sync started (${cronExpression}) for ${documentIds.length} document(s).`);
}

function getPlannerSyncConfigSummary() {
    const cronExpression = String(process.env.GOOGLE_PLANNER_SYNC_CRON || '*/15 * * * *').trim();
    const timezone = String(process.env.GOOGLE_PLANNER_SYNC_TIMEZONE || 'Pacific/Auckland').trim();
    const docIds = getConfiguredPlannerDocIds();
    const requiresToken = Boolean(String(process.env.GOOGLE_PLANNER_SYNC_TOKEN || '').trim());

    return {
        configuredDocs: docIds.length,
        configuredDocIds: docIds,
        cronExpression,
        timezone,
        schedulerActive: Boolean(plannerSyncTask),
        requiresToken
    };
}

// Initialize Google OAuth2 client
async function initializeGoogleClient() {
    const credentials = loadGoogleCredentials();
    const config = credentials.installed || credentials.web;

    if (!config) {
        throw new Error('Google credentials must contain an "installed" or "web" object.');
    }

    const { client_secret, client_id, redirect_uris = [] } = config;
    const redirectUri = getRedirectUriFromEnvOrRuntime(redirect_uris);

    if (!client_id || !client_secret || !redirectUri) {
        throw new Error('Missing Google OAuth values: client_id, client_secret, or redirect URI.');
    }

    console.log('[Google OAuth] Using redirect URI:', redirectUri);

    configuredRedirectUri = redirectUri;
    oAuth2Client = new google.auth.OAuth2(client_id, client_secret, configuredRedirectUri);

    // Check if we have previously stored a token
    const token = await loadStoredTokenAny();
    if (token) {
        oAuth2Client.setCredentials(token);
    } else {
        console.log('No token found. Please authenticate with Google.');
    }

    startPlannerSyncScheduler();
}

// Generate authentication URL
router.get('/auth', async (req, res) => {
    if (!oAuth2Client) {
        return res.status(500).json({ error: 'Google client is not initialized.' });
    }

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        redirect_uri: configuredRedirectUri,
        scope: [
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/documents'
        ]
    });
    res.redirect(authUrl);
});

// Handle OAuth2 callback
router.get('/oauth2callback', async (req, res) => {
    try {
        if (!oAuth2Client) {
            return res.status(500).json({ error: 'Google client is not initialized.' });
        }

        const code = String(req.query.code || '').trim();
        if (!code) {
            return res.status(400).json({ error: 'Missing OAuth code.' });
        }

        const { tokens } = await oAuth2Client.getToken(code);
        const existingToken = await loadStoredTokenAny();
        const mergedTokens = {
            ...(existingToken || {}),
            ...(tokens || {})
        };
        oAuth2Client.setCredentials(mergedTokens);

        // Store the token to disk for later program executions.
        // Render instances can be ephemeral, so GOOGLE_TOKEN_JSON can be used instead.
        try {
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(mergedTokens, null, 2));
        } catch (err) {
            console.warn('Unable to persist token to disk:', err.message);
        }

        try {
            await persistTokenToDatabase(mergedTokens);
        } catch (err) {
            console.warn('Unable to persist token to database:', err.message);
        }

        res.send('Authentication successful! You can close this tab.');
    } catch (err) {
        console.error('OAuth callback failed:', err.message);
        res.status(500).json({ error: 'Google OAuth callback failed.' });
    }
});

function isPlannerSyncAuthorized(req) {
    const expectedToken = String(process.env.GOOGLE_PLANNER_SYNC_TOKEN || '').trim();
    if (!expectedToken) {
        return true;
    }

    const providedToken = String(req.get('x-planner-sync-token') || req.query.token || '').trim();
    return providedToken === expectedToken;
}

router.post('/webhook', async (req, res) => {
    try {
        if (!isPlannerSyncAuthorized(req)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const resourceId = String(req.body && req.body.resourceId ? req.body.resourceId : '').trim();
        if (resourceId) {
            const documentIds = getConfiguredPlannerDocIds();
            if (documentIds.includes(resourceId)) {
                const result = await syncPlannerDocument(resourceId);
                await recordPlannerSyncHistory(result, 'webhook');
                return res.status(200).json({ success: true, result });
            }
        }

        const result = await syncConfiguredPlannerDocs('webhook');
        res.status(200).json(result);
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/sync-planners', async (req, res) => {
    try {
        if (!isPlannerSyncAuthorized(req)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const result = await syncConfiguredPlannerDocs('manual-ui');
        res.status(200).json(result);
    } catch (error) {
        console.error('Planner sync error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/dedupe-planners', async (req, res) => {
    try {
        if (!isPlannerSyncAuthorized(req)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const deduped = await dedupePlannerBookingsKeepLatest();
        res.status(200).json({ success: true, deduped });
    } catch (error) {
        console.error('Planner dedupe error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/sync-config', async (req, res) => {
    try {
        const summary = getPlannerSyncConfigSummary();
        res.status(200).json({ success: true, ...summary });
    } catch (error) {
        console.error('Planner sync config error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/sync-history', async (req, res) => {
    try {
        const limit = Number(req.query && req.query.limit ? req.query.limit : 50);
        const history = await getPlannerSyncHistory(limit);
        res.status(200).json({ success: true, history });
    } catch (error) {
        console.error('Planner sync history error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = { initializeGoogleClient, router, syncConfiguredPlannerDocs, syncPlannerDocument };