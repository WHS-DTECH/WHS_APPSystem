(function () {
  const TERMS = [
    { name: 'Term 1 2026', start: '2026-01-26', end: '2026-04-02' },
    { name: 'Term 2 2026', start: '2026-04-20', end: '2026-07-03' },
    { name: 'Term 3 2026', start: '2026-07-20', end: '2026-09-25' },
    { name: 'Term 4 2026', start: '2026-10-12', end: '2026-12-18' },

    { name: 'Term 1 2027', start: '2027-01-28', end: '2027-04-09' },
    { name: 'Term 2 2027', start: '2027-04-27', end: '2027-07-02' },
    { name: 'Term 3 2027', start: '2027-07-19', end: '2027-09-24' },
    { name: 'Term 4 2027', start: '2027-10-11', end: '2027-12-17' },

    { name: 'Term 1 2028', start: '2028-01-31', end: '2028-04-13' },
    { name: 'Term 2 2028', start: '2028-05-01', end: '2028-07-07' },
    { name: 'Term 3 2028', start: '2028-07-24', end: '2028-09-29' },
    { name: 'Term 4 2028', start: '2028-10-16', end: '2028-12-15' }
  ];

  const SCHOOL_HOLIDAYS = [
    { name: 'Term 1 holidays 2026', start: '2026-04-03', end: '2026-04-19' },
    { name: 'Term 2 holidays 2026', start: '2026-07-04', end: '2026-07-19' },
    { name: 'Term 3 holidays 2026', start: '2026-09-26', end: '2026-10-11' },
    { name: 'Summer holidays 2026/2027', start: '2026-12-19', end: '2027-01-27' },

    { name: 'Term 1 holidays 2027', start: '2027-04-10', end: '2027-04-26' },
    { name: 'Term 2 holidays 2027', start: '2027-07-03', end: '2027-07-18' },
    { name: 'Term 3 holidays 2027', start: '2027-09-25', end: '2027-10-10' },
    { name: 'Summer holidays 2027/2028', start: '2027-12-18', end: '2028-01-30' },

    { name: 'Term 1 holidays 2028', start: '2028-04-14', end: '2028-04-30' },
    { name: 'Term 2 holidays 2028', start: '2028-07-08', end: '2028-07-23' },
    { name: 'Term 3 holidays 2028', start: '2028-09-30', end: '2028-10-15' },
    { name: 'Summer holidays 2028/2029', start: '2028-12-16', end: '2029-01-31' }
  ];

  const PUBLIC_HOLIDAYS = [
    { date: '2026-02-06', name: 'Waitangi Day' },
    { date: '2026-04-03', name: 'Good Friday' },
    { date: '2026-04-06', name: 'Easter Monday' },
    { date: '2026-04-27', name: 'Anzac Day observed' },
    { date: '2026-06-01', name: "King's Birthday" },
    { date: '2026-07-10', name: 'Matariki' },
    { date: '2026-10-26', name: 'Labour Day' },

    { date: '2027-02-08', name: 'Waitangi Day observed' },
    { date: '2027-03-26', name: 'Good Friday' },
    { date: '2027-03-29', name: 'Easter Monday' },
    { date: '2027-04-26', name: 'Anzac Day observed' },
    { date: '2027-06-07', name: "King's Birthday" },
    { date: '2027-06-25', name: 'Matariki' },
    { date: '2027-10-25', name: 'Labour Day' },

    { date: '2028-02-07', name: 'Waitangi Day observed' },
    { date: '2028-04-14', name: 'Good Friday' },
    { date: '2028-04-17', name: 'Easter Monday' },
    { date: '2028-04-25', name: 'Anzac Day' },
    { date: '2028-06-05', name: "King's Birthday" },
    { date: '2028-07-14', name: 'Matariki' },
    { date: '2028-10-23', name: 'Labour Day' }
  ];

  const ADDITIONAL_SCHOOL_CLOSED_DAYS = [
    { date: '2026-04-07', name: 'Easter Tuesday (school holiday)' },
    { date: '2027-03-30', name: 'Easter Tuesday (school holiday)' },
    { date: '2028-04-18', name: 'Easter Tuesday (school holiday)' }
  ];

  function normalizeIsoDate(value) {
    const str = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return '';
    return str;
  }

  function inRange(isoDate, start, end) {
    return isoDate >= start && isoDate <= end;
  }

  function findRangeMatch(ranges, isoDate) {
    for (const range of ranges) {
      if (inRange(isoDate, range.start, range.end)) return range;
    }
    return null;
  }

  function findDateMatch(days, isoDate) {
    for (const day of days) {
      if (day.date === isoDate) return day;
    }
    return null;
  }

  function getDateInfo(isoDate) {
    const iso = normalizeIsoDate(isoDate);
    if (!iso) {
      return {
        iso: '',
        valid: false,
        inTerm: false,
        termName: '',
        isSchoolHoliday: false,
        schoolHolidayName: '',
        isPublicHoliday: false,
        publicHolidayName: '',
        isAdditionalSchoolClosedDay: false,
        additionalSchoolClosedDayName: '',
        isWeekend: false,
        isSchoolClosed: false,
        tags: []
      };
    }

    const parsed = new Date(`${iso}T00:00:00`);
    const isWeekend = parsed.getDay() === 0 || parsed.getDay() === 6;

    const term = findRangeMatch(TERMS, iso);
    const schoolHoliday = findRangeMatch(SCHOOL_HOLIDAYS, iso);
    const publicHoliday = findDateMatch(PUBLIC_HOLIDAYS, iso);
    const extraClosedDay = findDateMatch(ADDITIONAL_SCHOOL_CLOSED_DAYS, iso);

    const info = {
      iso,
      valid: true,
      inTerm: !!term,
      termName: term ? term.name : '',
      isSchoolHoliday: !!schoolHoliday,
      schoolHolidayName: schoolHoliday ? schoolHoliday.name : '',
      isPublicHoliday: !!publicHoliday,
      publicHolidayName: publicHoliday ? publicHoliday.name : '',
      isAdditionalSchoolClosedDay: !!extraClosedDay,
      additionalSchoolClosedDayName: extraClosedDay ? extraClosedDay.name : '',
      isWeekend,
      isSchoolClosed: false,
      tags: []
    };

    if (info.termName) info.tags.push(info.termName);
    if (info.schoolHolidayName) info.tags.push(info.schoolHolidayName);
    if (info.publicHolidayName) info.tags.push(info.publicHolidayName);
    if (info.additionalSchoolClosedDayName) info.tags.push(info.additionalSchoolClosedDayName);

    info.isSchoolClosed = !!(
      info.isWeekend ||
      info.isSchoolHoliday ||
      info.isPublicHoliday ||
      info.isAdditionalSchoolClosedDay
    );

    return info;
  }

  window.NZSchoolCalendar = {
    source: 'Ministry of Education NZ school terms and holidays',
    years: [2026, 2027, 2028],
    terms: TERMS.slice(),
    schoolHolidays: SCHOOL_HOLIDAYS.slice(),
    publicHolidays: PUBLIC_HOLIDAYS.slice(),
    additionalSchoolClosedDays: ADDITIONAL_SCHOOL_CLOSED_DAYS.slice(),
    getDateInfo
  };
})();
