const DATE_FIELDS = ['teacherFirstDay', 'studentFirstDay',
  ...Array.from({ length: 4 }, (_, index) => ['term' + (index + 1) + 'Start', 'term' + (index + 1) + 'End']).flat()];
const EVENT_KINDS = ['opening', 'teacherOnly', 'closure'];

function validSettings(year, content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)
    || Object.keys(content).some(key => ![...DATE_FIELDS, 'events'].includes(key))) return false;
  function validDate(value) {
    if (typeof value !== 'string') return false;
    if (value === '') return true;
    if (!new RegExp(`^${year}-\\d{2}-\\d{2}$`).test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  if (DATE_FIELDS.some(key => content[key] !== undefined && !validDate(content[key]))) return false;
  let previousDate;
  for (let term = 1; term <= 4; term++) {
    const start = content['term' + term + 'Start'];
    const end = content['term' + term + 'End'];
    if (start && previousDate && start <= previousDate) return false;
    if (start) previousDate = start;
    if (end && previousDate && end < previousDate) return false;
    if (end) previousDate = end;
  }
  if (content.events !== undefined) {
    if (!Array.isArray(content.events) || content.events.length > 80) return false;
    for (const event of content.events) {
      if (!event || typeof event !== 'object' || Array.isArray(event)
        || Object.keys(event).some(key => !['date', 'kind', 'label', 'details'].includes(key))
        || !event.date || !validDate(event.date) || !EVENT_KINDS.includes(event.kind)
        || typeof event.label !== 'string' || !event.label.trim() || event.label.length > 200
        || typeof event.details !== 'string' || event.details.length > 4000) return false;
    }
  }
  return Buffer.byteLength(JSON.stringify(content)) <= 300000;
}

module.exports = { DATE_FIELDS, validSettings };
