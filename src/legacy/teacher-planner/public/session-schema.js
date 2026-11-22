((root) => {
  const slots = [
    ['whanau', 'Wh\u0101nau', '08:45', '09:00'],
    ['p1', 'Period 1', '09:00', '10:00'],
    ['p2', 'Period 2', '10:00', '11:00'],
    ['p3', 'Period 3', '11:20', '12:20'],
    ['p4', 'Period 4', '12:20', '13:20'],
    ['p5', 'Period 5', '14:00', '15:00']
  ];
  const types = ['teaching', 'whanau', 'observation', 'meeting', 'duty'];
  const validSlot = value => typeof value === 'string' && (slots.some(slot => slot[0] === value) ||
    /^manual-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value));
  const dateOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Pacific/Auckland' };
  const dateLabel = value => new Intl.DateTimeFormat('en-NZ', dateOptions)
    .format(new Date(value + 'T00:00:00Z')).replace(/,/g, '');
  const timestampLabel = value => new Intl.DateTimeFormat('en-NZ', { ...dateOptions, hour: 'numeric', minute: '2-digit' })
    .format(new Date(value)).replace(/,/g, '');
  const schema = { slots, types, validSlot, dateLabel, timestampLabel };
  if (typeof module === 'object' && module.exports) module.exports = schema;
  else root.plannerSessionSchema = schema;
})(globalThis);
