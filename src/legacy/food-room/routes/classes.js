const express = require('express');
const router = express.Router();
const pool = require('../db');

// Dropdown: Get classes, optionally filtered by teacher_code (staffCode)
router.get('/dropdown', async (req, res) => {
  const staffCode = req.query.staffCode;
  try {
    let result;
    const selectCols = `id, code AS ttcode, class_name AS name, year_level AS level, teacher_code AS teacher_in_charge, department, year AS qualification, notes AS description, extra1 AS sub_department, extra2 AS star`;
    if (staffCode) {
      result = await pool.query(
        `SELECT ${selectCols} FROM class_upload WHERE teacher_code = $1 AND COALESCE(status, 'Current') = 'Current' ORDER BY class_name`,
        [staffCode]
      );
    } else {
      result = await pool.query(`SELECT ${selectCols} FROM class_upload WHERE COALESCE(status, 'Current') = 'Current' ORDER BY class_name`);
    }
    res.json({ classes: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch classes.' });
  }
});

// Get all class_upload rows
router.get('/class_upload/all', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, code AS ttcode, class_name AS name, year_level AS level, year AS qualification, department, teacher_code AS teacher_in_charge, notes AS description, extra1 AS sub_department, extra2 AS star, COALESCE(status, \'Current\') AS status FROM class_upload ORDER BY class_name');
    res.json({ classes: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch classes.' });
  }
});

module.exports = router;
