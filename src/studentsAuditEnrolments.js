function parseStudentsAuditEnrolments(report, year, filename) {
  if (!Array.isArray(report?.pages) || !report.pages.length || report.pages.length > 60) {
    throw new Error('The enrolment summary must contain between 1 and 60 pages.');
  }
  const entries = [], seen = new Set();
  let course = null, printDate;
  for (const page of report.pages) {
    const items = page.items;
    if (!Array.isArray(items) || !items.some(item => item.text === 'NZQA Enrolments by Subject') ||
        !['Students', 'Enrolled', 'Published'].every(text => items.some(item => item.text === text)) ||
        !items.some(item => item.y < 40 && /^\d{2}\/\d{2}\/\d{4}$/.test(item.text) &&
          Number(item.text.slice(-4)) === year)) {
      throw new Error('The NZQA enrolment summary headings or print year could not be verified.');
    }
    const printed = items.find(item => item.y < 40 && /^\d{2}\/\d{2}\/\d{4}$/.test(item.text)).text;
    if (printDate && printDate !== printed) throw new Error('The enrolment summary mixes print dates.');
    printDate = printed;
    if (filename) {
      const stamp = /^TopicsSubjectEntries_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.pdf$/i.exec(filename);
      if (!stamp || printed !== stamp[3] + '/' + stamp[2] + '/' + stamp[1] ||
          Number(stamp[4]) > 23 || Number(stamp[5]) > 59 || Number(stamp[6]) > 59) {
        throw new Error('The enrolment PDF export filename does not match its print date.');
      }
    }
    if (items.some(item => item.x < 35 && /^(?:A|U)\.S\./.test(item.text) &&
      !/^(?:A|U)\.S\. \d+ v\d+$/.test(item.text))) {
      throw new Error('An enrolment standard number or version is unreadable.');
    }
    const anchors = items.filter(item =>
      (Math.abs(item.x - 24) < 1 && /^[A-Z0-9]+$/.test(item.text) ||
        item.x < 35 && /^(?:A|U)\.S\. \d+ v\d+$/.test(item.text)))
      .sort((a, b) => b.y - a.y);
    for (const anchor of anchors) {
      const line = items.filter(item => Math.abs(item.y - anchor.y) < 1);
      if (Math.abs(anchor.x - 24) < 1) {
        const title = line.find(item => item.x > 100 && item.x < 150)?.text;
        const department = line.find(item => item.x > 550 && item.x < 710)?.text;
        if (!title || !department) throw new Error('An enrolment course heading is incomplete.');
        course = { course: anchor.text, title, department };
        continue;
      }
      if (!course) throw new Error('A standard has no verified course heading.');
      const match = /^(A|U)\.S\. (\d+) v(\d+)$/.exec(anchor.text);
      const count = (left, right) => {
        const cells = line.filter(item => item.x >= left && item.x < right);
        if (!cells.length) return null;
        if (cells.length !== 1 || !/^\d+$/.test(cells[0].text)) throw new Error('An enrolment count is unreadable.');
        const value = Number(cells[0].text);
        if (!Number.isSafeInteger(value)) throw new Error('An enrolment count is out of range.');
        return value;
      };
      const entry = { ...course, kind: match[1] === 'A' ? 'achievement' : 'unit',
        number: match[2], version: match[3], students: count(595, 655),
        enrolled: count(665, 720), published: count(725, 790) };
      const key = [entry.course, entry.kind, entry.number, entry.version].join(':');
      if (seen.has(key)) throw new Error('The enrolment summary contains a duplicate course and standard: ' + key + '.');
      seen.add(key);
      if (/^1[123]/.test(entry.course)) entries.push(entry);
    }
  }
  if (!entries.length) throw new Error('The summary contains no senior standards.');
  return entries;
}

module.exports = { parseStudentsAuditEnrolments };
