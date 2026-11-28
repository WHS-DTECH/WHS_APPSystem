function reconcileSeniorAudit({ roster, reports, entries, workbookConfirmed, sourcesComplete, decisions = [], automaticNotEnrolled = false }) {
  const normal = value => String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
  const normalGrade = value => ['not yet assessed', 'not entered', ''].includes(normal(value)) ? '' : normal(value);
  const courseOf = entry => entry.Module_Enrol.split(/_x000B_|[\r\n\v]/i)[0].trim().toUpperCase();
  const uncertain = new Set([...(roster.ambiguousIds || []), ...(roster.conflictingYearIds || [])]);
  const decisionMap = new Map(decisions.map(item =>
    [JSON.stringify([item.student_id, item.standard_number, item.standard_version]), item]));
  const enrolmentIssues = new Set([
    'No uniquely matched PDF result was found.',
    'This student is not in the matched PDF. Check enrolment for this standard.'
  ]);
  const grouped = new Map();
  for (const group of roster.groups.filter(item => item.term === null)) {
    const line = /^1[123](?:DTECH|COMP)$/.test(group.course)
      ? /^(\d+|JSR)-(?:11|12|13|SR)(?:DTECH|COMP)$/.exec(group.classCode)?.[1] : undefined;
    const key = JSON.stringify([group.staffCode, group.course, line ? 'line:' + line : 'class:' + group.classCode]);
    if (!grouped.has(key)) grouped.set(key, { ...group, students: [] });
    const merged = grouped.get(key);
    if (line && group.classCode === line + '-' + group.course) merged.classCode = group.classCode;
    for (const person of group.students) {
      const previous = merged.students.find(student => student.id === person.id);
      if (previous && normal(previous.name) !== normal(person.name)) uncertain.add(person.id);
      if (!previous) merged.students.push(person);
    }
  }
  const groups = [...grouped.values()];
  const teacherCodes = new Set([...(roster.teachers || []), ...groups].map(teacher => teacher.staffCode));
  const unresolvedByTeacher = Object.create(null);
  const output = groups.map(group => ({ teacher: group.teacher, staffCode: group.staffCode,
    classCode: group.classCode, course: group.course, markbooks: [] }));
  const entriesByStudentStandard = new Map();
  for (const entry of entries) {
    const key = entry.zi_IDNumber + ':' + entry.Number_AsNum;
    if (!entriesByStudentStandard.has(key)) entriesByStudentStandard.set(key, []);
    entriesByStudentStandard.get(key).push(entry);
  }
  const seen = new Set();
  let unresolved = 0;
  const unresolvedReasons = { noRoster: 0, multiple: 0, uncertain: 0 };
  for (const { report, file } of reports) {
    const markbooks = new Map();
    const unmatched = new Map();
    const unmatchedWithoutRoster = [];
    for (const row of report.rows) {
      let candidates = groups.flatMap((group, index) =>
        group.course === report.course && (!row.teachers.length || row.teachers.includes(group.staffCode))
          ? group.students.filter(person => normal(person.name) === normal(row.name))
            .map(person => ({ index, person })) : []);
      let teacherMismatch = false;
      if (!candidates.length && row.teachers.length) {
        const byName = groups.flatMap((group, index) =>
          group.course === report.course ? group.students.filter(person => normal(person.name) === normal(row.name))
            .map(person => ({ index, person })) : []);
        if (byName.length === 1) { candidates = byName; teacherMismatch = true; }
      }
      if (candidates.length !== 1 || uncertain.has(candidates[0]?.person.id)) {
        unresolved++;
        if (!candidates.length) unresolvedReasons.noRoster++;
        else if (candidates.length > 1) unresolvedReasons.multiple++;
        else unresolvedReasons.uncertain++;
        if (!candidates.length) unmatchedWithoutRoster.push(row);
        for (const index of new Set(candidates.map(candidate => candidate.index))) {
          if (!markbooks.has(index)) markbooks.set(index, []);
          unmatched.set(index, (unmatched.get(index) || 0) + 1);
        }
        continue;
      }
      const { index, person } = candidates[0];
      if (!markbooks.has(index)) markbooks.set(index, []);
      const matching = entriesByStudentStandard.get(person.id.slice(2) + ':' + report.number) || [];
      const exact = matching.filter(entry => entry.Version === report.version);
      const issues = [];
      if (teacherMismatch) issues.push('PDF teacher code differs from the linked roster teacher.');
      if (matching.some(entry => entry.Version !== report.version)) issues.push('A different standard version is listed in the workbook.');
      if (exact.length > 1) issues.push('Multiple matching workbook entries.');
      const entry = exact[0];
      if (entry && courseOf(entry) !== report.course) issues.push('Workbook course differs from the PDF class.');
      if (entry && normal(entry.zc_Stu_Name_Last_First_Preferred) !== normal(person.name)) {
        issues.push('Workbook student name differs from the linked roster.');
      }
      if (entry?.Teacher_Markbook && entry.Teacher_Markbook.toUpperCase() !== groups[index].staffCode) {
        issues.push('Workbook teacher differs from the linked teacher.');
      }
      const sheetGrade = entry?.zc_Result_Markbook || '';
      if (entry && normalGrade(sheetGrade) && normalGrade(sheetGrade) !== normalGrade(row.status)) {
        issues.push('PDF and workbook results differ.');
      }
      let state = 'not checked';
      if (!row.grade) state = 'outstanding';
      else if (!issues.length && sourcesComplete && !roster.unavailableClassCount) {
        state = entry && !normalGrade(sheetGrade) ? 'updated' : 'sorted';
      }
      markbooks.get(index).push({ id: person.id, name: person.name, result: row.grade || 'No grade',
        workbookResult: entry?.zc_Result_Markbook || '', workbookStatus: entry?.zc_Result_Printouts || '',
        state, issues, matchedEntries: exact });
    }
    for (const row of unmatchedWithoutRoster) for (const index of markbooks.keys()) {
      if (!row.teachers.length || row.teachers.includes(groups[index].staffCode)) {
        unmatched.set(index, (unmatched.get(index) || 0) + 1);
      }
    }
    for (const [index, students] of markbooks) {
      output[index].markbooks.push({ number: report.number, version: report.version, title: report.title,
        level: ['1', '2', '3'].includes(report.level) ? report.level : '',
        kind: report.kind, printed: report.printed, url: 'https://drive.google.com/file/d/' + file.id + '/view',
        modifiedTime: file.modifiedTime || '', students, unmatched: unmatched.get(index) || 0 });
    }
  }
  for (const group of output) {
    const byStandard = new Map();
    for (const book of group.markbooks) {
      if (!byStandard.has(book.number)) byStandard.set(book.number, []);
      byStandard.get(book.number).push(book);
    }
    group.markbooks = [];
    for (const books of byStandard.values()) {
      let selected = books;
      if (books.length > 1) {
        const validTimes = books.every(book => Number.isFinite(Date.parse(book.modifiedTime)));
        const latest = validTimes ? Math.max(...books.map(book => Date.parse(book.modifiedTime))) : NaN;
        const newest = books.filter(book => Date.parse(book.modifiedTime) === latest);
        if (newest.length === 1) {
          const current = newest[0];
          current.olderReportWarning = books.some(book => book !== current &&
            (book.unmatched || book.students.some(row =>
              row.issues.includes('PDF teacher code differs from the linked roster teacher.') ||
              !current.students.some(candidate => candidate.id === row.id))));
          selected = [current];
        } else {
          const versions = new Map();
          for (const book of books) {
            if (!versions.has(book.version)) versions.set(book.version, []);
            versions.get(book.version).push(book);
          }
          selected = [...versions.values()].map(sameVersion => {
            const students = new Map();
            for (const book of sameVersion) for (const row of book.students) {
              if (!students.has(row.id)) students.set(row.id, { ...row, result: 'Not checked', state: 'not checked',
                issues: ['Multiple reports could not be safely ordered.'], matchedEntries: [], conflictGrade: false });
              const student = students.get(row.id);
              student.matchedEntries.push(...row.matchedEntries);
              student.conflictGrade = student.conflictGrade || !['No grade', 'Not checked'].includes(row.result);
            }
            return { ...sameVersion[0], url: '', modifiedTime: '', conflict: true,
              level: sameVersion.every(book => book.level === sameVersion[0].level) ? sameVersion[0].level : '',
              sources: sameVersion.map(book => ({ url: book.url, modifiedTime: book.modifiedTime })),
              unmatched: Math.max(...sameVersion.map(book => book.unmatched)), students: [...students.values()] };
          });
        }
      }
      selected.forEach(book => {
        book.students.forEach(row => {
          row.matchedEntries.forEach(entry => seen.add(entry));
          delete row.matchedEntries;
        });
        group.markbooks.push(book);
      });
    }
  }
  let unresolvedWorkbook = 0;
  for (const entry of entries) {
    if (seen.has(entry)) continue;
    const course = courseOf(entry), id = 'k:' + entry.zi_IDNumber;
    const candidates = groups.flatMap((group, index) => group.course === course &&
      group.students.some(person => person.id === id) ? [index] : []);
    const teacherCode = entry.Teacher_Markbook.trim().toUpperCase();
    const matchingTeacher = candidates.filter(index => groups[index].staffCode === teacherCode);
    if ((candidates.length || teacherCodes.has(teacherCode)) && (matchingTeacher.length !== 1 || uncertain.has(id))) {
      unresolvedWorkbook++;
      if (teacherCodes.has(teacherCode)) unresolvedByTeacher[teacherCode] = (unresolvedByTeacher[teacherCode] || 0) + 1;
      continue;
    }
    if (matchingTeacher.length !== 1) continue;
    const index = matchingTeacher[0], person = groups[index].students.find(student => student.id === id);
    let markbook = output[index].markbooks.find(item =>
      item.number === entry.Number_AsNum && item.version === entry.Version);
    if (!markbook) {
      markbook = { number: entry.Number_AsNum, version: entry.Version, title: entry.Title,
        level: ['1', '2', '3'].includes(entry.Level) ? entry.Level : '',
        kind: 'unknown', printed: '', url: '', students: [] };
      output[index].markbooks.push(markbook);
    }
    const issues = ['No uniquely matched PDF result was found.'];
    if (normal(entry.zc_Stu_Name_Last_First_Preferred) !== normal(person.name)) issues.push('Workbook student name differs from the linked roster.');
    markbook.students.push({ id: person.id, name: person.name, result: 'Not checked', workbookResult: entry.zc_Result_Markbook,
      workbookStatus: entry.zc_Result_Printouts, state: 'not checked',
      issues });
  }
  const graded = new Set();
  for (const group of output) for (const book of group.markbooks) for (const person of book.students) {
    if (person.conflictGrade || !['No grade', 'Not checked'].includes(person.result) || normalGrade(person.workbookResult)) {
      graded.add(JSON.stringify([person.id, book.number, book.version]));
    }
  }
  for (const entry of entries) if (normalGrade(entry.zc_Result_Markbook)) {
    graded.add(JSON.stringify(['k:' + entry.zi_IDNumber, entry.Number_AsNum, entry.Version]));
  }
  output.forEach((group, index) => {
    for (const book of group.markbooks) {
      book.workbookListed = workbookConfirmed && entries.some(entry => entry.Number_AsNum === book.number &&
        courseOf(entry) === group.course && (entry.Teacher_Markbook.trim().toUpperCase() === group.staffCode ||
          groups[index].students.some(person => person.id === 'k:' + entry.zi_IDNumber)));
      const covered = new Set(book.students.map(person => person.id));
      for (const person of groups[index].students) {
        if (!covered.has(person.id)) book.students.push({ id: person.id, name: person.name, result: 'Not checked',
          workbookResult: '', workbookStatus: '', state: 'not checked',
          issues: ['This student is not in the matched PDF. Check enrolment for this standard.'] });
      }
      book.students.forEach(person => {
        const decision = decisionMap.get(JSON.stringify([person.id, book.number, book.version]));
        person.baseState = person.state;
        person.baseIssues = [...person.issues];
        person.notEnrolled = Boolean(decision?.not_enrolled);
        person.decisionRevision = decision?.revision || 0;
        person.hasRecordedGrade = graded.has(JSON.stringify([person.id, book.number, book.version]));
        person.automaticNotEnrolled = Boolean(automaticNotEnrolled && workbookConfirmed && sourcesComplete &&
          !roster.unavailableClassCount && !decision && !book.workbookListed &&
          book.url && !book.conflict && person.id && !uncertain.has(person.id) &&
          !person.hasRecordedGrade && ['No grade', 'Not checked'].includes(person.result) &&
          person.issues.every(issue => enrolmentIssues.has(issue)));
        if (person.automaticNotEnrolled) person.notEnrolled = true;
        if (person.notEnrolled) {
          if (person.hasRecordedGrade) {
            person.issues.push('A recorded grade conflicts with the not-enrolled decision.');
            person.state = 'not checked';
          } else if (uncertain.has(person.id)) {
            person.issues.push('The KAMAR identity or class link is ambiguous.');
            person.state = 'not checked';
          } else {
            person.issues = person.issues.filter(issue => !enrolmentIssues.has(issue));
            person.state = person.issues.length ? 'not checked' : 'not enrolled';
          }
        }
        delete person.conflictGrade;
        if (uncertain.has(person.id)) delete person.id;
      });
    }
  });
  return { teachers: roster.teachers || [], groups: output, unresolved, unresolvedReasons, unresolvedWorkbook, unresolvedByTeacher, sourcesComplete, workbookConfirmed,
    unavailableClassCount: roster.unavailableClassCount || 0 };
}

module.exports = { reconcileSeniorAudit };
