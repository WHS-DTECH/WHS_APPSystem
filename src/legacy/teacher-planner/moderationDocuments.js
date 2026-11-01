const fs = require('node:fs');
const path = require('node:path');
const PizZip = require('pizzip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const { common, documents, critique, sourceOptions, yesNo, documentResource, documentResources, internalFieldValue, isSchedulePlaceholder } = require('./public/moderation-schema');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const P = 'http://schemas.openxmlformats.org/package/2006/relationships';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
function text(node) {
  if (!node) return '';
  function read(child) {
    if (child.namespaceURI === W && child.localName === 't') return child.textContent;
    if (child.namespaceURI === W && child.localName === 'br') return '\n';
    return Array.from(child.childNodes || []).map(read).join('') +
      (child !== node && child.namespaceURI === W && child.localName === 'p' ? '\n' : '');
  }
  return read(node).replace(/\n$/, '');
}
const children = (node, tag) => Array.from(node.childNodes).filter(child => child.namespaceURI === W && child.localName === tag);
const paragraphs = node => children(node, 'p');
const rows = node => children(node, 'tr');
const cells = node => children(node, 'tc');

function open(buffer) {
  const zip = new PizZip(buffer);
  let size = 0;
  for (const file of Object.values(zip.files)) {
    size += file._data?.uncompressedSize || 0;
    if (size > 16_000_000) throw new Error('The Word document is too large to import.');
  }
  const xml = zip.file('word/document.xml')?.asText();
  if (!xml || xml.length > 4_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Choose a supported Word assessment document.');
  const doc = new DOMParser({ errorHandler: { warning() {}, error() { throw new Error('Invalid Word XML.'); },
    fatalError() { throw new Error('Invalid Word XML.'); } } }).parseFromString(xml, 'application/xml');
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  if (!body) throw new Error('The document has no assessment content.');
  return { zip, doc, body, tables: children(body, 'tbl') };
}
function setText(node, value) {
  if (!node) throw new Error('The assessment template layout is not supported.');
  let p = node.localName === 'p' ? node : paragraphs(node)[0];
  if (!p) { p = node.ownerDocument.createElementNS(W, 'w:p'); node.appendChild(p); }
  const style = p.getElementsByTagNameNS(W, 'rPr')[0]?.cloneNode(true);
  for (const child of Array.from(p.childNodes)) if (child.localName !== 'pPr') p.removeChild(child);
  if (node !== p) for (const extra of paragraphs(node).slice(1)) node.removeChild(extra);
  const run = p.ownerDocument.createElementNS(W, 'w:r');
  if (style) run.appendChild(style);
  for (const [i, line] of String(value || '').split('\n').entries()) {
    if (i) run.appendChild(p.ownerDocument.createElementNS(W, 'w:br'));
    const t = p.ownerDocument.createElementNS(W, 'w:t');
    t.setAttribute('xml:space', 'preserve'); t.appendChild(p.ownerDocument.createTextNode(line));
    run.appendChild(t);
  }
  p.appendChild(run);
}
function addParagraph(body, value) {
  const p = body.ownerDocument.createElementNS(W, 'w:p');
  const end = children(body, 'sectPr')[0];
  body.insertBefore(p, end || null);
  setText(p, value);
}
function highlightedOptions(node, options, includeCellShading = false) {
  let value = '';
  const marked = [];
  const cellFill = includeCellShading && children(node, 'tcPr')[0]?.getElementsByTagNameNS(W, 'shd')[0]?.getAttributeNS(W, 'fill');
  // Yellow cell shading denotes a selection; other cell colours may be template decoration.
  const cellSelected = typeof cellFill === 'string' && cellFill.toLowerCase() === 'ffff00';
  for (const run of Array.from(node.getElementsByTagNameNS(W, 'r'))) {
    const properties = children(run, 'rPr')[0];
    const highlight = properties && children(properties, 'highlight')[0]?.getAttributeNS(W, 'val');
    const fill = properties && children(properties, 'shd')[0]?.getAttributeNS(W, 'fill');
    const selected = cellSelected || Boolean(highlight && !['none', 'white'].includes(highlight.toLowerCase()) ||
      fill && !['auto', 'ffffff', 'none'].includes(fill.toLowerCase()));
    const content = Array.from(run.getElementsByTagNameNS(W, 't')).map(item => item.textContent).join('');
    value += content;
    marked.push(...Array.from({ length: content.length }, () => selected));
  }
  return options.filter(option => {
    const pattern = new RegExp('\\b' + option.replace(/ /g, '\\s+') + '\\b', 'gi');
    return [...value.matchAll(pattern)].some(match => [...match[0]].every((char, i) => /\s/.test(char) || marked[match.index + i]));
  });
}
function scheduleResources(state, entries, values, type = 'schedule') {
  const file = state.zip.file('word/_rels/document.xml.rels');
  if (!file) return [];
  const xml = file.asText();
  if (xml.length > 4_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('The document hyperlink definitions are not supported.');
  const rels = new DOMParser({ errorHandler: { warning() {}, error() { throw new Error('Invalid document hyperlink XML.'); },
    fatalError() { throw new Error('Invalid document hyperlink XML.'); } } }).parseFromString(xml, 'application/xml');
  const namespace = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const targets = new Map(Array.from(rels.getElementsByTagNameNS(namespace, 'Relationship'))
    .filter(rel => rel.getAttribute('TargetMode') === 'External' && rel.getAttribute('Type') === R + '/hyperlink')
    .map(rel => [rel.getAttribute('Id'), rel.getAttribute('Target')]));
  const normalize = label => label.toLowerCase().replace(/&/g, ' and ').replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim().replace(/:$/, '');
  const fields = documents[type].groups.flatMap(([, fields]) => fields).filter(def => def[2] === 'drive');
  const found = new Map(fields.map(([key]) => [key, new Set()]));
  const warnings = new Set();
  for (const entry of entries.filter(entry => ['instructions', 'submissions'].includes(entry.key))) {
    let heading;
    for (const paragraph of Array.from(entry.node.getElementsByTagNameNS(W, 'p'))) {
      const links = Array.from(paragraph.getElementsByTagNameNS(W, 'hyperlink'));
      if (!links.length) {
        const matched = fields.find(([, title]) => normalize(title) === normalize(text(paragraph)));
        heading = matched || (type === 'feedback' ? heading : undefined);
      }
      for (const link of links) {
        const label = text(link).replace(/\s+/g, ' ').trim();
        const tooltip = link.getAttributeNS(W, 'tooltip');
        const field = fields.find(([, title]) => normalize(title) === normalize(tooltip || label)) || heading;
        if (!field) continue;
        const target = targets.get(link.getAttributeNS(R, 'id'));
        const resource = documentResource(label + ' | ' + (target || ''));
        if (resource) found.get(field[0]).add(resource.name + ' | ' + resource.url);
        else warnings.add('The ' + field[1] + ' hyperlink could not be imported; choose its document manually.');
      }
    }
  }
  for (const [key, label] of fields) {
    if (values[key]) continue;
    const urls = found.get(key);
    if (urls.size) {
      const value = [...urls].join('\n');
      if (value.length <= 8000) values[key] = value;
      else warnings.add('The ' + label + ' hyperlinks exceed the resource limit; select the files manually.');
    }
  }
  return [...warnings];
}
function markingRow(state) {
  return rows(state.tables[0] || { childNodes: [] }).findIndex(row => /^Marking(?: Grade)?$/.test(text(cells(row)[0])));
}
function writeScheduleResources(state, entries, values, type = 'schedule') {
  const rels = new DOMParser().parseFromString(state.zip.file('word/_rels/document.xml.rels')?.asText() ||
    '<Relationships xmlns="' + P + '"/>', 'application/xml');
  const ids = new Set(Array.from(rels.getElementsByTagNameNS(P, 'Relationship')).map(rel => rel.getAttribute('Id')));
  const fields = documents[type].groups.flatMap(([, fields]) => fields);
  const groupsByCell = type === 'feedback' ? [['instructions', ['markingScheduleLink', 'coversheetLink']]] :
    [['instructions', ['assessmentInstructionsLink', 'topicBriefLink']],
      ['submissions', ['documentationSubmissionLink', 'fileSubmissionLink', 'tourReportLink']]];
  for (const [key, resources] of groupsByCell) {
    const node = entries.find(entry => entry.key === key).node;
    const groups = resources.map(id => {
      let links = documentResources(values[id] || '');
      if (!links) throw new Error('The saved document resource links are invalid.');
      const label = fields.find(([key]) => key === id)[1];
      if (type === 'feedback') {
        const shortLinks = links.filter(link => link.name.trim().replace(/:$/, '').toLowerCase() === label.toLowerCase());
        if (shortLinks.length) links = shortLinks;
        links = links.filter((link, index) => links.findIndex(other => other.url === link.url) === index);
      }
      return { id, links, label };
    });
    setText(node, '');
    const template = paragraphs(node)[0].cloneNode(true);
    node.removeChild(paragraphs(node)[0]);
    for (const group of groups) {
      if (!group.links.length && group.id === 'tourReportLink') continue;
      const heading = template.cloneNode(true);
      setText(heading, group.label + (type === 'feedback' ? ':' : ''));
      {
        const style = children(children(heading, 'r')[0], 'rPr')[0];
        let properties = style;
        if (!properties) {
          properties = state.doc.createElementNS(W, 'w:rPr');
          children(heading, 'r')[0].insertBefore(properties, children(heading, 'r')[0].firstChild);
        }
        const bold = children(properties, 'b')[0] || state.doc.createElementNS(W, 'w:b');
        bold.setAttributeNS(W, 'w:val', '1'); properties.appendChild(bold);
      }
      node.appendChild(heading);
      if (type === 'feedback' && group.id === 'coversheetLink') {
        const instruction = template.cloneNode(true);
        setText(instruction, values.instructions || 'Please fill in the attached Cover Sheet.');
        node.appendChild(instruction);
      }
      for (const [index, resource] of group.links.entries()) {
        let id = 'planner-' + group.id + '-' + index;
        while (ids.has(id)) id += '-';
        ids.add(id);
        const rel = rels.createElementNS(P, 'Relationship');
        for (const [key, value] of Object.entries({ Id: id, Type: R + '/hyperlink', Target: resource.url, TargetMode: 'External' })) rel.setAttribute(key, value);
        rels.documentElement.appendChild(rel);
        const p = template.cloneNode(true), link = state.doc.createElementNS(W, 'w:hyperlink');
        link.setAttributeNS(R, 'r:id', id); link.setAttributeNS(W, 'w:tooltip', group.label);
        setText(p, resource.name);
        const run = children(p, 'r')[0];
        let properties = children(run, 'rPr')[0];
        if (!properties) { properties = state.doc.createElementNS(W, 'w:rPr'); run.insertBefore(properties, run.firstChild); }
        for (const [tag, value] of [['color', '0000FF'], ['u', 'single']]) {
          let property = children(properties, tag)[0];
          if (!property) { property = state.doc.createElementNS(W, 'w:' + tag); properties.appendChild(property); }
          property.setAttributeNS(W, 'w:val', value);
        }
        link.appendChild(run);
        p.appendChild(link); node.appendChild(p);
      }
      if (type === 'feedback' && group.id === 'markingScheduleLink') {
        const spacer = template.cloneNode(true);
        setText(spacer, ''); node.appendChild(spacer);
      }
    }
  }
  state.zip.file('word/_rels/document.xml.rels', new XMLSerializer().serializeToString(rels));
}
function bindings(state, type) {
  const table = state.tables;
  const at = (t, r, c) => cells(rows(table[t] || { childNodes: [] })[r] || { childNodes: [] })[c];
  const result = [];
  const bind = (t, r, c, key, prefix = '') => result.push({ node: at(t, r, c), key, prefix });
  if (type === 'internal') {
    bind(0, 1, 1, 'course'); bind(0, 1, 2, 'standardNumber', 'Standard Number: '); bind(0, 1, 3, 'version', 'Version: ');
    bind(0, 2, 1, 'standardTitle'); bind(0, 3, 0, 'credits', 'Credits: '); bind(0, 3, 1, 'level', 'NZQF Level: ');
    bind(0, 3, 3, 'consent', 'Decision: '); bind(0, 4, 0, 'source', 'Source of materials: ');
    [8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20].forEach((r, i) => bind(0, r, 1, critique[i][0], 'Decision: '));
    bind(0, 21, 0, 'critiqueName', "Critiquer's name: "); bind(0, 21, 1, 'critiqueSchool', 'School: '); bind(0, 21, 2, 'critiqueDate', 'Date: ');
    bind(0, 24, 0, 'verifierName', 'Verifier name: '); bind(0, 24, 1, 'verifierSchool', 'School: ');
    bind(0, 24, 2, 'verifierPosition', 'Position: '); bind(0, 24, 3, 'verificationDate', 'Date: ');
    bind(0, 25, 0, 'verificationEvidence', 'Evidence / location of verification: ');
    bind(0, 27, 0, 'signatory', 'Sighted by (record only): '); bind(0, 27, 1, 'signatoryDate', 'Date: ');
    bind(0, 29, 0, 'resultsLoaded', 'Results loaded into student management system: '); bind(0, 29, 1, 'resultsDate', 'Date: ');
    bind(0, 30, 1, 'retained', 'Decision: '); bind(0, 31, 0, 'retentionLocation', 'Location / file path: ');
    bind(0, 32, 1, 'randomSelection', 'Decision: '); bind(0, 33, 1, 'reviewed', 'Decision: '); bind(0, 34, 1, 'benchmarks', 'Decision: ');
  } else if (type === 'schedule') {
    bind(0, 1, 0, 'subject'); bind(0, 3, 1, 'studentId'); bind(0, 3, 3, 'subject'); bind(0, 3, 5, 'level');
    bind(0, 4, 1, 'instructions'); bind(0, 4, 2, 'submissions'); bind(0, 4, 4, 'standardNumber'); bind(0, 4, 6, 'version');
    bind(0, 5, 1, 'standardTitle'); bind(0, 5, 3, 'credits');
    bind(0, 8, 0, 'achieved'); bind(0, 8, 1, 'merit'); bind(0, 8, 2, 'excellence');
    const marking = markingRow(state);
    if (marking >= 0) {
      const compact = cells(rows(table[0])[marking + 1]).length === 3;
      bind(0, marking + 1, compact ? 1 : 0, 'grade', compact ? '' : 'OVERALL GRADE: ');
      bind(0, marking + 1, compact ? 2 : 5, 'markerComments');
    }
  } else if (type === 'coversheet') {
    bind(0, 0, 1, 'standardTitle'); bind(0, 0, 3, 'standardNumber'); bind(0, 1, 1, 'studentName');
    bind(0, 3, 1, 'signatureName'); bind(0, 3, 3, 'signatureDate');
    bind(1, 2, 0, 'achieved'); bind(1, 2, 1, 'higherGrades'); bind(1, 3, 1, 'grade');
    bind(2, 1, 1, 'appeal'); bind(2, 2, 1, 'feedbackReceived'); bind(2, 3, 1, 'headReview');
    bind(2, 4, 0, 'appealReasons', 'Reasons for appeal: ');
  }
  if (result.some(binding => !binding.node)) throw new Error('The document does not match the selected assessment template.');
  return result;
}
function replaceRows(table, start, end, data, fill) {
  const original = rows(table).slice(start, end);
  if (!original.length) throw new Error('Template evidence rows are missing.');
  for (const item of data.length ? data : [{}]) {
    const row = original[0].cloneNode(true);
    fill(cells(row), item); table.insertBefore(row, original[0]);
  }
  for (const row of original) table.removeChild(row);
}
function appendDetails(body, data, values, definition) {
  addParagraph(body, 'Planner record details');
  for (const [key, label] of common) addParagraph(body, label + ': ' + (data[key] || ''));
  const mainFields = definition.groups.flatMap(([, fields]) => fields);
  for (const [key, label, kind] of mainFields) {
    if (['url', 'drive'].includes(kind) || ['signatoryPosition', 'acknowledgedDate'].includes(key)) addParagraph(body, label + ': ' + (values[key] || ''));
  }
  addParagraph(body, 'Supporting notes: ' + (values.notes || ''));
  addParagraph(body, 'Supporting resources: ' + (values.resources || ''));
  if (definition.rows?.key === 'samples' && values.samples?.some(item => item.markingScheduleRecord)) {
    addParagraph(body, 'Individual marking schedule references: ' + JSON.stringify(values.samples.map(item =>
      ({ student: item.student || '', record: item.markingScheduleRecord || '' }))));
  }
}
function removeTemplateLinks(zip, mainDocument) {
  for (const file of Object.values(zip.files).filter(file => file.name.endsWith('.rels'))) {
    const relationships = new DOMParser().parseFromString(file.asText(), 'application/xml');
    const removed = new Set();
    for (const node of Array.from(relationships.documentElement.childNodes)) {
      if (node.nodeType !== 1 || node.getAttribute('TargetMode') !== 'External') continue;
      removed.add(node.getAttribute('Id')); node.parentNode.removeChild(node);
    }
    if (!removed.size) continue;
    zip.file(file.name, new XMLSerializer().serializeToString(relationships));
    const part = zip.file(file.name.replace('_rels/', '').replace(/\.rels$/, ''));
    if (!part) continue;
    const doc = part.name === 'word/document.xml' && mainDocument ? mainDocument :
      new DOMParser().parseFromString(part.asText(), 'application/xml');
    for (const node of Array.from(doc.getElementsByTagName('*'))) {
      if (!removed.has(node.getAttributeNS(R, 'id'))) continue;
      if (node.localName === 'hyperlink') while (node.firstChild) node.parentNode.insertBefore(node.firstChild, node);
      node.parentNode.removeChild(node);
    }
    zip.file(part.name, new XMLSerializer().serializeToString(doc));
  }
}
function fillDocument(buffer, type, data, year) {
  const definition = documents[type];
  if (!definition) throw new Error('Choose a valid moderation document.');
  const state = open(buffer);
  const values = JSON.parse(data[type] || '{}');
  if (type === 'schedule' && values.requirements) values.requirements = values.requirements.filter(row => !isSchedulePlaceholder(row));
  if (type === 'internal') for (const key of Object.keys(values)) values[key] = internalFieldValue(key, values[key]);
  if (type === 'schedule' && data.standardType === 'Unit') { values.merit = ''; values.excellence = ''; }
  const flat = { ...data, ...values };
  if (type === 'internal') {
    const ticked = new Set(String(values.sourceTypes || '').split(', '));
    flat.source = sourceOptions.map(option => (ticked.has(option) ? '☒ ' : '☐ ') + option).join('   ') +
      (values.source ? '\n' + values.source : '');
  }
  const entries = bindings(state, type);
  for (const binding of entries) {
    if (type === 'schedule' && ['instructions', 'submissions'].includes(binding.key)) {
      for (const table of children(binding.node, 'tbl')) binding.node.removeChild(table);
    }
    const prefix = binding.prefix === 'Decision: ' ? '' : binding.prefix;
    setText(binding.node, prefix + (flat[binding.key] || ''));
  }
  if (type === 'internal') {
    const sectionC = paragraphs(cells(rows(state.tables[0])[22])[0])[0];
    let properties = children(sectionC, 'pPr')[0];
    if (!properties) { properties = state.doc.createElementNS(W, 'w:pPr'); sectionC.insertBefore(properties, sectionC.firstChild); }
    for (const tag of ['pageBreakBefore', 'keepNext']) {
      let property = children(properties, tag)[0];
      if (!property) { property = state.doc.createElementNS(W, 'w:' + tag); properties.appendChild(property); }
      property.setAttributeNS(W, 'w:val', '1');
    }
    const nonempty = paragraphs(state.body).filter(p => text(p));
    if (nonempty[0]) setText(nonempty[0], 'INTERNAL MODERATION COVER SHEET ' + year);
    if (nonempty[2]) setText(nonempty[2], 'Faculty / Department: ' + (data.department || '') + '    Teacher in Charge: ' + (data.teacher || ''));
    if (nonempty[3]) setText(nonempty[3], 'Assessor: ' + (data.assessors || ''));
    for (const r of [3, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 30, 32, 33, 34]) {
      const rowCells = cells(rows(state.tables[0])[r]);
      setText(rowCells.at(-1), '');
    }
    replaceRows(state.tables[1], 3, rows(state.tables[1]).length - 1, values.samples || [], (c, item) => {
      for (const [i, key] of ['student', 'markerGrade', 'verifierGrade', 'moderatedDate', 'reportedGrade', 'reportedDate', 'comments'].entries()) setText(c[i], item[key]);
    });
  } else if (type === 'schedule') {
    setText(cells(rows(state.tables[0])[7])[0], 'Achieved Grade Criteria');
    const marking = markingRow(state);
    setText(cells(rows(state.tables[0])[marking])[0], 'Marking Grade');
    const gradeCells = cells(rows(state.tables[0])[marking + 1]);
    setText(gradeCells[0], 'OVERALL GRADE:');
    if (gradeCells.length === 6) {
      const span = gradeCells[1].getElementsByTagNameNS(W, 'gridSpan')[0];
      span.setAttributeNS(W, 'w:val', String(gradeCells.slice(1, 5).reduce((sum, cell) =>
        sum + Number(cell.getElementsByTagNameNS(W, 'gridSpan')[0]?.getAttributeNS(W, 'val') || 1), 0)));
      for (const cell of gradeCells.slice(2, 5)) cell.parentNode.removeChild(cell);
    }
    setText(gradeCells[1], values.grade || '');
    const gradeParagraph = paragraphs(gradeCells[1])[0];
    let properties = children(gradeParagraph, 'pPr')[0];
    if (!properties) { properties = state.doc.createElementNS(W, 'w:pPr'); gradeParagraph.insertBefore(properties, gradeParagraph.firstChild); }
    let alignment = children(properties, 'jc')[0];
    if (!alignment) { alignment = state.doc.createElementNS(W, 'w:jc'); properties.appendChild(alignment); }
    alignment.setAttributeNS(W, 'w:val', 'center');
    const run = children(gradeParagraph, 'r')[0];
    let style = children(run, 'rPr')[0];
    if (!style) { style = state.doc.createElementNS(W, 'w:rPr'); run.insertBefore(style, run.firstChild); }
    for (const [tag, value] of [['b', '1'], ['sz', '32']]) {
      let property = children(style, tag)[0];
      if (!property) { property = state.doc.createElementNS(W, 'w:' + tag); style.appendChild(property); }
      property.setAttributeNS(W, 'w:val', value);
    }
    replaceRows(state.tables[0], 11, marking, values.requirements || [], (c, item) => {
      setText(c[0], item.requirement);
      ['A', 'M', 'E'].forEach((grade, i) => setText(c[i + 1], item.grade === grade ? 'Yes' : ''));
      setText(c[4], item.evidence); setText(c[5], item.judgement);
      for (const p of paragraphs(c[4])) {
        let properties = children(p, 'pPr')[0];
        if (!properties) { properties = state.doc.createElementNS(W, 'w:pPr'); p.insertBefore(properties, p.firstChild); }
        const alignment = children(properties, 'jc')[0] || state.doc.createElementNS(W, 'w:jc');
        alignment.setAttributeNS(W, 'w:val', 'left'); properties.appendChild(alignment);
      }
    });
  } else if (type === 'feedback') {
    const ps = paragraphs(state.body);
    if (ps.length < 15 || !/^Marking (?:Feedback|Confirmation)/i.test(text(ps[3]))) {
      throw new Error('The Confirmation & Feedback template layout is not supported.');
    }
    for (const p of ps.slice(15)) state.body.removeChild(p);
    const margins = state.body.getElementsByTagNameNS(W, 'pgMar')[0];
    if (!margins) throw new Error('The Confirmation & Feedback template page margins are missing.');
    for (const side of ['left', 'right']) margins.setAttributeNS(W, 'w:' + side, '720');
    const drawing = ps[0].getElementsByTagNameNS(W, 'drawing')[0];
    if (!drawing) throw new Error('The Confirmation & Feedback template logo is missing.');
    for (const node of Array.from(drawing.getElementsByTagName('*'))) {
      if (['extent', 'ext'].includes(node.localName)) {
        for (const dimension of ['cx', 'cy']) {
          if (node.hasAttribute(dimension)) node.setAttribute(dimension, String(Math.round(Number(node.getAttribute(dimension)) / 2)));
        }
      }
    }
    // Keep the original logo, paragraph spacing, title styles and page settings.
    function line(index, parts) {
      const p = ps[index];
      setText(p, '');
      p.removeChild(children(p, 'r')[0]);
      for (const size of Array.from(children(p, 'pPr')[0].getElementsByTagNameNS(W, 'sz'))) {
        size.setAttributeNS(W, 'w:val', parts[0][1] || '26');
      }
      for (const size of Array.from(children(p, 'pPr')[0].getElementsByTagNameNS(W, 'szCs'))) {
        size.setAttributeNS(W, 'w:val', parts[0][1] || '26');
      }
      for (const [value, size = '26', color, bold = false] of parts) {
        const run = state.doc.createElementNS(W, 'w:r'), style = state.doc.createElementNS(W, 'w:rPr');
        for (const [tag, val] of [['sz', size], ['szCs', size], ['b', bold ? '1' : '0'],
          ['color', color || '000000'], ['u', color === '1155CC' ? 'single' : 'none']]) {
          const property = state.doc.createElementNS(W, 'w:' + tag);
          property.setAttributeNS(W, 'w:val', val); style.appendChild(property);
        }
        run.appendChild(style);
        const t = state.doc.createElementNS(W, 'w:t');
        t.setAttribute('xml:space', 'preserve'); t.appendChild(state.doc.createTextNode(value || ''));
        run.appendChild(t); p.appendChild(run);
      }
    }
    line(2, [[data.subject, '46']]);
    line(3, [['Marking Confirmation & Feedback', '46']]);
    line(4, [['Standard: ', '26', null, true], [data.standardNumber, '46', '1155CC', true]]);
    line(5, [['Level: ', '26', null, true], [data.level], ['   Credits: ', '26', null, true],
      [data.credits], ['   Version: ', '26', null, true], [data.version]]);
    line(6, [[data.standardTitle, '18']]);
    let alignment = children(children(ps[6], 'pPr')[0], 'jc')[0];
    if (!alignment) {
      alignment = state.doc.createElementNS(W, 'w:jc');
      children(ps[6], 'pPr')[0].appendChild(alignment);
    }
    alignment.setAttributeNS(W, 'w:val', 'left');
    line(7, [['Student name: ', '26', null, true], [data.studentName, '40', '9900FF', true]]);
    line(8, [['Assessed grade: ', '26', null, true], [values.grade, '40', '9900FF', true]]);
    line(10, [['If you have any queries, please email: ', '20'], [values.contactEmail, '20', '1155CC']]);
    line(11, [['']]);
    line(14, [['']]);
    for (const index of [1, 9, 11, 12, 13]) state.body.removeChild(ps[index]);
    for (const p of paragraphs(state.body)) {
      const properties = children(p, 'pPr')[0];
      let spacing = children(properties, 'spacing')[0];
      if (!spacing) { spacing = state.doc.createElementNS(W, 'w:spacing'); properties.appendChild(spacing); }
      for (const [key, value] of [['before', '0'], ['after', '60'], ['line', '240'], ['lineRule', 'auto']]) {
        spacing.setAttributeNS(W, 'w:' + key, value);
      }
    }
  }
  // Remove the previous generated appendix before writing the current form data.
  const ps = paragraphs(state.body);
  const appendix = ps.findIndex(p => text(p) === 'Planner record details');
  if (appendix >= 0) for (const p of ps.slice(appendix)) state.body.removeChild(p);
  if (!['internal', 'schedule', 'feedback'].includes(type)) appendDetails(state.body, data, values, definition);
  state.zip.file('word/document.xml', new XMLSerializer().serializeToString(state.doc));
  const custom = state.zip.file('docProps/custom.xml');
  if (custom) {
    const doc = new DOMParser().parseFromString(custom.asText(), 'application/xml');
    for (const property of Array.from(doc.documentElement.childNodes)) doc.documentElement.removeChild(property);
    state.zip.file('docProps/custom.xml', new XMLSerializer().serializeToString(doc));
  }
  removeTemplateLinks(state.zip, state.doc);
  if (type === 'schedule') {
    writeScheduleResources(state, entries, values);
    for (const key of ['instructions', 'submissions']) {
      const node = entries.find(entry => entry.key === key).node;
      const content = paragraphs(node);
      const table = state.doc.createElementNS(W, 'w:tbl');
      const properties = state.doc.createElementNS(W, 'w:tblPr');
      const borders = state.doc.createElementNS(W, 'w:tblBorders');
      for (const edge of ['top', 'left', 'bottom', 'right', 'insideH']) {
        const border = state.doc.createElementNS(W, 'w:' + edge);
        border.setAttributeNS(W, 'w:val', 'single'); border.setAttributeNS(W, 'w:sz', '4');
        border.setAttributeNS(W, 'w:color', 'B3C4CB'); borders.appendChild(border);
      }
      properties.appendChild(borders); table.appendChild(properties);
      let cell;
      const headings = key === 'instructions' ? ['Assessment Instructions & Schedule', 'Topic Brief'] :
        ['Documentation Submission', 'File Submission', 'Tour Report'];
      for (const p of content) {
        if (!cell || headings.slice(0, 2).includes(text(p))) {
          const row = state.doc.createElementNS(W, 'w:tr');
          cell = state.doc.createElementNS(W, 'w:tc'); row.appendChild(cell); table.appendChild(row);
        }
        cell.appendChild(p);
      }
      node.appendChild(table);
      setText(node, '');
    }
    const banner = entries.find(entry => entry.key === 'subject').node;
    if (data.standardType === 'Unit') setText(banner, 'Computing');
    const run = paragraphs(banner)[0].getElementsByTagNameNS(W, 'r')[0];
    let style = children(run, 'rPr')[0];
    if (!style) { style = state.doc.createElementNS(W, 'w:rPr'); run.insertBefore(style, run.firstChild); }
    for (const [tag, value] of [['color', 'FFFFFF'], ['b', '1'], ['sz', '162'], ['szCs', '162']]) {
      const prop = children(style, tag)[0] || state.doc.createElementNS(W, 'w:' + tag);
      prop.setAttributeNS(W, 'w:val', value); style.appendChild(prop);
      for (const property of Array.from(banner.getElementsByTagNameNS(W, tag))) property.setAttributeNS(W, 'w:val', value);
    }
    const url = data.standardPdfUrl || (data.standardType === 'Unit' && data.standardNumber ?
      'https://www.nzqa.govt.nz/nqfdocs/units/pdf/' + data.standardNumber + '.pdf' : '');
    if (url) {
      const expected = new RegExp('^https://www\\.nzqa\\.govt\\.nz/nqfdocs/(?:units/pdf/|ncea-resource/achievements/\\d{4}/as)' + data.standardNumber + '\\.pdf$');
      if (!expected.test(url)) throw new Error('Choose the official NZQA standard PDF link.');
      const rels = new DOMParser().parseFromString(state.zip.file('word/_rels/document.xml.rels').asText(), 'application/xml');
      const rel = rels.createElementNS(P, 'Relationship');
      for (const [key, value] of Object.entries({ Id: 'planner-standard-pdf', Type: R + '/hyperlink', Target: url, TargetMode: 'External' })) rel.setAttribute(key, value);
      rels.documentElement.appendChild(rel);
      const p = paragraphs(entries.find(entry => entry.key === 'standardNumber').node)[0];
      const link = state.doc.createElementNS(W, 'w:hyperlink'); link.setAttributeNS(R, 'r:id', 'planner-standard-pdf');
      for (const run of children(p, 'r')) link.appendChild(run);
      p.appendChild(link);
      state.zip.file('word/_rels/document.xml.rels', new XMLSerializer().serializeToString(rels));
    }
    state.zip.file('word/document.xml', new XMLSerializer().serializeToString(state.doc));
  }
  if (type === 'feedback') {
    const container = state.doc.createElementNS(W, 'w:tc');
    const placeholder = paragraphs(state.body).at(-1);
    container.appendChild(placeholder.cloneNode(true));
    setText(container, '');
    state.body.removeChild(placeholder);
    for (let i = 0; i < 2; i++) {
      const spacer = paragraphs(container)[0].cloneNode(true);
      setText(spacer, '');
      state.body.insertBefore(spacer, children(state.body, 'sectPr')[0] || null);
    }
    writeScheduleResources(state, [{ key: 'instructions', node: container }], values, 'feedback');
    const end = children(state.body, 'sectPr')[0];
    while (container.firstChild) state.body.insertBefore(container.firstChild, end || null);
    state.zip.file('word/document.xml', new XMLSerializer().serializeToString(state.doc));
  }
  return state.zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
function renderDocument(type, data, year) {
  return fillDocument(fs.readFileSync(path.join(__dirname, 'templates', type + '.docx')), type, data, year);
}
function importDocument(buffer, type) {
  const definition = documents[type];
  if (!definition) throw new Error('Choose a valid moderation document.');
  const state = open(buffer), data = {}, values = {};
  const commonKeys = new Set(common.map(([key]) => key));
  const entries = bindings(state, type);
  const ambiguousDecisions = [];
  let resourceWarnings = [];
  const decisionFields = definition.groups.flatMap(([, fields]) => fields).filter(([, , kind]) => kind === yesNo);
  if (type !== 'feedback' && !entries.length || type === 'feedback' && !/Marking (?:Feedback|Confirmation)/i.test(text(state.body))) {
    throw new Error('The document does not match the selected assessment template.');
  }
  for (const { node, key, prefix } of entries) {
    let value = text(node).trim();
    if (decisionFields.some(([id]) => id === key) && !(prefix ? value.startsWith(prefix) : yesNo.includes(value))) {
      const rowCells = cells(node.parentNode);
      const index = rowCells.indexOf(node);
      const candidates = prefix === 'Decision: ' ? rowCells.slice(index, index + 2) : [node];
      const singleAnswer = prefix === 'Decision: ' && yesNo.includes(value) &&
        candidates.slice(1).every(cell => !text(cell).trim());
      const selections = singleAnswer ? [value] :
        [...new Set(candidates.flatMap(cell => highlightedOptions(cell, ['Yes', 'No', 'Not applicable'], true)))];
      if (selections.length > 1) ambiguousDecisions.push(key);
      value = selections.length === 1 ? selections[0] : '';
    }
    if (prefix && value.startsWith(prefix)) value = value.slice(prefix.length).trim();
    if (key === 'standardNumber') value = value.match(/\b\d{4,8}\b/)?.[0] || '';
    if (key === 'grade') value = definition.groups.flatMap(([, fields]) => fields).find(([id]) => id === 'grade')[2].find(grade => grade && value === grade) || '';
    (commonKeys.has(key) ? data : values)[key] = value;
  }
  if (type === 'internal' && values.source !== undefined) {
    const [first, ...rest] = values.source.split('\n');
    if (/[☒☐]/.test(first)) {
      values.sourceTypes = sourceOptions.filter(option => new RegExp('☒ ' + option + '(?:\\s|$)').test(first)).join(', ');
      values.source = rest.join('\n').trim();
    } else {
      const sourceNode = entries.find(entry => entry.key === 'source').node;
      const selected = highlightedOptions(sourceNode, sourceOptions);
      if (selected.length) values.sourceTypes = selected.join(', ');
      // The legacy option menu is not a description or a selection by itself.
      values.source = values.source.replace(/^Source of materials:\s*/i, '');
      const menu = /^Commercial\s*\/\s*Own\s*\/\s*TKI\s*\/\s*NZQA\s*\/\s*Subject Association\s*\/\s*Other\s*:\s*/i;
      values.source = values.source.replace(menu, '').trim();
    }
  }
  const allParagraphs = paragraphs(state.body).map(p => text(p));
  if (type === 'internal') {
    const heading = allParagraphs.find(line => line.startsWith('Faculty / Department: '));
    const match = heading?.match(/^Faculty \/ Department: (.*?) {4}Teacher in Charge: (.*)$/);
    if (match) { data.department = match[1]; data.teacher = match[2]; }
  }
  for (const [key, label] of common) {
    const aliases = { assessors: ['Assessors'], course: ['Course / class'], department: ['Faculty / department'] };
    for (const title of [...(aliases[key] || []), label]) {
      const entry = allParagraphs.findLast(line => line.startsWith(title + ': '));
      if (entry !== undefined && !(type === 'internal' && key === 'department' && entry.includes('    Teacher in Charge: '))) data[key] = entry.slice(title.length + 2);
    }
  }
  const extra = [['notes', 'Supporting notes'], ['resources', 'Supporting resources'],
    ...definition.groups.flatMap(([, fields]) => fields)];
  for (const [key, label] of extra) {
    const titles = key === 'conditionsLink' ? ['Conditions of assessment reference link', label] : [label];
    for (const title of titles) {
      const entry = allParagraphs.find(line => line.toLowerCase().startsWith(title.toLowerCase() + ': '));
      if (entry !== undefined) values[key] = entry.slice(title.length + 2);
    }
  }
  if (type === 'feedback') {
    resourceWarnings = scheduleResources(state, [{ key: 'instructions', node: state.body }], values, 'feedback');
    const aliases = { standardNumber: 'Standard', standardTitle: 'Standard title', level: 'Level', credits: 'Credits',
      version: 'Version', studentName: 'Student name', grade: 'Assessed grade', feedback: 'Feedback' };
    for (const [key, label] of Object.entries(aliases)) {
      const entry = allParagraphs.find(line => line.toLowerCase().startsWith(label.toLowerCase() + ': '));
      if (entry !== undefined) (commonKeys.has(key) ? data : values)[key] = entry.slice(label.length + 2);
    }
    const combined = allParagraphs.join('\n').match(/Level:\s*(\d+)\s+Credits:\s*(\d+)\s+Version:\s*(\d+)/i);
    if (combined) { data.level = combined[1]; data.credits = combined[2]; data.version = combined[3]; }
    if (!data.standardTitle) {
      const detailsIndex = allParagraphs.findIndex(line => /^Level:.*Credits:.*Version:/i.test(line));
      const title = allParagraphs[detailsIndex + 1];
      if (detailsIndex >= 0 && title && !/^Student name:/i.test(title)) data.standardTitle = title;
    }
    const legacyGrade = values.grade?.trim().match(/^([NAME])(?:\s*Marking Schedule)?$/);
    if (legacyGrade) values.grade = legacyGrade[1];
    const queryIndex = allParagraphs.findIndex(line => /^If you have any queries, please email:/i.test(line));
    if (queryIndex >= 0 && !allParagraphs.some(line => /^Teacher contact email:/i.test(line))) {
      const inlineEmail = allParagraphs[queryIndex].replace(/^If you have any queries, please email:\s*/i, '').trim();
      const nextLine = allParagraphs[queryIndex + 1]?.trim() || '';
      const separateEmail = !inlineEmail && !/^(?:Marking Schedule|Cover Sheet):?$/.test(nextLine);
      values.contactEmail = inlineEmail || (separateEmail ? nextLine : '');
      const remaining = allParagraphs.slice(queryIndex + (separateEmail ? 2 : 1));
      const coverIndex = remaining.findIndex(line => /^Cover Sheet:$/.test(line));
      const resourceIndex = remaining.findIndex(line => /^(?:Marking Schedule|Cover Sheet):?$/.test(line));
      values.instructions = coverIndex >= 0 ? remaining[coverIndex + 1] || '' :
        remaining.slice(0, resourceIndex < 0 ? undefined : resourceIndex).filter(Boolean).join('\n');
    }
    if (!data.subject) {
      const titleIndex = allParagraphs.findIndex(line => /^Marking (?:Feedback|Confirmation)/i.test(line));
      if (titleIndex > 0) data.subject = allParagraphs.slice(0, titleIndex).filter(Boolean).at(-1) || '';
    }
  }
  for (const [key, value] of Object.entries(data)) data[key] = value.trim();
  if (data.standardNumber) data.standardNumber = data.standardNumber.match(/\b\d{4,8}\b/)?.[0] || '';
  if (type === 'internal') values.samples = rows(state.tables[1]).slice(3, -1).map(row =>
    Object.fromEntries(['student', 'markerGrade', 'verifierGrade', 'moderatedDate', 'reportedGrade', 'reportedDate', 'comments']
      .map((key, i) => [key, text(cells(row)[i])]))).filter(row => Object.values(row).some(Boolean));
  if (type === 'internal') {
    const metadata = allParagraphs.find(line => line.startsWith('Individual marking schedule references: '));
    if (metadata) {
      const references = JSON.parse(metadata.slice('Individual marking schedule references: '.length));
      if (!Array.isArray(references) || references.length > 50 || !references.every(item =>
        item && typeof item.student === 'string' && typeof item.record === 'string' &&
        (!item.record || /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(item.record)))) {
        throw new Error('The individual marking schedule references in this document are invalid.');
      }
      references.forEach((item, i) => {
        if (item.record && values.samples[i]?.student === item.student) values.samples[i].markingScheduleRecord = item.record;
      });
    }
  }
  if (type === 'schedule') {
    resourceWarnings = scheduleResources(state, entries, values);
    const end = markingRow(state);
    values.requirements = rows(state.tables[0]).slice(11, end).map(row => {
      const c = cells(row);
      return { requirement: text(c[0]), grade: ['A', 'M', 'E'].find((_, i) => /Yes|✅/.test(text(c[i + 1]))) || '',
        evidence: text(c[4]), judgement: text(c[5]) };
    }).filter(row => Object.values(row).some(Boolean) && !isSchedulePlaceholder(row));
    if (!values.grade) {
      values.grade = cells(rows(state.tables[0])[end + 1]).slice(1, 5)
        .map(cell => text(cell)).find(value => /\u2705/.test(value))?.match(/[NAME]/)?.[0] || '';
    }
  }
  // Unrecognised marks, handwritten signatures and ambiguous dates are not confirmations.
  const defs = definition.groups.flatMap(([, fields]) => fields);
  function normalize(target, definitions) {
    for (const [key, , kind] of definitions) {
      if (Array.isArray(kind) && !kind.includes(target[key]?.trim())) delete target[key];
      else if (Array.isArray(kind) && target[key]) target[key] = target[key].trim();
      if (kind === 'date' && target[key]) {
        const nzDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(target[key].trim());
        const value = nzDate ? nzDate[3] + '-' + nzDate[2].padStart(2, '0') + '-' + nzDate[1].padStart(2, '0') : target[key];
        if (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value) target[key] = value;
        else delete target[key];
      }
    }
  }
  normalize(values, defs);
  if (type === 'internal') for (const key of Object.keys(values)) values[key] = internalFieldValue(key, values[key]);
  if (definition.rows) for (const row of values[definition.rows.key] || []) normalize(row, definition.rows.fields);
  return { common: data, document: values,
    warning: 'Review all imported fields before saving. Handwritten signatures, checkbox marks and unrecognised dates may need to be entered manually. Supporting files remain in Drive.' +
      (ambiguousDecisions.length ? ' Conflicting highlights were left unrecorded: ' +
        ambiguousDecisions.map(key => decisionFields.find(([id]) => id === key)[1]).join('; ') + '.' : '') +
      (resourceWarnings.length ? ' ' + resourceWarnings.join(' ') : '') };
}
module.exports = { DOCX, renderDocument, fillDocument, importDocument };
