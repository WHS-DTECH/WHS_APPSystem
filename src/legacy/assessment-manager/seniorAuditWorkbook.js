const PizZip = require('pizzip');
const { DOMParser } = require('@xmldom/xmldom');
const { inflateRawSync } = require('node:zlib');

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const MAX_ARCHIVE = 5 * 1024 * 1024;
const MAX_XML = 2 * 1024 * 1024;
const columns = [
  'zi_IDNumber', 'zc_Stu_Name_Last_First_Preferred', 'zc_Stu_Level', 'Number_AsNum',
  'Version', 'Level', 'Title', 'zc_Module_Sub_Field', 'Teacher_Markbook',
  'Module_Enrol', 'zc_Result_Markbook', 'zc_Result_Printouts'
];

function parseSeniorAuditWorkbook(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_ARCHIVE) {
    throw new Error('The workbook is empty or exceeds 5 MB.');
  }
  let zip;
  try { zip = new PizZip(buffer); }
  catch { throw new Error('The workbook is not a readable Excel file.'); }

  function xml(path) {
    const entry = zip.file(path)?._data;
    if (!entry || !Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize > MAX_XML ||
        entry.uncompressedSize < 0 || typeof entry.getCompressedContent !== 'function') {
      throw new Error('The workbook contains missing or oversized XML data.');
    }
    let data;
    try {
      const compressed = Buffer.from(entry.getCompressedContent());
      if (entry.compressionMethod === '\x00\x00') data = compressed;
      else if (entry.compressionMethod === '\x08\x00') {
        data = inflateRawSync(compressed, { maxOutputLength: MAX_XML });
      } else throw new Error('Unsupported compression');
      if (data.length !== entry.uncompressedSize) throw new Error('Invalid size');
    } catch { throw new Error('The workbook contains invalid or oversized compressed data.'); }
    const text = data.toString('utf8');
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('The workbook contains unsupported XML.');
    try {
      return new DOMParser({ errorHandler: {
        warning: () => { throw new Error('Invalid XML'); },
        error: () => { throw new Error('Invalid XML'); },
        fatalError: () => { throw new Error('Invalid XML'); }
      } }).parseFromString(text, 'application/xml');
    } catch { throw new Error('The workbook contains invalid XML.'); }
  }
  const elements = (node, ns, name) => Array.from(node.getElementsByTagNameNS(ns, name));
  const workbook = xml('xl/workbook.xml');
  const relationships = xml('xl/_rels/workbook.xml.rels');
  const rels = elements(relationships, PACKAGE_REL, 'Relationship');
  const sheets = elements(workbook, MAIN, 'sheet');
  const shared = elements(xml('xl/sharedStrings.xml'), MAIN, 'si')
    .map(item => elements(item, MAIN, 't').map(node => node.textContent).join(''));
  if (shared.length > 100000) throw new Error('The workbook contains too many text values.');

  function readSheet(name) {
    const matches = sheets.filter(sheet => sheet.getAttribute('name') === name);
    if (matches.length !== 1 || matches[0].getAttribute('state') === 'hidden' ||
        matches[0].getAttribute('state') === 'veryHidden') {
      throw new Error('The expected workbook sheets are missing or hidden.');
    }
    const id = matches[0].getAttributeNS(REL, 'id');
    const targets = rels.filter(rel => rel.getAttribute('Id') === id &&
      rel.getAttribute('Type') === REL + '/worksheet' && !rel.getAttribute('TargetMode'));
    if (targets.length !== 1) throw new Error('The workbook sheet references are invalid.');
    const target = targets[0].getAttribute('Target').replace(/^\/xl\//, '');
    if (!/^worksheets\/sheet[0-9]+\.xml$/.test(target)) throw new Error('The workbook sheet location is invalid.');
    const doc = xml('xl/' + target);
    const rows = elements(doc, MAIN, 'row');
    if (!rows.length || rows.length > 20000 || rows.some(row => row.getAttribute('hidden') === '1')) {
      throw new Error('The workbook has missing, hidden or too many rows.');
    }
    function cells(row) {
      const result = {};
      for (const cell of elements(row, MAIN, 'c')) {
        const address = cell.getAttribute('r');
        const column = /^([A-Z]+)[1-9][0-9]*$/.exec(address)?.[1];
        if (!column || Object.hasOwn(result, column) || elements(cell, MAIN, 'f').length) {
          throw new Error('The workbook contains invalid or calculated cells.');
        }
        const type = cell.getAttribute('t');
        const values = elements(cell, MAIN, 'v');
        if (values.length > 1) throw new Error('The workbook contains invalid cells.');
        let value = values[0]?.textContent || '';
        if (type === 's') {
          if (!/^\d+$/.test(value) || Number(value) >= shared.length) throw new Error('The workbook contains invalid text references.');
          value = shared[Number(value)];
        } else if (type === 'inlineStr') {
          value = elements(cell, MAIN, 't').map(node => node.textContent).join('');
        } else if (type && type !== 'n' && type !== 'str') {
          throw new Error('The workbook contains unsupported cell values.');
        }
        result[column] = value.trim();
      }
      return result;
    }
    const heading = cells(rows[0]);
    const addresses = {};
    for (const name of columns) {
      const matches = Object.keys(heading).filter(key => heading[key] === name);
      if (matches.length !== 1) throw new Error('The workbook is missing required audit columns.');
      addresses[name] = matches[0];
    }
    const entries = [];
    for (const row of rows.slice(1)) {
      const values = cells(row);
      if (!Object.values(values).some(Boolean)) continue;
      const entry = Object.fromEntries(columns.map(name => [name, values[addresses[name]] || '']));
      if (!/^\d{1,20}$/.test(entry.zi_IDNumber) ||
          !/^\d{1,8}$/.test(entry.Number_AsNum) || !/^\d{1,3}$/.test(entry.Version) ||
          !entry.zc_Stu_Name_Last_First_Preferred || !entry.Module_Enrol) {
        throw new Error('The workbook contains an incomplete student or standard entry.');
      }
      entries.push(entry);
    }
    const key = row => JSON.stringify([row.zi_IDNumber, row.Number_AsNum, row.Version]);
    if (new Set(entries.map(key)).size !== entries.length) {
      throw new Error('The workbook contains duplicate student and standard entries.');
    }
    return entries.sort((a, b) => key(a).localeCompare(key(b)));
  }
  const teacher = readSheet('By Teacher');
  const curriculum = readSheet('By curriculum area');
  if (JSON.stringify(teacher) !== JSON.stringify(curriculum)) {
    throw new Error('The workbook sheets disagree. Review the export before auditing.');
  }
  return teacher;
}

module.exports = { parseSeniorAuditWorkbook };
