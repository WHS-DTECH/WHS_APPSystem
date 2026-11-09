const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const PERIODS = ['p1_1', 'p1_2', 'p2', 'i', 'p3', 'p4', 'l', 'p5'];
const STUDENT_PERIOD_KEYS = DAYS.flatMap(day => PERIODS.map(period => day + '_' + period));
const STUDENT_KEYS = ['student_name', 'id_number', 'form_class', 'year_level', ...STUDENT_PERIOD_KEYS];
const aliases = {
  student_name: ['studentname', 'name'],
  id_number: ['idnumber', 'studentid', 'id'],
  form_class: ['formclass', 'form', 'class'],
  year_level: ['yearlevel', 'year'],
  email_school: ['studentemailschool', 'studentemail', 'emailschool', 'email', 'schoolemail']
};
const normalize = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

function buildStudentHeaderMap(headers) {
  const targets = new Map(STUDENT_KEYS.map(key => [normalize(key), key]));
  const occurrences = new Map(), result = new Map();
  headers.forEach((header, index) => {
    const key = normalize(header);
    let target = targets.get(key);
    if (!target && /^(mon|tue|wed|thu|fri)p1$/.test(key)) {
      const count = (occurrences.get(key) || 0) + 1;
      occurrences.set(key, count);
      if (count > 2) throw new Error('Student timetable has more than two P1 columns for a day.');
      target = key.slice(0, 3) + '_p1_' + count;
    }
    if (!target) target = Object.keys(aliases).find(name => aliases[name].includes(key));
    if (target) {
      result.set(index, target);
    }
  });
  return result;
}
function mapStudentRow(row, headerMap) {
  const mapped = Object.fromEntries(STUDENT_KEYS.map(key => [key, '']));
  for (const [index, key] of headerMap) mapped[key] = String(row[index] || '').trim();
  return mapped;
}
module.exports = { STUDENT_PERIOD_KEYS, STUDENT_KEYS, buildStudentHeaderMap, mapStudentRow };
