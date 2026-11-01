(() => {
  const openingDates2026 = {
    studentFirstDay: '2026-01-29',
    events: [
      { date: '2026-01-26', kind: 'opening', label: 'SLT planning day / new staff pōwhiri',
        details: 'SLT planning day. New staff pōwhiri at Arahura marae, 10 am.' },
      { date: '2026-01-27', kind: 'opening', label: 'New staff induction / HOLA planning',
        details: 'New staff induction and HOLA planning, 9 am; Learning Area hui in the afternoon. Fusion onsite from 9 am. School office and Chromebook reprovisioning 10 am–2 pm. APLs available for course confirmations from 1 pm.' },
      { date: '2026-01-28', kind: 'teacherOnly', label: 'WHS Teacher Only Day',
        details: '8.30 am–3.45 pm. School office open to the public 10 am–2 pm.' },
      { date: '2026-01-29', kind: 'opening', label: 'New students and Years 7, 8 and 9 start',
        details: 'Student leaders meet in the hall at 8 am. Current students go to whānau classes at 8.45 am. New students (including international students) and new staff meet in the library at 8.45 am for the 9 am pōwhiri. Principal addresses the school. Year 9 normal timetable begins period 3 at 11.20 am; Years 7 and 8 return to the hall for information.' },
      { date: '2026-01-30', kind: 'opening', label: 'Years 11, 12 and 13 start',
        details: 'Senior assembly in the hall, 8.45 am. Years 7, 8 and 9 in normal timetabled classes.' },
      { date: '2026-02-02', kind: 'opening', label: 'Year 10 starts',
        details: 'Year 10 assembly in the hall, 8.45 am. All other students in normal timetabled classes.' },
      { date: '2026-02-03', kind: 'opening', label: 'Full timetable for all year levels', details: 'Full timetabled day for all year levels.' },
      { date: '2026-02-06', kind: 'closure', label: 'Waitangi Day — school closed', details: '' }
    ]
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = openingDates2026;
  else globalThis.openingDates2026 = openingDates2026;
})();
