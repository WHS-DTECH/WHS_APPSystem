function departmentDirectory(rows, staff) {
  const normal = value => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const departments = new Map();
  function department(name) {
    name = name.trim();
    const key = normal(name);
    if (!departments.has(key)) departments.set(key, { name, leaders: [] });
    return departments.get(key);
  }
  for (const row of rows) {
    for (const name of [row.department, ...(row.departments_comma || '').split(',')].filter(value => value?.trim())) department(name);
    for (const role of row.leadership_roles) {
      if (!role.department || !['HOL', 'HOLA', 'TIC'].includes(role.role)) throw new Error('Invalid department leadership data.');
      const matches = staff.filter(person => normal(person.first_name) === normal(row.first_name) &&
        normal(person.last_name) === normal(row.last_name));
      const person = matches.length === 1 ? matches[0] : row;
      const name = [person.first_name?.trim(), person.last_name?.trim()].filter(Boolean).join(' ') +
        (matches.length === 1 && person.code?.trim() ? ' (' + person.code.trim() + ')' : '');
      department(role.department).leaders.push({ name, role: role.role, acting: Boolean(role.acting),
        onLeave: Boolean(role.onLeave), source: role.source, reviewedOn: role.reviewedOn });
    }
  }
  return [...departments.values()].sort((a, b) => a.name.localeCompare(b.name, 'en-NZ')).map(item => {
    const available = item.leaders.filter(leader => !leader.onLeave);
    const acting = available.filter(leader => leader.acting);
    const candidates = acting.length ? acting : available;
    return { ...item, teacher: candidates.length === 1 ? candidates[0].name : '' };
  });
}
async function loadDepartments(dbQuery, staff) {
  const result = await dbQuery(`SELECT first_name,last_name,department,departments_comma,leadership_roles
    FROM public.department ORDER BY id`);
  return departmentDirectory(result.rows, staff);
}
module.exports = { departmentDirectory, loadDepartments };
