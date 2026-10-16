const express = require('express');
const router = express.Router();
const pool = require('../db');

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS booking_slot_lists (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
      max_slots INTEGER NOT NULL DEFAULT 24,
      allow_pairs BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS booking_slot_assignments (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      slot_number INTEGER NOT NULL,
      seat_index INTEGER NOT NULL,
      student_id_number TEXT NOT NULL,
      student_name TEXT,
      form_class TEXT,
      year_level TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (booking_id, slot_number, seat_index)
    )
  `);

  await pool.query(
    'CREATE INDEX IF NOT EXISTS booking_slot_assignments_booking_idx ON booking_slot_assignments(booking_id, slot_number, seat_index)'
  );

  await pool.query(
    'CREATE INDEX IF NOT EXISTS booking_slot_assignments_student_idx ON booking_slot_assignments(booking_id, lower(trim(student_id_number)))'
  );

  schemaReady = true;
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

async function ensureSlotListRow(bookingId) {
  await pool.query(
    `INSERT INTO booking_slot_lists (booking_id)
     VALUES ($1)
     ON CONFLICT (booking_id) DO NOTHING`,
    [bookingId]
  );
}

router.get('/:bookingId', async (req, res) => {
  const bookingId = toInt(req.params.bookingId);
  if (!bookingId) return res.status(400).json({ success: false, error: 'Invalid bookingId.' });

  try {
    await ensureSchema();
    await ensureSlotListRow(bookingId);

    const bookingResult = await pool.query(
      `SELECT id, staff_id, staff_name, class_name, booking_date, period, recipe, recipe_id, class_size, planner_stream
       FROM bookings
       WHERE id = $1
       LIMIT 1`,
      [bookingId]
    );
    if (!bookingResult.rowCount) {
      return res.status(404).json({ success: false, error: 'Booking not found.' });
    }

    const listResult = await pool.query(
      `SELECT booking_id, max_slots, allow_pairs
       FROM booking_slot_lists
       WHERE booking_id = $1
       LIMIT 1`,
      [bookingId]
    );

    const assignResult = await pool.query(
      `SELECT slot_number, seat_index, student_id_number, student_name, form_class, year_level
       FROM booking_slot_assignments
       WHERE booking_id = $1
       ORDER BY slot_number, seat_index`,
      [bookingId]
    );

    const list = listResult.rows[0] || { booking_id: bookingId, max_slots: 24, allow_pairs: true };
    const maxSlots = Math.max(1, Math.min(60, toInt(list.max_slots, 24)));
    const allowPairs = !!list.allow_pairs;

    const slots = Array.from({ length: maxSlots }, (_, idx) => ({
      slot_number: idx + 1,
      seat_1: null,
      seat_2: null
    }));

    for (const row of assignResult.rows) {
      const slotIdx = toInt(row.slot_number) - 1;
      if (slotIdx < 0 || slotIdx >= slots.length) continue;
      const seat = toInt(row.seat_index);
      const payload = {
        student_id_number: row.student_id_number || '',
        student_name: row.student_name || '',
        form_class: row.form_class || '',
        year_level: row.year_level || ''
      };
      if (seat === 1) slots[slotIdx].seat_1 = payload;
      if (seat === 2) slots[slotIdx].seat_2 = payload;
    }

    res.json({
      success: true,
      booking: bookingResult.rows[0],
      slot_list: {
        booking_id: bookingId,
        max_slots: maxSlots,
        allow_pairs: allowPairs
      },
      slots
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to load booking slot list.' });
  }
});

router.put('/:bookingId/config', async (req, res) => {
  const bookingId = toInt(req.params.bookingId);
  if (!bookingId) return res.status(400).json({ success: false, error: 'Invalid bookingId.' });

  const maxSlots = Math.max(1, Math.min(60, toInt(req.body && req.body.max_slots, 24)));
  const allowPairs = req.body && Object.prototype.hasOwnProperty.call(req.body, 'allow_pairs')
    ? !!req.body.allow_pairs
    : true;

  try {
    await ensureSchema();
    await ensureSlotListRow(bookingId);

    await pool.query(
      `UPDATE booking_slot_lists
       SET max_slots = $1,
           allow_pairs = $2,
           updated_at = NOW()
       WHERE booking_id = $3`,
      [maxSlots, allowPairs, bookingId]
    );

    // If pair mode is disabled, remove all seat 2 assignments.
    if (!allowPairs) {
      await pool.query(
        `DELETE FROM booking_slot_assignments
         WHERE booking_id = $1
           AND seat_index = 2`,
        [bookingId]
      );
    }

    // If max slots reduced, remove assignments beyond range.
    await pool.query(
      `DELETE FROM booking_slot_assignments
       WHERE booking_id = $1
         AND slot_number > $2`,
      [bookingId, maxSlots]
    );

    res.json({ success: true, max_slots: maxSlots, allow_pairs: allowPairs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to update slot list config.' });
  }
});

router.post('/:bookingId/assign', async (req, res) => {
  const bookingId = toInt(req.params.bookingId);
  const slotNumber = toInt(req.body && req.body.slot_number);
  const seatIndex = toInt(req.body && req.body.seat_index);

  const studentIdNumber = String(req.body && req.body.student_id_number || '').trim();
  const studentName = String(req.body && req.body.student_name || '').trim();
  const formClass = String(req.body && req.body.form_class || '').trim();
  const yearLevel = String(req.body && req.body.year_level || '').trim();

  if (!bookingId) return res.status(400).json({ success: false, error: 'Invalid bookingId.' });
  if (!slotNumber) return res.status(400).json({ success: false, error: 'slot_number is required.' });
  if (!(seatIndex === 1 || seatIndex === 2)) return res.status(400).json({ success: false, error: 'seat_index must be 1 or 2.' });
  if (!studentIdNumber) return res.status(400).json({ success: false, error: 'student_id_number is required.' });

  try {
    await ensureSchema();
    await ensureSlotListRow(bookingId);

    const listResult = await pool.query(
      `SELECT max_slots, allow_pairs
       FROM booking_slot_lists
       WHERE booking_id = $1
       LIMIT 1`,
      [bookingId]
    );
    const list = listResult.rows[0];
    const maxSlots = Math.max(1, Math.min(60, toInt(list && list.max_slots, 24)));
    const allowPairs = !!(list && list.allow_pairs);

    if (slotNumber < 1 || slotNumber > maxSlots) {
      return res.status(400).json({ success: false, error: `slot_number must be between 1 and ${maxSlots}.` });
    }
    if (!allowPairs && seatIndex === 2) {
      return res.status(400).json({ success: false, error: 'Pair slots are disabled for this list.' });
    }

    // Move semantics: a student can only exist once in a booking slot list.
    await pool.query(
      `DELETE FROM booking_slot_assignments
       WHERE booking_id = $1
         AND lower(trim(student_id_number)) = lower(trim($2))`,
      [bookingId, studentIdNumber]
    );

    await pool.query(
      `INSERT INTO booking_slot_assignments
       (booking_id, slot_number, seat_index, student_id_number, student_name, form_class, year_level, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (booking_id, slot_number, seat_index)
       DO UPDATE SET
         student_id_number = EXCLUDED.student_id_number,
         student_name = EXCLUDED.student_name,
         form_class = EXCLUDED.form_class,
         year_level = EXCLUDED.year_level,
         updated_at = NOW()`,
      [bookingId, slotNumber, seatIndex, studentIdNumber, studentName || null, formClass || null, yearLevel || null]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to assign student to slot.' });
  }
});

router.delete('/:bookingId/assign/:slotNumber/:seatIndex', async (req, res) => {
  const bookingId = toInt(req.params.bookingId);
  const slotNumber = toInt(req.params.slotNumber);
  const seatIndex = toInt(req.params.seatIndex);

  if (!bookingId || !slotNumber || !(seatIndex === 1 || seatIndex === 2)) {
    return res.status(400).json({ success: false, error: 'Invalid bookingId/slotNumber/seatIndex.' });
  }

  try {
    await ensureSchema();
    await pool.query(
      `DELETE FROM booking_slot_assignments
       WHERE booking_id = $1
         AND slot_number = $2
         AND seat_index = $3`,
      [bookingId, slotNumber, seatIndex]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to clear slot assignment.' });
  }
});

module.exports = router;
