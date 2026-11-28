function parseSeniorAuditPdf(report) {
  const pages = report?.pages;
  if (!Array.isArray(pages) || !pages.length || pages.length > 20) {
    throw new Error('The KAMAR PDF has no readable pages or exceeds 20 pages.');
  }
  const near = (value, expected) => Math.abs(value - expected) < 1;
  const header = (items, x, y) => items.find(item => near(item.x, x) && near(item.y, y))?.text?.trim() || '';
  let first;
  const rows = [];
  let total;
  for (const page of pages) {
    const items = page.items;
    if (!Array.isArray(page.view) || !near(page.view[2], 595) || !near(page.view[3], 842) ||
        !Array.isArray(items) || !items.some(item => item.text === 'KAMAR')) {
      throw new Error('The PDF is not a recognised portrait KAMAR export.');
    }
    const course = header(items, 49, 777).toUpperCase();
    const number = header(items, 131, 659);
    const version = header(items, 203, 659);
    const level = header(items, 257, 659);
    const printed = items.find(item => item.x > 400 && item.y < 60 &&
      /^\d{1,2} [A-Z][a-z]{2} \d{4},/.test(item.text))?.text;
    const title = items.filter(item => near(item.x, 46) && item.y >= 680 && item.y <= 750)
      .sort((a, b) => b.y - a.y).map(item => item.text.trim()).join(' ');
    if (!/^1[123][A-Z][A-Z0-9]*$/.test(course) || !/^\d{1,8}$/.test(number) ||
        !/^\d+$/.test(version) || !/^[123]$/.test(level) || !title ||
        header(items, 49, 640.5) !== 'Student Name' || header(items, 200.7, 642) !== 'Teacher' ||
        header(items, 268.7, 640) !== 'Status') {
      throw new Error('The PDF class, standard or column headings could not be verified.');
    }
    const kind = /^US\s+\d+\b/i.test(title) ? 'unit' :
      /^AS\s+\d+\b/i.test(title) || items.some(item => /^Attempt 1$/i.test(item.text)) ? 'achievement' : 'unknown';
    if (kind === 'unknown') throw new Error('The PDF standard type could not be verified.');
    const meta = { course, number, version, level, title, kind, printed };
    if (first && JSON.stringify(meta) !== JSON.stringify(first)) {
      throw new Error('The PDF contains inconsistent standard or class headings.');
    }
    first = meta;
    const anchors = items.filter(item => near(item.x, 49) && item.y < 635 && item.y > 55 &&
      /^[^,\d:]+,/.test(item.text)).sort((a, b) => b.y - a.y);
    for (const anchor of anchors) {
      const fragments = items.filter(item => item.x >= 49 && item.x < 190 && near(item.y, anchor.y))
        .sort((a, b) => a.x - b.x);
      let name = '';
      fragments.forEach((item, index) => {
        const previous = fragments[index - 1];
        name += previous && (previous.text.endsWith(',') || item.x - previous.x - previous.width > 1) ? ' ' : '';
        name += item.text;
      });
      if (!/^[^,\d:]+,\s*[^,\d:]+$/.test(name)) throw new Error('A PDF student name could not be verified.');
      const statuses = items.filter(item => item.x >= 245 && item.x < 330 && Math.abs(item.y - anchor.y) <= 1);
      const teachers = items.filter(item => item.x >= 200 && item.x < 245 && near(item.y, anchor.y - 2));
      if (statuses.length > 1 || teachers.length > 1 ||
          teachers.length && !/^[A-Z]{1,8}(?:,\s*[A-Z]{1,8})*$/.test(teachers[0].text)) {
        throw new Error('A student row has an unreadable status or teacher code.');
      }
      const status = statuses[0]?.text.trim() || '';
      const grades = { 'not achieved': 'Not Achieved', achieved: 'Achieved', merit: 'Merit', excellence: 'Excellence' };
      const key = status.toLowerCase();
      if (!Object.hasOwn(grades, key) && key !== 'not yet assessed' && key !== 'not entered' && key !== '') {
        throw new Error('The PDF contains an unrecognised assessment status.');
      }
      if (kind === 'unit' && ['merit', 'excellence'].includes(key)) {
        throw new Error('A unit standard contains an unexpected result.');
      }
      rows.push({ name: name.trim(), status, grade: grades[key] || null,
        teachers: teachers.length ? teachers[0].text.split(',').map(code => code.trim()) : [] });
    }
    for (const item of items) {
      const match = /^(?:Male: \d+, )?(?:Female: \d+, )?Students: (\d+)$/.exec(item.text);
      if (match) {
        if (total !== undefined) throw new Error('The PDF has more than one student total.');
        total = Number(match[1]);
      }
    }
  }
  if (total === undefined || total !== rows.length ||
      new Set(rows.map(row => row.name.normalize('NFC').trim().toLowerCase())).size !== rows.length) {
    throw new Error('The PDF student count or names could not be verified.');
  }
  return { ...first, rows };
}

module.exports = { parseSeniorAuditPdf };
