const fs = require('node:fs/promises');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { validate, saveDataset } = require('./history');

const prefixes = {
  ReportingStaffList: 'staff', StudentList: 'student_details', TimeTableSummaryStudents: 'student_timetable',
  TimeTableSummaryTeacher: 'teacher_timetable', SetupSubjects: 'subjects', ReportingSubjectLists: 'subjects'
};
const normal = value => String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
async function readArchiveFile(file, year, term) {
  const name = path.basename(file);
  const match = /^([A-Za-z]+)_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.csv$/i.exec(name);
  if (!match || !prefixes[match[1]]) return null;
  const stat = await fs.stat(file);
  if (stat.size > 25 * 1024 * 1024) throw new Error('CSV exceeds the 25 MB archive limit: ' + name);
  const rawCsv = await fs.readFile(file, 'utf8');
  const parsed = parse(rawCsv, { bom: true, skip_empty_lines: true });
  let headers = parsed.shift();
  const warnings = [];
  if (prefixes[match[1]] === 'staff' && normal(headers?.[0]) !== 'code') {
    if (headers?.length !== 5 || [headers, ...parsed].some(row =>
      row.length !== 5 || row[4].trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row[4].trim()))) {
      throw new Error('Unrecognised headerless staff format: ' + name);
    }
    parsed.unshift(headers);
    headers = ['Code', 'Last Name', 'First Name', 'Title', 'Email (School)'];
    warnings.push('Headerless five-column staff export: all rows retained; standard positional headers assigned.');
  }
  const type = prefixes[match[1]];
  const required = { staff: ['code'], student_details: ['studentid'],
    student_timetable: ['studentname', 'idnumber', 'yearlevel', 'monp1'], teacher_timetable: ['teacher'] };
  if (required[type]?.some(key => !headers?.some(header => normal(header) === key))) {
    throw new Error('Required columns are missing from ' + name);
  }
  if (type === 'staff' && !headers.some(header => normal(header) === 'emailschool')) {
    warnings.push('No school-email header: retained as a distinct export, not merged into other staff snapshots.');
  }
  const dataset = { type, year, term, date: `${match[2]}-${match[3]}-${match[4]}`,
    time: `${match[5]}:${match[6]}:${match[7]}`, name, origin: 'archive', rawCsv,
    payload: { headers, rows: parsed } };
  validate(dataset);
  return { dataset, warnings };
}
async function planArchive(root, year, fixedTerm) {
  const datasets = [], excluded = [];
  async function visit(directory, term) {
    const entries = (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw new Error('Archive links are not followed: ' + entry.name);
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const label = /^Term ([1-4])$/i.exec(entry.name);
        await visit(file, label ? Number(label[1]) : term);
      } else if (entry.isFile()) {
        if (!/\.csv$/i.test(entry.name)) { excluded.push({ name: entry.name, reason: 'Not a CSV dataset (left untouched).' }); continue; }
        if (!term) throw new Error('Specify a term or use Term 1-4 folders for ' + entry.name);
        const result = await readArchiveFile(file, year, term);
        if (result) datasets.push(result);
        else excluded.push({ name: entry.name, reason: 'Unrecognised CSV type; requires separate review (left untouched).' });
      }
    }
  }
  await visit(path.resolve(root), fixedTerm);
  if (!datasets.length) throw new Error('No supported CSV datasets were found.');
  return { datasets, excluded };
}
async function importArchive(client, plan) {
  const results = [];
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(1377474883)');
    for (const { dataset } of plan.datasets) results.push(await saveDataset(client, dataset));
    await client.query('COMMIT');
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
module.exports = { readArchiveFile, planArchive, importArchive };
