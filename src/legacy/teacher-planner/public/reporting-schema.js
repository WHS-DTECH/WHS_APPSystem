(function (root) {
  'use strict';
  const programmes = {
    junior: { label: 'JuniorDTECH', years: ['7', '8'], levels: ['UAG', '3B', '3P', '3A', '4B', '4P', '4A'] },
    middle: { label: 'MiddleDTECH', years: ['9', '10'], levels: ['UAG', '4P', '4A', '5B', '5P', '5A', '6B'] }
  };
  const values = ['Dev', 'Dem', 'Exe'];
  const fields = ['studentId', 'programme', 'cycle', 'coding', 'design', 'kaitiakitanga', 'rangatiratanga', 'comment'];
  const juniorValues = [
    ['whanaungatanga', 'Whānaungatanga'], ['manaakitanga', 'Manaakitanga'],
    ['rangatiratanga', 'Rangatiratanga'], ['kaitiakitanga', 'Kaitiakitanga']
  ];
  function validRecords(records) {
    return Array.isArray(records) && records.length <= 1000 &&
      new Set(records.map(row => JSON.stringify([row?.studentId, row?.programme, row?.cycle]))).size === records.length &&
      records.every(row => row && typeof row === 'object' && !Array.isArray(row) &&
        fields.every(key => Object.hasOwn(row, key)) &&
        Object.keys(row).every(key => fields.includes(key) || ['whanaungatanga', 'manaakitanga'].includes(key)) &&
        typeof row.studentId === 'string' && /^k:[A-Za-z0-9_-]{1,60}$/.test(row.studentId) &&
        typeof row.programme === 'string' && Object.hasOwn(programmes, row.programme) && ['eoy', 'earlier'].includes(row.cycle) &&
        ['coding', 'design'].every(key => row[key] === '' || programmes[row.programme].levels.includes(row[key])) &&
        ['kaitiakitanga', 'rangatiratanga'].every(key => row[key] === '' || values.includes(row[key])) &&
        ['whanaungatanga', 'manaakitanga'].every(key => row[key] === undefined || row[key] === '' || values.includes(row[key])) &&
        typeof row.comment === 'string' && row.comment.length <= 2000);
  }
  function validContent(content) {
    if (!content || Object.keys(content).some(key => !['records', 'valuesDefault', 'juniorSloDefault'].includes(key)) ||
      (content.valuesDefault !== undefined && !['', 'Dem', 'Dem-v2'].includes(content.valuesDefault)) ||
      (content.juniorSloDefault !== undefined && !['', '3P'].includes(content.juniorSloDefault)) ||
      typeof content.records !== 'string' || content.records.length > 280000) return false;
    try { return validRecords(JSON.parse(content.records)) && new TextEncoder().encode(JSON.stringify(content)).length <= 300000; }
    catch { return false; }
  }
  function complete(row, cycle, term) {
    if (!row) return false;
    const slos = row.programme === 'junior' ? row.coding || row.design : row.coding && row.design;
    const schoolValues = row.programme === 'junior' ?
      row[juniorValues[Number(term) - 1]?.[0]] : row.kaitiakitanga && row.rangatiratanga;
    return Boolean(slos && schoolValues &&
      (cycle === 'eoy' || row.comment.trim()));
  }
  function classGroups(directory, programme) {
    const groups = directory.classes.filter(group => /DTECH/i.test(group.code)).map(group => ({
      code: group.code,
      students: group.students.filter(student => programmes[programme].years.includes(student.yearLevel))
        .sort((a, b) => a.name.localeCompare(b.name))
    })).filter(group => group.students.length);
    const rooms = groups.filter(group => /^VP-PIDTECH-(?:05|CW)$/i.test(group.code));
    if (!rooms.some(group => /^VP-PIDTECH-05$/i.test(group.code)) ||
        !rooms.some(group => /^VP-PIDTECH-CW$/i.test(group.code))) return groups;
    const students = new Map();
    for (const group of rooms) for (const student of group.students) {
      if (!students.has(student.id)) students.set(student.id, student);
    }
    const combined = { code: 'VP-PIDTECH', students: [...students.values()].sort((a, b) =>
      a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) };
    const first = groups.indexOf(rooms[0]);
    const remaining = groups.filter(group => !rooms.includes(group));
    remaining.splice(first, 0, combined);
    return remaining;
  }
  const schema = { programmes, values, juniorValues, validRecords, validContent, complete, classGroups };
  if (typeof module !== 'undefined' && module.exports) module.exports = schema;
  else root.plannerReportingSchema = schema;
})(globalThis);
