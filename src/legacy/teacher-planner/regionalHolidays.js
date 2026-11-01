const regions = require('./public/holiday-regions');

function selectRegionalHolidays(calendar, region) {
  if (!regions.includes(region)) throw new Error('The saved anniversary region is invalid. Choose your region in Setup Planner.');
  const national = (calendar.publicHolidays || []).filter(item => !/Anniversary Day/i.test(item.name));
  const regional = calendar.regionalAnniversaries?.filter(item => item.region === region);
  // Older Global Control deployments provide only Westland; keep that selection compatible.
  if (!regional && region === 'Westland') return { ...calendar, anniversaryRegion: region };
  if (!regional?.length) return { ...calendar, publicHolidays: national, anniversaryRegion: region,
    publicHolidaysError: [calendar.publicHolidaysError, 'Anniversary dates for ' + region + ' are unavailable for this year. Retry shortly.'].filter(Boolean).join(' ') };
  return { ...calendar, publicHolidays: [...national, ...regional.map(({ date, name }) => ({ date, name }))], anniversaryRegion: region };
}

module.exports = { selectRegionalHolidays };
