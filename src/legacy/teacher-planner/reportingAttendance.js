const { parse } = require('csv-parse/sync');

class ReportingAttendanceError extends Error {}

function importReportingAttendance(buffer) {
  let rows;
  try {
    rows = parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer), {
      bom: true, trim: true, skip_empty_lines: true, max_record_size: 16384
    });
  } catch {
    throw new ReportingAttendanceError('Choose a valid UTF-8 KAMAR attendance CSV.');
  }
  const headers = rows.shift()?.map(value => value.trim().replace(/\s+/g, ' ').toLowerCase()) || [];
  const idColumn = headers.indexOf('student id');
  const gradeColumn = headers.indexOf('attendance - percentage (half-days)');
  if (idColumn < 0 || gradeColumn < 0 || new Set(headers).size !== headers.length || !rows.length || rows.length > 10000) {
    throw new ReportingAttendanceError('Choose the KAMAR Attendance - Percentage (Half-Days) CSV with a Student ID column.');
  }
  const entries = new Map();
  for (const row of rows) {
    const id = 'k:' + row[idColumn].trim().replace(/^k:/, '');
    const raw = row[gradeColumn].trim();
    const percentage = raw === '' ? null : Number(raw.replace(/%$/, ''));
    if (!/^k:[A-Za-z0-9_-]{1,60}$/.test(id) || (raw && (!/^\d+(?:\.\d+)?%?$/.test(raw) || percentage > 100))) {
      throw new ReportingAttendanceError('An attendance row has an invalid student ID or percentage.');
    }
    if (entries.has(id) && entries.get(id) !== percentage) {
      throw new ReportingAttendanceError('The CSV has conflicting percentages for the same student ID.');
    }
    entries.set(id, percentage);
  }
  return [...entries].map(([id, percentage]) => ({ id, percentage }));
}

module.exports = { importReportingAttendance, ReportingAttendanceError };
