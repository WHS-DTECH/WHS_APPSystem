const express = require('express');
const router = express.Router();
const pool = require('../../db');
const fs = require('fs');
const path = require('path');

async function insertUploadRecord(recipeTitle, uploadType, sourceUrl, uploadedBy, uploadDate, rawData) {
  return pool.query(
    'INSERT INTO uploads (recipe_title, upload_type, source_url, uploaded_by, upload_date, raw_data) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [recipeTitle, uploadType, sourceUrl, uploadedBy, uploadDate, rawData]
  );
}

async function repairUploadsIdSequence() {
  await pool.query(`
    SELECT setval(
      pg_get_serial_sequence('uploads', 'id'),
      COALESCE((SELECT MAX(id) FROM uploads), 0)
    )
  `);
}

function sanitizePdfFileName(name) {
  const base = String(name || 'uploaded').replace(/\.pdf$/i, '').trim();
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return `${cleaned || 'uploaded'}.pdf`;
}

function parsePdfDataUrl(dataUrl) {
  const raw = String(dataUrl || '');
  const match = /^data:application\/pdf(?:;charset=[^;,]+)?;base64,(.+)$/i.exec(raw);
  if (!match) return null;
  return Buffer.from(match[1], 'base64');
}

// POST /api/uploads
router.post('/', async (req, res) => {
  const { recipe_title, upload_type, source_url, uploaded_by, upload_date, raw_data } = req.body;
  try {
    try {
      const result = await insertUploadRecord(recipe_title, upload_type, source_url, uploaded_by, upload_date, raw_data);
      return res.json({ success: true, upload_id: result.rows[0].id });
    } catch (insertErr) {
      const isUploadsPkConflict = insertErr && insertErr.code === '23505' && insertErr.constraint === 'uploads_pkey';
      if (!isUploadsPkConflict) throw insertErr;

      await repairUploadsIdSequence();

      const retryResult = await insertUploadRecord(recipe_title, upload_type, source_url, uploaded_by, upload_date, raw_data);
      return res.json({ success: true, upload_id: retryResult.rows[0].id, sequenceRepaired: true });
    }
  } catch (err) {
    console.error('[DEBUG /api/uploads] Failed to insert upload:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/uploads/pdf
router.post('/pdf', async (req, res) => {
  const { file_name, file_data, uploaded_by } = req.body || {};
  const pdfBuffer = parsePdfDataUrl(file_data);
  if (!pdfBuffer) {
    return res.status(400).json({ success: false, error: 'Invalid PDF payload. Expected data URL (base64).' });
  }

  const savedPdfDir = path.join(require('../../paths').publicDir, 'SavedPDFs');
  if (!fs.existsSync(savedPdfDir)) {
    fs.mkdirSync(savedPdfDir, { recursive: true });
  }

  const safeName = sanitizePdfFileName(file_name);
  const parsed = path.parse(safeName);
  const stampedName = `${parsed.name}_${Date.now()}${parsed.ext}`;
  const filePath = path.join(savedPdfDir, stampedName);

  try {
    await fs.promises.writeFile(filePath, pdfBuffer);
    const sourceUrl = `/SavedPDFs/${encodeURIComponent(stampedName)}`;

    let result;
    try {
      result = await insertUploadRecord(
        parsed.name,
        'pdf',
        sourceUrl,
        uploaded_by || 'user@example.com',
        new Date().toISOString(),
        ''
      );
    } catch (insertErr) {
      const isUploadsPkConflict = insertErr && insertErr.code === '23505' && insertErr.constraint === 'uploads_pkey';
      if (!isUploadsPkConflict) throw insertErr;
      await repairUploadsIdSequence();
      result = await insertUploadRecord(
        parsed.name,
        'pdf',
        sourceUrl,
        uploaded_by || 'user@example.com',
        new Date().toISOString(),
        ''
      );
    }

    return res.json({
      success: true,
      upload_id: result.rows[0].id,
      source_url: sourceUrl,
      file_name: stampedName
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/uploads
// Excludes raw_data (full HTML blobs) — fetch individual record to get raw_data
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, recipe_title, upload_type, source_url, uploaded_by, upload_date FROM uploads ORDER BY id DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/uploads/:id/raw
router.put('/:id/raw', async (req, res) => {
  const { id } = req.params;
  const { recipe_id, raw_data } = req.body;
  const rawDataDir = path.join(require('../../paths').publicDir, 'RawDataTXT');
  if (!fs.existsSync(rawDataDir)) {
    fs.mkdirSync(rawDataDir, { recursive: true });
  }
  const filePath = path.join(rawDataDir, `${id}.txt`);
  try {
    await pool.query('UPDATE uploads SET raw_data = $1 WHERE id = $2', [raw_data, id]);
    fs.writeFile(filePath, raw_data, (fileErr) => {
      if (fileErr) {
        return res.status(500).json({ success: false, error: 'Failed to write raw data file', details: fileErr.message });
      }
      res.json({ success: true });
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to update uploads table', details: err.message });
  }
});

// DELETE /api/uploads/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM uploads WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Upload record not found.' });
    }
    res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to delete upload record.' });
  }
});

// GET /api/uploads/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM uploads WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Upload not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
