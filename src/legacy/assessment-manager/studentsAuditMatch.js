function matchStudentsAuditIdentities({ students, memberships, reports }) {
  const normal = value => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
  const people = new Map(students.map(person => [person.id, person]));
  const courses = new Map(memberships.map(membership => {
    const names = new Map();
    for (const id of new Set(membership.studentIds)) {
      const person = people.get(id);
      if (!person) throw new Error('A timetable course contains an unavailable student identity.');
      const key = normal(person.name);
      if (!names.has(key)) names.set(key, []);
      names.get(key).push(person);
    }
    return [membership.course, { course: membership.course, classCodes: membership.classCodes,
      studentCount: new Set(membership.studentIds).size, matchedRows: 0, unmatchedRows: 0, issues: [], names }];
  }));
  const grouped = new Map();
  for (const source of reports) {
    if (!courses.has(source.report.course)) continue;
    const { course, kind, number, rows } = source.report;
    const teachers = [...new Set(rows.flatMap(row => row.teachers || []))].sort();
    const key = JSON.stringify([course, kind, number, teachers]);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(source);
  }
  const evidence = [];
  for (const sources of grouped.values()) {
    let selected = sources;
    if (sources.length > 1 && sources.every(source => Number.isFinite(Date.parse(source.file.modifiedTime)))) {
      const latest = Math.max(...sources.map(source => Date.parse(source.file.modifiedTime)));
      selected = sources.filter(source => Date.parse(source.file.modifiedTime) === latest);
    }
    const conflict = selected.length !== 1;
    for (const { report, file } of selected) {
      const course = courses.get(report.course), matched = [];
      const url = 'https://drive.google.com/file/d/' + encodeURIComponent(file.id) + '/view';
      const rowNames = new Map();
      for (const row of report.rows) {
        const key = normal(row.name);
        rowNames.set(key, (rowNames.get(key) || 0) + 1);
      }
      let unmatched = 0;
      for (const row of report.rows) {
        const key = normal(row.name), candidates = course.names.get(key) || [];
        const duplicate = rowNames.get(key) !== 1;
        if (!conflict && !duplicate && candidates.length === 1) {
          matched.push({ id: candidates[0].id, name: candidates[0].name });
          course.matchedRows++;
        } else {
          unmatched++; course.unmatchedRows++;
          course.issues.push({ name: row.name, number: report.number, version: report.version, url,
            reason: conflict ? 'conflicting-pdfs' : duplicate ? 'duplicate-pdf-name' :
              candidates.length ? 'ambiguous-name' : 'not-in-course',
            otherCourses: [...courses.values()].filter(other => other !== course && other.names.has(key)).map(other => other.course) });
        }
      }
      evidence.push({ course: report.course, number: report.number, version: report.version, kind: report.kind,
        url, conflict, unmatched, students: matched });
    }
  }
  const identityMatching = [...courses.values()].map(({ names, ...course }) => course);
  return { evidence, identityMatching, unresolved: identityMatching.reduce((total, course) => total + course.unmatchedRows, 0) };
}

module.exports = { matchStudentsAuditIdentities };
