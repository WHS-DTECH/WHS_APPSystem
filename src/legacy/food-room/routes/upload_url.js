const express = require('express');
const router = express.Router();
const pool = require('../db');

async function insertUploadRecord(recipeTitle, uploadType, sourceUrl, uploadedBy, uploadDate) {
  const insertQuery = `
    INSERT INTO uploads (recipe_title, upload_type, source_url, uploaded_by, upload_date)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, recipe_title, upload_type, source_url, uploaded_by, upload_date;
  `;
  return pool.query(insertQuery, [recipeTitle, uploadType, sourceUrl, uploadedBy, uploadDate]);
}

async function repairUploadsIdSequence() {
  await pool.query(`
    SELECT setval(
      pg_get_serial_sequence('uploads', 'id'),
      COALESCE((SELECT MAX(id) FROM uploads), 0)
    )
  `);
}

// POST /api/recipes/upload-url
// Receives { url } and inserts into uploads table
router.post('/upload-url', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ success: false, error: 'Missing or invalid URL.' });
    }
    // Insert into uploads table
    const uploadType = 'url';
    const uploadedBy = 'user@example.com';
    const uploadDate = new Date();
    // Recipe title is the URL
    const recipeTitle = url;
    const sourceUrl = url;
    try {
      const result = await insertUploadRecord(recipeTitle, uploadType, sourceUrl, uploadedBy, uploadDate);
      const upload = result.rows[0];
      return res.json({ success: true, upload });
    } catch (insertErr) {
      const isUploadsPkConflict = insertErr && insertErr.code === '23505' && insertErr.constraint === 'uploads_pkey';
      if (!isUploadsPkConflict) throw insertErr;

      // Sequence drift can happen after manual imports with explicit IDs.
      await repairUploadsIdSequence();

      const retryResult = await insertUploadRecord(recipeTitle, uploadType, sourceUrl, uploadedBy, uploadDate);
      const upload = retryResult.rows[0];
      return res.json({ success: true, upload, sequenceRepaired: true });
    }
  } catch (err) {
    console.error('Error uploading recipe URL:', err);
    res.status(500).json({ success: false, error: 'Server error.' });
  }
});

module.exports = router;
