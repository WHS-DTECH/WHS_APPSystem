(() => {
  'use strict';
  const api = document.body.dataset.api;
  const assets = document.body.dataset.assets;
  const content = document.getElementById('planner-content');
  const selectors = document.getElementById('planner-selectors');
  const form = document.getElementById('planner-form');
  const status = document.getElementById('planner-status');
  const save = document.getElementById('save-planner');
  const retry = document.getElementById('retry-planner');
  const yearInput = document.getElementById('planner-year');
  const openYear = document.getElementById('open-year');
  function updateYearBadge() {
    const value = Number(yearInput.value);
    const displayed = Number.isInteger(value) && value >= 2000 && value <= 2100 ? value : year;
    document.getElementById('planner-year-badge-value').textContent = displayed;
    openYear.setAttribute('aria-label', 'Open planner year ' + displayed);
    openYear.setAttribute('title', 'Open planner year ' + displayed);
  }
  const signin = document.getElementById('planner-signin');
  const signinLink = document.getElementById('planner-signin-link');
  const ownerId = document.body.dataset.userId;
  const { standards, commitment, elaborations, reflectionGroups, learningTypes } = globalThis.plannerReference;
  const slots = [
    ['email', 'Taki īmēra | Email', '7:30-8:00'], ['whanau', 'Whānau class', '8:45-9:00'],
    ['p1', 'Akoranga 1', '9:00-10:00'], ['p2', 'Akoranga 2', '10:00-11:00'],
    ['interval', 'Paramanawa | Interval', '11:00-11:20'], ['p3', 'Akoranga 3', '11:20-12:20'],
    ['p4', 'Akoranga 4', '12:20-13:20'], ['lunch', 'Tina | Lunch', '13:20-14:00'],
    ['p5', 'Akoranga 5', '14:00-15:00'], ['meetings', 'I muri i ngā hui mahi | after work meetings', '15:10-22:00'], ['away', 'Tamō atu i te mahi | away from work', '']
  ];
  const fields = {
    period: [['title', 'Period plan title', 'text'], ['priorities', 'Priorities / learning intentions'],
      ['activities', 'Activities / time breakdown'], ['resources', 'Resource links', '', 'Choose files from Drive, or use Edit resource links to paste, rename or remove links.'],
      ['reflection', 'Reflection / next steps']],
    activity: [['title', 'Activity title', 'text'], ['priorities', 'Learning intentions'],
      ['instructions', 'Activity instructions / notes'], ['lessonPlans', 'Lesson plans / teaching notes'],
      ['resources', 'Resource links', '', 'Choose files from Drive, or paste named resource links.'], ['reflection', 'Reflection / next steps']],
    week: [['focus', 'Tāku aronga | My focus'], ['reflection', 'Pātai huritao | Reflection'], ['whakatauki', 'Whakataukī'], ['vocabulary', 'Kupu / rerenga kupu | Words and phrases'], ['value', 'Uara | Value'], ['notes', 'Ōku whakamahara | Notes'], ['calls', 'Waea waea | phone calls:'], ['notices', 'Pānui | Notices'], ['todos', 'Hei mahi māku | To do']],
    year: [['startOfYear', 'Start-of-year information'], ['importantDates', 'Important dates'], ['priorities', 'Top three priorities'], ['pepeha', 'Pepeha / personal introduction']],
    term: [['startDate', 'Term start date', 'date'], ['endDate', 'Term end date', 'date'], ['information', 'Start-of-term information'], ['priorities', 'Term priorities'], ['reflection', 'Term reflection']],
    goals: [['professional', 'Professional goals'], ['wellbeing', 'Wellbeing goals'], ['standards', 'Teaching standards and evidence'], ['reflection', 'Reflection and next steps']],
    standards: [],
    assessmentSetup: [],
    attendance: [],
    attendanceImport: [],
    moderation: [],
    setup: [],
    learning: [['entries', 'Professional learning log', '', 'Record dates, learning activities, evidence links, reflections and next steps.']]
  };
  let year = 2026, section = 'cover', term = '1', csrf, revision = 0, dirty = false, busy = false, loaded = false;
  let pendingPrint = false;
  let autosaveTimer, autosavePaused = false, editVersion = 0, savedTermContent = {};
  let saveInFlight;
  let periodDate = '', periodSlot = 'p1', selectedDay = 0, invalidPeriodLink = false;
  let activityRecord = '';
  let canManageSchoolSettings = false;
  let setupTab = 0;
  let setupAttendanceReady;
  let moderationRecord = '', moderationPage = 'overview';
  const setupDates = [
    ['teacherFirstDay', 'Teacher first day'], ['studentFirstDay', 'First student start date (earliest cohort)'],
    ...Array.from({ length: 4 }, (_, index) => [
      ['term' + (index + 1) + 'Start', 'Term ' + (index + 1) + ' start'],
      ['term' + (index + 1) + 'End', 'Term ' + (index + 1) + ' end']
    ]).flat()
  ];
  const eventKinds = { opening: 'Opening / year-level start', teacherOnly: 'Teacher-only day', closure: 'School closure' };
  let calendarEventSources = {};
  let selectedCalendarDate = '';
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const date = (value) => new Date(value + 'T00:00:00Z');
  function iso(value) { return value.toISOString().slice(0, 10); }
  function monday(value) {
    const result = date(value);
    result.setUTCDate(result.getUTCDate() - (result.getUTCDay() + 6) % 7);
    return iso(result);
  }
  let week = monday(localDate.startsWith('2026') ? localDate : '2026-01-05');
  const restored = new URLSearchParams(location.hash.slice(1));
  if (/^[0-6]$/.test(restored.get('setupTab') || '')) setupTab = Number(restored.get('setupTab'));
  if (/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(restored.get('activity') || '')) activityRecord = restored.get('activity');
  let openingTermPending = !['cover', ...Object.keys(fields)].includes(restored.get('section'));
  if (openingTermPending) year = Number(localDate.slice(0, 4));
  if (['cover', ...Object.keys(fields)].includes(restored.get('section'))) section = restored.get('section');
  if (/^\d{4}$/.test(restored.get('year') || '') && Number(restored.get('year')) >= 2000 && Number(restored.get('year')) <= 2100) year = Number(restored.get('year'));
  if (/^[1-4]$/.test(restored.get('term') || '')) term = restored.get('term');
  let termSelectionPending = !/^[1-4]$/.test(restored.get('term') || '');
  if (/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(restored.get('record') || '')) moderationRecord = restored.get('record');
  if (['overview', 'internal', 'schedule', 'feedback', 'coversheet'].includes(restored.get('page'))) moderationPage = restored.get('page');
  const restoredPeriod = restored.get('date') || '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(restoredPeriod) && Number.isFinite(date(restoredPeriod).getTime()) &&
      iso(date(restoredPeriod)) === restoredPeriod && Number(restoredPeriod.slice(0, 4)) >= 2000 &&
      Number(restoredPeriod.slice(0, 4)) <= 2100 && [1, 2, 3, 4, 5].includes(date(restoredPeriod).getUTCDay()) &&
      /^p[1-5]$/.test(restored.get('slot') || '')) {
    periodDate = restoredPeriod; periodSlot = restored.get('slot');
  } else if (['period', 'activity'].includes(section)) { section = 'week'; invalidPeriodLink = true; }
  if (section === 'activity' && !activityRecord) { section = 'period'; invalidPeriodLink = true; }
  const restoredWeek = restored.get('week');
  if (/^\d{4}-\d{2}-\d{2}$/.test(restoredWeek || '') && Number.isFinite(date(restoredWeek).getTime())
    && iso(date(restoredWeek)) === restoredWeek && date(restoredWeek).getUTCDay() === 1) {
    const last = date(restoredWeek); last.setUTCDate(last.getUTCDate() + 6);
    if (Number(restoredWeek.slice(0, 4)) === year || last.getUTCFullYear() === year) week = restoredWeek;
  }
  selectedDay = /^[0-4]$/.test(restored.get('day') || '') ? Number(restored.get('day')) :
    monday(localDate) === week ? Math.min(4, (date(localDate).getUTCDay() + 6) % 7) : 0;
  if (['period', 'activity'].includes(section)) {
    week = monday(periodDate);
    const last = date(week); last.setUTCDate(last.getUTCDate() + 6);
    if (Number(week.slice(0, 4)) !== year && last.getUTCFullYear() !== year) year = Number(periodDate.slice(0, 4));
    selectedDay = (date(periodDate).getUTCDay() + 6) % 7;
  }
  yearInput.value = year;
  updateYearBadge();
  yearInput.addEventListener('input', updateYearBadge);
  const el = (tag, text, attrs = {}) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  function notice(message, error = false) {
    status.setAttribute('role', error ? 'alert' : 'status');
    status.textContent = message;
  }
  function key() { return section === 'activity' ? activityRecord : section === 'moderation' ? moderationRecord || 'main' : section === 'period' ? periodDate + '_' + periodSlot : section === 'week' ? week : section === 'term' ? term : 'main'; }
  function address() { return section === 'setup' ? api + 'school-settings/' + year :
    api + (['period', 'activity'].includes(section) ? periodDate.slice(0, 4) : year) + '/' + section + '/' + key(); }
  function viewFragment(overrides = {}) {
    return new URLSearchParams({ section, year, week, term, day: selectedDay,
      ...(section === 'setup' ? { setupTab } : {}),
      ...(['period', 'activity'].includes(section) ? { date: periodDate, slot: periodSlot } : {}),
      ...(section === 'activity' ? { activity: activityRecord } : {}),
      ...(section === 'moderation' ? { record: moderationRecord, page: moderationPage } : {}), ...overrides }).toString();
  }
  function offerSignin() {
    csrf = undefined;
    signin.hidden = false;
    const next = '/#' + viewFragment();
    signinLink.href = api.replace(/api\/planner\/$/, 'auth/global-control') + '?next=' + encodeURIComponent(next);
    if (hasUnsavedChanges()) {
      signinLink.target = '_blank';
      signinLink.rel = 'noopener noreferrer';
      document.getElementById('planner-signin-help').textContent = 'Your edits are still on this page. Sign in again in the recovery tab, return here, then choose “I have signed in - retry”. Do not reload this page.';
    } else {
      signinLink.removeAttribute('target');
      signinLink.removeAttribute('rel');
      document.getElementById('planner-signin-help').textContent = 'Sign in again to return to this planner section. No unsaved changes will be lost.';
    }
  }
  async function request(url, options = {}) {
    const { blobResponse, ...fetchOptions } = options;
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...fetchOptions });
    if (response.status === 401) {
      offerSignin();
      throw new Error('Your school sign-in needs renewing. Use Sign in again below.');
    }
    if (blobResponse && response.ok && response.headers.get('content-type')?.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')) return response.blob();
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Sign-in or connection unavailable. Keep this page open and sign in again in another tab.');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The planner could not be loaded or saved.');
    return result;
  }
  async function refreshSession() {
    const session = await request(api + 'session');
    if (session.userId !== ownerId) {
      offerSignin();
      throw new Error('A different school account is signed in. Copy unsaved text and sign back in with the original account before saving.');
    }
    csrf = session.csrf;
    canManageSchoolSettings = session.canManageSchoolSettings === true;
    signin.hidden = true;
  }
  function hasUnsavedChanges() { return dirty || Boolean(content.querySelector('[data-timetable-dirty="true"]')); }
  function canLeave() { return !busy && !content.querySelector('[data-timetable-busy="true"],[data-moderation-busy="true"],[data-preferences-busy="true"],[data-activity-busy="true"],[data-attendance-loading="true"]') && (!hasUnsavedChanges() || confirm('Discard unsaved changes in this view?')); }
  function inputField(name, label, value, type = '', hint = '', cell = false) {
    const wrapper = el('div', '', { class: 'planner-field' });
    const id = 'field-' + name.replace(':', '-');
    const input = el(type ? 'input' : 'textarea', '', { id, name, ...(type ? { type } : { rows: cell ? '3' : '5', maxlength: cell ? '4000' : '20000' }) });
    input.value = value || '';
    if (!cell) wrapper.append(el('label', label, { for: id }));
    else input.setAttribute('aria-label', label);
    if (hint) wrapper.append(el('p', hint));
    wrapper.append(input);
    return wrapper;
  }
  function updateWeekNavigation() {
    if (section !== 'week') return;
    for (const control of selectors.querySelectorAll('input,button,select')) control.disabled = busy;
    selectors.setAttribute('aria-busy', String(busy));
  }
  function navigatePlannerSection(target) {
    if (!canLeave()) return;
    section = target;
    if (section === 'moderation') { moderationRecord = ''; moderationPage = 'overview'; }
    return load().then(async () => {
      if (!loaded) return;
      if (section === 'setup' && setupTab === 6) await setupAttendanceReady;
      try {
        const result = await runAttendanceDriveSync();
        if (result && section === 'attendance') {
          await load();
          placeAttendanceDriveNote();
        }
        else if (result && section === 'setup' && setupTab === 6) {
          const host = content.querySelector('.attendance-setup-page');
          if (host) {
            host.dataset.attendanceLoading = 'true';
            try { host.replaceChildren(); await mountAttendancePage(host, true); }
            finally { host.dataset.attendanceLoading = 'false'; }
          }
        }
      }
      catch (error) {
        console.error('Automatic attendance Drive sync or refresh failed:', error.message);
        notice(error.message, true);
      }
    });
  }
  function renderSelectors() {
    selectors.replaceChildren();
    const controls = el('div', '', { class: 'week-controls' });
    if (['week', 'term'].includes(section)) {
      const label = el('label', '', { class: 'planner-term-control' });
      const select = el('select', '', { 'aria-label': 'Term', class: 'planner-term-badge',
        title: section === 'week' ? 'Open a Term Plan' : 'Choose planner term' });
      if (section === 'week') select.append(el('option', '-', { value: '', disabled: '' }));
      for (let i = 1; i <= 4; i++) select.append(el('option', String(i), { value: String(i), 'aria-label': 'Term ' + i }));
      select.value = term;
      select.addEventListener('change', () => {
        if (!canLeave()) { select.value = select.dataset.displayedTerm ?? term; return; }
        term = select.value; termSelectionPending = false; section = 'term'; load();
      });
      label.append(select, el('span', 'Term', { class: 'planner-term-caption', 'aria-hidden': 'true' })); controls.append(label);
    }
    if (section === 'week') {
      const label = el('label', 'Week containing');
      const picker = el('input', '', { type: 'date', value: week, 'aria-label': 'Week containing' });
      picker.addEventListener('change', () => {
        if (!picker.value || !canLeave()) { picker.value = week; return; }
        const chosen = monday(picker.value);
        const last = date(chosen); last.setUTCDate(last.getUTCDate() + 6);
        if (Number(chosen.slice(0, 4)) !== year && last.getUTCFullYear() !== year) {
          picker.value = week; notice('Choose a week in the selected planner year.', true); return;
        }
        week = chosen; load();
      });
      label.append(picker); controls.append(label);
      for (const [text, offset] of [['Previous week', -7], ['Next week', 7]]) {
        const button = el('button', text, { type: 'button' });
        button.addEventListener('click', () => {
          if (!canLeave()) return;
          const next = date(week); next.setUTCDate(next.getUTCDate() + offset);
          const last = new Date(next); last.setUTCDate(last.getUTCDate() + 6);
          if (next.getUTCFullYear() !== year && last.getUTCFullYear() !== year) { notice('Open the adjacent year to continue.', true); return; }
          week = iso(next); load();
        }); controls.append(button);
      }
    }
    selectors.append(controls);
    updateWeekNavigation();
  }
  function setCalendarEvents(source, events) {
    calendarEventSources[source] = events;
    for (const button of content.querySelectorAll('.annual-calendar button')) {
      const value = button.dataset.date;
      const items = Object.values(calendarEventSources).flat().filter(event => event.date === value);
      button.querySelector('.calendar-event-names')?.remove();
      if (items.length) {
        const names = el('span', '', { class: 'calendar-event-names' });
        for (const item of items.slice(0, 2)) names.append(el('span', item.name));
        if (items.length > 2) names.append(el('span', '+' + (items.length - 2) + ' more', { class: 'calendar-more' }));
        button.append(names);
      }
      button.setAttribute('aria-label', 'View events for ' + value + (items.length ? ': ' + items.map(item => item.name).join('; ') : ''));
    }
    if (selectedCalendarDate) showCalendarDay(selectedCalendarDate);
  }
  function showCalendarDay(value) {
    selectedCalendarDate = value;
    const panel = content.querySelector('.calendar-day-panel');
    if (!panel) return;
    panel.replaceChildren();
    const heading = new Intl.DateTimeFormat('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date(value));
    panel.append(el('h2', heading, { class: 'paper-heading' }));
    const items = Object.values(calendarEventSources).flat().filter(event => event.date === value);
    if (!items.length) panel.append(el('p', 'No loaded events for this date. School and holiday information may still be loading; any source errors appear in the Hint cards.'));
    for (const item of items) {
      const entry = el('section', '', { class: 'calendar-day-event' });
      entry.append(el('h3', item.name), el('p', item.source));
      if (item.details) entry.append(el('p', item.details));
      panel.append(entry);
    }
    const open = el('button', 'Open this week', { type: 'button' });
    open.addEventListener('click', () => { if (!canLeave()) return; week = monday(value); section = 'week'; load(); });
    panel.append(open);
    for (const button of content.querySelectorAll('.annual-calendar button')) {
      button.setAttribute('aria-pressed', String(button.dataset.date === value));
    }
  }
  function renderCalendar() {
    calendarEventSources = {};
    selectedCalendarDate = '';
    const maoriMonths = ['Hānuere', 'Pēpuere', 'Māehe', 'Āperira', 'Mei', 'Hune',
      'Hūrae', 'Ākuhata', 'Hepetema', 'Oketopa', 'Nōema', 'Tīhema'];
    const calendar = el('div', '', { class: 'planner-spread year-calendar-spread' });
    for (const start of [0, 6]) {
      const page = el('section', '', { class: 'paper-page calendar-page' });
      page.append(el('h2', (start ? 'Year Planner ' : 'Mahere tau ') + year, { class: 'paper-heading' }));
      const table = el('table', '', { class: 'annual-calendar' });
      const head = el('thead'), header = el('tr');
      header.append(el('th', 'Rā', { scope: 'col' }));
      for (let month = start; month < start + 6; month++) {
        header.append(el('th', new Intl.DateTimeFormat('en-NZ', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month, 1))), { scope: 'col' }));
      }
      const maoriHeader = el('tr', '', { lang: 'mi' });
      maoriHeader.append(el('td'));
      for (let month = start; month < start + 6; month++) {
        maoriHeader.append(el('th', maoriMonths[month], { scope: 'col' }));
      }
      head.append(header, maoriHeader); table.append(head);
      const body = el('tbody');
      for (let row = 0; row < 37; row++) {
        const tr = el('tr', '', { class: row % 7 > 4 ? 'calendar-weekend' : '' });
        tr.append(el('th', ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][row % 7], { scope: 'row' }));
        for (let month = start; month < start + 6; month++) {
          const offset = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
          const total = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
          const day = row - offset + 1;
          const cell = el('td');
          if (day > 0 && day <= total) {
            const selected = iso(new Date(Date.UTC(year, month, day)));
            const button = el('button', String(day), { type: 'button', 'data-date': selected,
              'aria-label': 'View events for ' + selected, 'aria-pressed': 'false', 'aria-controls': 'calendar-day-panel' });
            button.addEventListener('click', () => showCalendarDay(selected));
            cell.append(button);
          }
          tr.append(cell);
        }
        body.append(tr);
      }
      table.append(body); page.append(table); calendar.append(page);
    }
    const layout = el('div', '', { class: 'year-calendar-layout' });
    const panel = el('aside', '', { class: 'paper-page calendar-day-panel', id: 'calendar-day-panel',
      'aria-label': 'Selected day events', 'aria-live': 'polite' });
    panel.append(el('h2', 'Day events', { class: 'paper-heading' }),
      el('p', 'Select a date to read its full list of events here. This panel sits beside the calendar, not over it.'));
    layout.append(calendar, panel); content.append(layout);
    if (globalThis.plannerGoogleDocSync) {
      const selectedYear = year;
      const host = el('details');
      content.prepend(host);
      globalThis.plannerGoogleDocSync.mount(host, {
        el, year: selectedYear,
        request: path => request(api + path),
        mutate: async (path, body) => {
          await refreshSession();
          return request(api + 'google-calendar/' + path, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-planner-csrf': csrf }, body: JSON.stringify(body)
          });
        },
        settings: () => loadTermDates(selectedYear),
        setEvents: events => { if (host.isConnected) setCalendarEvents('google-doc', events); }
      });
    }
  }
  async function loadSchoolCalendar() {
    const selectedYear = year;
    const box = el('details', '', { class: 'school-calendar-info planner-hint' });
    box.append(el('summary', 'Hint: School terms & public holidays'));
    const link = el('a', 'School Terms & Holidays — view full dates in Global Control', {
      href: (document.body.dataset.coreUrl || '') + '/admin/school-terms'
    });
    const message = el('p', 'Loading shared Ministry term and holiday dates...', { role: 'status' });
    box.append(link, message); content.prepend(box);
    try {
      const calendar = await request(api.replace(/planner\/$/, 'school-calendar/') + selectedYear);
      if (!box.isConnected) return;
      if (calendar.year !== selectedYear) throw new Error('The shared calendar returned a different year. No dates have been highlighted.');
      if (!calendar.available) {
        message.textContent = 'The Ministry source does not publish school dates for ' + selectedYear + '.';
      } else {
        message.textContent = 'School holidays are shaded gold; public holidays are light blue and named below (actual and observed dates). Ministry dates are national guidance, not confirmed WHS opening/closing dates. Refreshed ' + new Date(calendar.fetchedAt).toLocaleString('en-NZ') + '.';
      }
      const list = el('ul');
      for (const term of calendar.terms) list.append(el('li', 'Term ' + term.term + ': ' + term.description));
      for (const note of calendar.notes) list.append(el('li', 'Summer holidays: ' + note + ' Exact summer dates are not shaded because school opening/closing dates vary.'));
      box.append(list);
      const publicDates = calendar.publicHolidays || [];
      if (calendar.publicHolidaysSourceUrl) box.append(el('a', 'Public holiday source — govt.nz (anniversary region: ' + (calendar.anniversaryRegion || 'Westland') + ')', { href: calendar.publicHolidaysSourceUrl }));
      if (calendar.publicHolidaysAvailable) {
        const publicList = el('ul', '', { class: 'public-holiday-list' });
        for (const holiday of publicDates) publicList.append(el('li', holiday.date + ' — ' + holiday.name));
        box.append(publicList);
      }
      if (!calendar.publicHolidaysAvailable || calendar.publicHolidaysError) {
        if (calendar.publicHolidaysError) box.open = true;
        box.append(el('p', calendar.publicHolidaysError || 'Government public holiday dates are not published for this year.',
          { role: calendar.publicHolidaysError ? 'alert' : 'status' }));
        if (calendar.publicHolidaysError) {
          const retryPublic = el('button', 'Retry public holidays', { type: 'button' });
          retryPublic.addEventListener('click', () => { box.remove(); loadSchoolCalendar(); });
          box.append(retryPublic);
        }
      }
      for (const button of content.querySelectorAll('.annual-calendar button')) {
        const value = button.getAttribute('aria-label').match(/\d{4}-\d{2}-\d{2}/)[0];
        const holiday = calendar.holidays.find(range => value >= range.startDate && value <= range.endDate);
        if (holiday) {
          button.parentElement.classList.add('school-holiday');
          button.title = 'School holidays after Term ' + holiday.term + ': ' + holiday.description;
          button.setAttribute('aria-label', button.getAttribute('aria-label') + ' — school holidays after Term ' + holiday.term);
        }
        const publicNames = publicDates.filter(item => item.date === value).map(item => item.name);
        if (publicNames.length) {
          button.parentElement.classList.add('public-holiday');
          button.title = (button.title ? button.title + ' | ' : '') + publicNames.join('; ');
          button.setAttribute('aria-label', button.getAttribute('aria-label') + ' — ' + publicNames.join('; '));
        }
      }
      const events = publicDates.map(item => ({ ...item, source: 'govt.nz public holidays' }));
      for (const range of calendar.holidays) {
        for (const cursor = date(range.startDate); iso(cursor) <= range.endDate; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
          events.push({ date: iso(cursor), name: 'School holidays', details: 'After Term ' + range.term + ': ' + range.description, source: 'Ministry of Education' });
        }
      }
      setCalendarEvents('holidays', events);
    } catch (error) {
      console.error('School calendar load failed:', error);
      if (!box.isConnected) return;
      box.open = true;
      message.textContent = error.message;
      message.setAttribute('role', 'alert');
      const retryDates = el('button', 'Retry school holiday dates', { type: 'button' });
      retryDates.addEventListener('click', () => { box.remove(); loadSchoolCalendar(); });
      box.append(retryDates);
    }
  }
  function artwork(file, alt) {
    return el('img', '', { src: assets + 'artwork/' + file + '.webp', alt, loading: 'lazy' });
  }
  function coverPage(file, subtitle) {
    const page = el('section', '', { class: 'planner-cover paper-page' });
    const descriptions = {
      'cover-kokako': 'Kōkako among native flowers: original planner cover artwork',
      'term-1-takahe': 'Takahē in an alpine landscape: original Term 1 artwork',
      'term-2-bird': 'Native bird beside a river: original Term 2 artwork',
      'term-3-kakapo': 'Kākāpō in native forest: original Term 3 artwork',
      'term-4-kiwi': 'Kiwi in native forest: original Term 4 artwork'
    };
    page.append(artwork(file, descriptions[file]));
    const band = el('div', '', { class: 'cover-band' });
    band.append(el('p', document.body.dataset.plannerName, { class: 'cover-name' }));
    band.append(el('h2', year + ' PUKAPUKA WHAKAMAHERE | PLANNER'));
    if (subtitle) band.append(el('p', subtitle));
    page.append(band);
    return page;
  }
  function field(name, data) {
    const definition = fields.week.find((item) => item[0] === name);
    return inputField(name, definition[1], data[name]);
  }
  async function openPeriodPlan(value, slot, activity = '') {
    if (busy && saveInFlight && !await saveInFlight) return;
    if (busy) { notice('Your planner is still loading or saving. Please try again when it finishes.'); return; }
    if (dirty) { await saveEntry(); if (dirty) return; }
    if (!canLeave()) return;
    selectedDay = (date(value).getUTCDay() + 6) % 7;
    periodDate = value; periodSlot = slot; activityRecord = activity; section = activity ? 'activity' : 'period';
    await load();
  }
  function mountPeriodLinks(spread, selectedWeek) {
    const panel = el('div', '', { class: 'period-plan-status' });
    const message = el('p', 'Loading your period plan titles...', { role: 'status' });
    const retryPlans = el('button', 'Retry period plan titles', { type: 'button', hidden: '' });
    panel.append(message, retryPlans); spread.before(panel);
    async function populate() {
      retryPlans.hidden = true; message.setAttribute('role', 'status');
      message.textContent = 'Loading your period plan titles...';
      try {
        await refreshSession();
        if (!spread.isConnected) return;
        const result = await request(api + 'period-plans/' + selectedWeek);
        if (!spread.isConnected) return;
        const titles = new Map(result.plans.map(plan => [plan.entry_key, plan.title]));
        for (const link of spread.querySelectorAll('[data-period-key]')) {
          link.textContent = titles.get(link.dataset.periodKey)?.trim() || (titles.has(link.dataset.periodKey) ? 'Untitled period plan' : '+ Plan this period');
          link.setAttribute('aria-label', link.textContent + ', ' + link.dataset.periodKey.replace('_', ', '));
        }
        const plans = new Map(result.plans.map(plan => [plan.entry_key, plan]));
        for (const host of spread.querySelectorAll('[data-period-activities]')) {
          const key = host.dataset.periodActivities;
          const activities = JSON.parse(plans.get(key)?.activityLinks || '[]');
          if (!Array.isArray(activities) || !activities.every(item =>
            item && typeof item.title === 'string' && typeof item.id === 'string' &&
            /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(item.id))) {
            throw new Error('Saved activity links could not be read.');
          }
          host.replaceChildren();
          for (const activity of activities) {
            const [value, slot] = key.split('_');
            const day = (date(value).getUTCDay() + 6) % 7;
            const item = el('li');
            const link = el('a', activity.title, {
              href: '#' + viewFragment({ section: 'activity', date: value, slot, day, activity: activity.id })
            });
            link.addEventListener('click', event => {
              if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
              event.preventDefault(); openPeriodPlan(value, slot, activity.id);
            });
            item.append(link); host.append(item);
          }
        }
        globalThis.plannerTextareaAutosize?.refresh();
        alignWeekRows(spread);
        message.textContent = 'Period plans are private. Select an activity to open its details, or a period title to open its plan. Weekly notes remain editable.';
      } catch (error) {
        if (!spread.isConnected) return;
        console.error('Period plan titles could not be loaded.');
        message.textContent = error.message + ' Period plan titles could not be loaded; links still open the dated plan.';
        message.setAttribute('role', 'alert'); retryPlans.hidden = false;
      }
    }
    retryPlans.addEventListener('click', populate);
    populate();
  }
  function mountDayView(spread) {
    const controls = el('div', '', { class: 'week-day-controls', 'aria-label': 'Day view navigation', 'data-planner-navigation': '' });
    const choose = el('select', '', { 'aria-label': 'Day to display' });
    for (let i = 0; i < 5; i++) {
      const value = date(week); value.setUTCDate(value.getUTCDate() + i);
      choose.append(el('option', new Intl.DateTimeFormat('en-NZ', {
        weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC'
      }).format(value), { value: String(i) }));
    }
    const previous = el('button', 'Previous day', { type: 'button' });
    const next = el('button', 'Next day', { type: 'button' });
    const details = el('button', 'Weekly notes & reflections', { type: 'button', 'aria-expanded': 'false' });
    function update() {
      spread.dataset.selectedDay = String(selectedDay);
      choose.value = String(selectedDay); previous.disabled = selectedDay === 0; next.disabled = selectedDay === 4;
      globalThis.plannerTextareaAutosize?.refresh();
      alignWeekRows(spread);
      history.replaceState(null, '', '#' + viewFragment());
    }
    choose.addEventListener('change', () => { selectedDay = Number(choose.value); update(); });
    previous.addEventListener('click', () => { if (selectedDay > 0) { selectedDay--; update(); } });
    next.addEventListener('click', () => { if (selectedDay < 4) { selectedDay++; update(); } });
    details.addEventListener('click', () => {
      const shown = details.getAttribute('aria-expanded') !== 'true';
      details.setAttribute('aria-expanded', String(shown)); spread.dataset.showDetails = String(shown);
      globalThis.plannerTextareaAutosize?.refresh(); alignWeekRows(spread);
    });
    controls.append(previous, choose, next, details); spread.before(controls); update();
  }
  function bulletPriorities(input) {
    const bullet = '\u2022 ';
    input.placeholder = bullet + 'Add a learning intention';
    const replace = (text, start, end) => {
      if (input.value.length - (end - start) + text.length > input.maxLength) return;
      input.setRangeText(text, start, end, 'end');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    input.addEventListener('focus', () => {
      if (!input.value) replace(bullet, 0, 0);
    });
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
      const start = input.selectionStart, end = input.selectionEnd;
      const lineStart = input.value.lastIndexOf('\n', start - 1) + 1;
      const line = input.value.slice(lineStart, start);
      event.preventDefault();
      if (line === bullet && start === end && (start === input.value.length || input.value[start] === '\n')) {
        replace('', lineStart, start);
      } else replace('\n' + bullet, start, end);
    });
  }
  function pastedInstructions(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    function read(node, depth = -1) {
      if (node.nodeType === 3) return node.nodeValue.replace(/\s+/g, ' ');
      if (node.nodeType !== 1) return '';
      const tag = node.tagName.toLowerCase();
      if (['script', 'style', 'head', 'iframe', 'object', 'template'].includes(tag)) return '';
      if (tag === 'br') return '\n';
      const list = tag === 'ul' || tag === 'ol';
      const text = Array.from(node.childNodes).map(child => read(child, list ? depth + 1 : depth)).join('');
      if (tag === 'a') {
        const label = text.trim();
        try {
          const url = new URL(node.getAttribute('href'));
          if (['http:', 'https:'].includes(url.protocol) && label) {
            return '[' + label.replace(/\[/g, '(').replace(/\]/g, ')') + '](' +
              url.href.replace(/\)/g, '%29') + ')';
          }
        } catch { /* Non-web destinations remain plain text. */ }
        return text;
      }
      if (tag === 'li') return '\n' + '  '.repeat(Math.max(0, depth)) + '\u2022 ' + text.trim() + '\n';
      if (list || ['p', 'div', 'section', 'tr', 'h1', 'h2', 'h3', 'h4'].includes(tag)) return '\n' + text + '\n';
      if (tag === 'td' || tag === 'th') return text + ' ';
      return text;
    }
    return read(doc.body).split('\n').map(line => line.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function bulletInstructions(field) {
    const input = field.querySelector('textarea');
    bulletPriorities(input);
    input.placeholder = '\u2022 Add an instruction or note';
    const format = el('button', 'Format as bullets', { type: 'button' });
    format.addEventListener('click', () => {
      const value = input.value.split('\n').map(line =>
        !line.trim() || /^\s*\u2022(?:\s|$)/.test(line) ? line : '\u2022 ' + line).join('\n');
      if (value.length > input.maxLength) {
        notice('Adding bullets would exceed the notes limit. Shorten the notes before formatting.', true); return;
      }
      if (value !== input.value) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      input.focus();
    });
    field.append(format);
    const preview = el('ul', '', { class: 'activity-instruction-list' });
    const edit = el('button', 'Edit instructions', { type: 'button', class: 'activity-instruction-toggle', 'aria-expanded': 'false' });
    const tools = el('div', '', { class: 'activity-instruction-editor', 'data-planner-navigation': '' });
    const linkName = el('input', '', { type: 'text', 'aria-label': 'Link text', placeholder: 'Link text, e.g. Typing Kit' });
    const address = el('input', '', { type: 'url', 'aria-label': 'Link web address', placeholder: 'https://...' });
    const addLink = el('button', 'Insert link', { type: 'button' });
    const message = el('p', '', { role: 'alert' });
    input.addEventListener('paste', event => {
      const html = event.clipboardData?.getData('text/html');
      if (!html) return;
      const value = pastedInstructions(html);
      if (!value) return;
      event.preventDefault();
      let start = input.selectionStart;
      const end = input.selectionEnd;
      const lineStart = input.value.lastIndexOf('\n', start - 1) + 1;
      if (value.startsWith('\u2022 ') && /^\s*\u2022 $/.test(input.value.slice(lineStart, start))) start = lineStart;
      if (input.value.length - (end - start) + value.length > input.maxLength) {
        message.textContent = 'The pasted text and links exceed the notes limit. Paste a smaller section.'; return;
      }
      input.setRangeText(value, start, end, 'end');
      message.textContent = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    tools.append(el('p', 'Select text in the notes, or enter link text below, then paste its web address.'), linkName, address, addLink, message);
    function render() {
      preview.replaceChildren();
      for (const line of input.value.split('\n').filter(line => line.trim())) {
        const item = el('li');
        const text = line.replace(/^(\s*)\u2022\s?/, '$1');
        const pattern = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
        let start = 0;
        for (const match of text.matchAll(pattern)) {
          item.append(el('span', text.slice(start, match.index)));
          try {
            const url = new URL(match[2]);
            if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported address.');
            item.append(el('a', match[1], { href: url.href, target: '_blank', rel: 'noopener noreferrer' }));
          } catch { item.append(el('span', match[0])); }
          start = match.index + match[0].length;
        }
        item.append(el('span', text.slice(start)));
        preview.append(item);
      }
      if (!preview.children.length) preview.append(el('li', 'No instructions yet.'));
    }
    let editing = false;
    function toggle() {
      input.hidden = format.hidden = tools.hidden = !editing;
      preview.hidden = editing;
      edit.textContent = editing ? 'Done editing' : 'Edit instructions';
      edit.setAttribute('aria-expanded', String(editing));
    }
    edit.addEventListener('click', () => {
      editing = !editing; render(); toggle();
      if (editing) input.focus();
    });
    addLink.addEventListener('click', () => {
      const start = input.selectionStart, end = input.selectionEnd;
      const label = linkName.value.trim() || input.value.slice(start, end).trim();
      let url;
      try {
        url = new URL(address.value.trim());
        if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported address.');
      } catch { message.textContent = 'Enter a complete HTTP or HTTPS web address.'; return; }
      if (!label || /[\[\]\r\n]/.test(label)) {
        message.textContent = 'Enter link text without square brackets or line breaks.'; return;
      }
      const markup = '[' + label + '](' + url.href.replace(/\)/g, '%29') + ')';
      if (input.value.length - (end - start) + markup.length > input.maxLength) {
        message.textContent = 'This link would exceed the notes limit. Shorten the notes first.'; return;
      }
      input.setRangeText(markup, start, end, 'end');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      linkName.value = address.value = message.textContent = '';
      input.focus();
    });
    input.addEventListener('input', render);
    field.append(preview, edit, tools);
    render(); toggle();
  }
  function mountActivityPills(field, data) {
    let links;
    try {
      links = JSON.parse(data.activityLinks || '[]');
      if (!Array.isArray(links) || links.length > 100 || !links.every(link =>
        link && typeof link.id === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(link.id) &&
        typeof link.title === 'string' && link.title.trim() && link.title.length <= 200) ||
        new Set(links.map(link => link.id)).size !== links.length) throw new Error('Invalid activity links.');
    } catch (error) {
      console.error('Period activity links could not be read:', error);
      throw new Error('Saved activity links could not be read. They have not been changed. Contact the Planner administrator.');
    }
    const stored = el('input', '', { type: 'hidden', name: 'activityLinks' });
    stored.value = JSON.stringify(links);
    const pills = el('div', '', { class: 'period-activity-pills', 'aria-label': 'Linked activities' });
    const tools = el('div', '', { class: 'period-activity-tools', 'data-planner-navigation': '' });
    const add = el('button', '+ Add activity', { type: 'button', 'aria-expanded': 'false' });
    const panel = el('div', '', { class: 'period-activity-picker', id: 'period-activity-picker' });
    panel.hidden = true;
    add.setAttribute('aria-controls', panel.id);
    add.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      add.setAttribute('aria-expanded', String(!panel.hidden));
    });
    const info = el('p', 'Activities can be reused in other periods this year. Notes above remain separate.', { role: 'status' });
    const title = el('input', '', { id: 'new-activity-title', type: 'text', maxlength: '200', placeholder: 'For example, SketchUp' });
    const create = el('button', 'Create activity', { type: 'button' });
    const existing = el('select', '', { id: 'existing-activity' });
    const attach = el('button', 'Link selected activity', { type: 'button' });
    const refresh = el('button', 'Refresh activities', { type: 'button' });
    panel.append(el('label', 'New activity title', { for: 'new-activity-title' }), title, create,
      el('label', 'Or choose an existing activity', { for: 'existing-activity' }), existing, attach, refresh, info);
    tools.append(add, panel);
    field.append(stored, pills, tools);
    let available = [], actionPending = false;
    const commit = () => {
      stored.value = JSON.stringify(links);
      stored.dispatchEvent(new Event('input', { bubbles: true }));
      draw();
    };
    async function act(callback) {
      if (actionPending) return;
      actionPending = true;
      tools.setAttribute('data-activity-busy', 'true');
      create.disabled = attach.disabled = refresh.disabled = true;
      try {
        if (!await ensureSaved()) throw new Error('Save the current period before changing activities. Your notes have not been discarded.');
        await callback();
      } catch (error) {
        console.error('Period activity action failed:', error);
        info.setAttribute('role', 'alert'); info.textContent = error.message;
      } finally {
        actionPending = false;
        tools.removeAttribute('data-activity-busy');
        create.disabled = attach.disabled = refresh.disabled = false;
      }
    }
    function linkActivity(id, name) {
      if (links.some(link => link.id === id)) throw new Error('This activity is already linked to this period.');
      if (links.length >= 100) throw new Error('This period already has 100 activities. Remove a link before adding another.');
      if (JSON.stringify([...links, { id, title: name }]).length > 20000) throw new Error('Activity links exceed the 20,000-character limit. Remove a link before adding another.');
      links.push({ id, title: name }); commit();
    }
    function draw() {
      pills.replaceChildren();
      for (const link of links) {
        const pill = el('span', '', { class: 'period-activity-pill' });
        const name = available.find(item => item.entry_key === link.id)?.title || link.title;
        const open = el('button', name, { type: 'button', 'aria-label': 'Open activity: ' + name });
        open.addEventListener('click', () => act(async () => {
          tools.removeAttribute('data-activity-busy');
          if (!canLeave()) throw new Error('The Planner is busy. Please retry when saving finishes.');
          activityRecord = link.id; section = 'activity'; await load();
        }));
        const remove = el('button', 'Remove', { type: 'button', class: 'period-activity-remove', 'aria-label': 'Unlink activity: ' + name });
        remove.addEventListener('click', () => act(async () => {
          if (!confirm('Remove "' + name + '" from this period? The activity and its lesson plans will remain available to link again.')) return;
          links = links.filter(item => item.id !== link.id); commit();
          if (!await ensureSaved()) throw new Error('The activity link removal is not saved. Keep this page open and retry Save changes.');
        }));
        pill.append(open, remove); pills.append(pill);
      }
    }
    async function loadActivities() {
      existing.disabled = true;
      try {
        const result = await request(api + 'activities/' + periodDate.slice(0, 4));
        if (!field.isConnected) return;
        available = result.activities;
        existing.replaceChildren(el('option', 'Choose an activity', { value: '' }));
        for (const item of available) existing.append(el('option', item.title || 'Untitled activity', { value: item.entry_key }));
        info.setAttribute('role', 'status');
        info.textContent = 'Activities can be reused in other periods this year. Notes above remain separate.';
        draw();
      } catch (error) {
        console.error('Activities list failed:', error);
        if (field.isConnected) { info.setAttribute('role', 'alert'); info.textContent = error.message + ' Use Refresh activities to retry.'; }
      } finally { existing.disabled = false; }
    }
    refresh.addEventListener('click', loadActivities);
    create.addEventListener('click', () => act(async () => {
      const name = title.value.trim();
      if (!name || name.length > 200) throw new Error('Enter an activity title of up to 200 characters.');
      if (links.length >= 100) throw new Error('This period already has 100 activities. Remove a link before adding another.');
      const id = crypto.randomUUID();
      await refreshSession();
      await request(api + periodDate.slice(0, 4) + '/activity/' + id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-planner-csrf': csrf },
        body: JSON.stringify({ content: { title: name }, revision: 0 })
      });
      linkActivity(id, name); title.value = '';
      if (!await ensureSaved()) throw new Error('The activity was created, but its period link is not saved. Retry Save changes or link it from the existing activities list.');
      await loadActivities();
    }));
    attach.addEventListener('click', () => act(async () => {
      const item = available.find(item => item.entry_key === existing.value);
      if (!item) throw new Error('Choose an existing activity to link.');
      linkActivity(item.entry_key, item.title || 'Untitled activity');
      if (!await ensureSaved()) throw new Error('The activity link is not saved. Keep this page open and retry Save changes.');
    }));
    stored.addEventListener('input', () => { links = JSON.parse(stored.value); draw(); });
    draw(); loadActivities();
  }
  function mountPlanChooser(page) {
    const tools = el('details', '', { class: 'period-plan-chooser', 'data-planner-navigation': '' });
    tools.append(el('summary', 'Copy from another period'));
    const choose = el('select', '', { 'aria-label': 'Saved period plan to copy' });
    const copy = el('button', 'Fill empty fields from this plan', { type: 'button' });
    const refresh = el('button', 'Refresh plans', { type: 'button' });
    const info = el('p', 'Only empty fields are filled. Linked activities are reused, not duplicated.', { role: 'status' });
    tools.append(choose, copy, refresh, info); page.append(tools);
    const selectedYear = periodDate.slice(0, 4), currentKey = periodDate + '_' + periodSlot;
    let pending = false;
    async function populate() {
      choose.disabled = copy.disabled = refresh.disabled = true;
      try {
        await refreshSession();
        const result = await request(api + 'period-plan-choices/' + selectedYear);
        if (!page.isConnected) return;
        choose.replaceChildren(el('option', 'Choose a saved period plan', { value: '' }));
        for (const plan of result.plans.filter(plan => plan.entry_key !== currentKey)) {
          const [value, slot] = plan.entry_key.split('_');
          choose.append(el('option', (plan.title?.trim() || 'Untitled period plan') + ' — ' + value + ' · ' + slot.toUpperCase(),
            { value: plan.entry_key }));
        }
        info.setAttribute('role', 'status');
        info.textContent = choose.children.length > 1 ?
          'Only empty fields are filled. Linked activities are reused, not duplicated.' : 'No other saved period plans in ' + selectedYear + '.';
      } catch (error) {
        console.error('Period plan choices could not be loaded:', error);
        info.setAttribute('role', 'alert'); info.textContent = error.message + ' Use Refresh plans to retry.';
      } finally { choose.disabled = copy.disabled = refresh.disabled = false; }
    }
    refresh.addEventListener('click', populate);
    copy.addEventListener('click', async () => {
      if (pending) return;
      if (!choose.value) { info.setAttribute('role', 'alert'); info.textContent = 'Choose a saved period plan first.'; return; }
      pending = true; copy.disabled = choose.disabled = refresh.disabled = true;
      tools.setAttribute('data-activity-busy', 'true');
      try {
        if (!await ensureSaved()) throw new Error('Save the current period before copying a plan. Your notes have not been discarded.');
        await refreshSession();
        const source = await request(api + selectedYear + '/period/' + choose.value);
        if (!page.isConnected) return;
        if (!source.revision) throw new Error('That saved plan is no longer available. Refresh plans and choose again.');
        let filled = 0;
        for (const name of [...fields.period.map(([name]) => name), 'activityLinks']) {
          const target = page.querySelector('[name="' + name + '"]');
          const value = source.content[name];
          const empty = name === 'activityLinks' ? !target.value.trim() || target.value === '[]' : !target.value.trim();
          if (empty && typeof value === 'string' && value.trim()) {
            target.value = value;
            target.dispatchEvent(new Event('input', { bubbles: true }));
            filled++;
          }
        }
        if (!filled) { info.setAttribute('role', 'status'); info.textContent = 'No empty fields could be filled. Existing content is unchanged.'; return; }
        if (!await ensureSaved()) throw new Error('Copied fields are not saved yet. Keep this page open and use Save changes to retry.');
        await load();
      } catch (error) {
        console.error('Period plan copy failed:', error);
        info.setAttribute('role', 'alert'); info.textContent = error.message;
      } finally {
        pending = false; tools.removeAttribute('data-activity-busy');
        copy.disabled = choose.disabled = refresh.disabled = false;
      }
    });
    populate();
  }
  function renderPeriod(data) {
    const activity = section === 'activity';
    const page = el('section', '', { class: 'paper-page period-planner' });
    const back = el('button', activity ? 'Back to Period Planner' : 'Back to Weekly Planner', { type: 'button' });
    back.addEventListener('click', async () => {
      if (busy && saveInFlight && !await saveInFlight) return;
      if (busy) { notice('Your planner is still loading or saving. Please try again when it finishes.'); return; }
      if (dirty) { await saveEntry(); if (dirty) return; }
      if (!canLeave()) return;
      section = activity ? 'period' : 'week'; await load();
    });
    const slot = slots.find(item => item[0] === periodSlot);
    page.append(back, el('h2', activity ? 'Activity details' : 'Period Planner', { class: 'paper-heading' }),
      el('p', activity ? 'Reusable activity for ' + periodDate.slice(0, 4) + '. Changes to these details are shared by every period that links this activity. Period notes remain separate.' :
        new Intl.DateTimeFormat('en-NZ', { dateStyle: 'full', timeZone: 'UTC' }).format(date(periodDate)) +
        ' | ' + slot[1] + ' | ' + slot[2] + ' (timetable guide)'),
      el('p', activity ? 'Keep activity learning intentions, instructions and resources here.' :
        'A private plan for this date and period, with or without scheduled classes. Weekly quick notes are kept separately.'));
    if (!activity) mountPlanChooser(page);
    const grid = el('div', '', { class: 'planner-grid' });
    for (const [name, label, type, hint] of fields[activity ? 'activity' : 'period']) {
      if (name === 'reflection' || activity && name === 'lessonPlans') {
        const preserved = el('input', '', { type: 'hidden', name });
        preserved.value = data[name] || '';
        grid.append(preserved);
        continue;
      }
      const field = inputField(name, label, data[name], type, hint);
      if (name === 'title') field.querySelector('input').maxLength = 200;
      if (name === 'priorities') bulletPriorities(field.querySelector('textarea'));
      if (activity && name === 'instructions') bulletInstructions(field);
      if (!activity && name === 'activities') mountActivityPills(field, data);
      grid.append(field);
    }
    const links = el('ul', '', { class: 'period-resource-links' });
    const resources = grid.querySelector('[name="resources"]');
    resources.hidden = true;
    const editResources = el('button', 'Edit resource links', {
      type: 'button', 'aria-expanded': 'false', 'aria-controls': 'field-resources'
    });
    editResources.addEventListener('click', () => {
      resources.hidden = !resources.hidden;
      editResources.setAttribute('aria-expanded', String(!resources.hidden));
      editResources.textContent = resources.hidden ? 'Edit resource links' : 'Hide resource addresses';
      if (!resources.hidden) resources.focus();
    });
    resources.before(editResources);
    function renderLinks() {
      links.replaceChildren();
      for (const value of resources.value.split('\n').map(line => line.trim()).filter(Boolean)) {
        const item = el('li');
        try {
          const resource = globalThis.plannerGoogleDrive.resourceLink(value);
          const url = new URL(resource.url);
          if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported resource link.');
          const label = resource.name && resource.name !== resource.url ? resource.name : 'Resource ' + (links.children.length + 1);
          item.append(el('a', label, { href: url.href, target: '_blank', rel: 'noopener noreferrer' }));
        } catch { item.textContent = 'Not a web link: ' + value; }
        links.append(item);
      }
    }
    resources.addEventListener('input', renderLinks); renderLinks();
    page.append(grid, links); content.append(page);
    const drive = el('div', '', { class: 'period-drive-controls' });
    editResources.before(drive);
    globalThis.plannerGoogleDrive.mount(drive, {
      el, resources,
      openSetup: () => {
        if (!canLeave()) return;
        setupTab = 3; section = 'setup'; load();
      },
      request: async () => { await refreshSession(); return request(api + 'google-drive/config'); }
    });
  }
  function weeklyTable(data, indexes, showTimes) {
    const table = el('table', '', { class: 'planner-week' });
    const caption = el('caption', showTimes ? 'Monday to Wednesday' : 'Thursday and Friday');
    table.append(caption);
    const head = el('thead'), header = el('tr');
    if (showTimes) header.append(el('th', 'Rā | Day', { scope: 'col' }));
    const bilingual = ['Mane | Monday | Rāhina', 'Tūrei | Tuesday | Rātu', 'Wenerei | Wednesday | Rāapa', 'Tāite | Thursday | Rāpare', 'Paraire | Friday | Rāmere'];
    for (const i of indexes) {
      const next = date(week); next.setUTCDate(next.getUTCDate() + i);
      const day = el('th', '', { scope: 'col', 'data-week-day': String(i) });
      day.append(el('span', bilingual[i], { class: 'week-day-name' }));
      day.append(el('span', new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(next), { class: 'week-date' }));
      header.append(day);
    }
    head.append(header); table.append(head);
    const body = el('tbody');
    for (const [slot, label, time] of slots) {
      const row = el('tr', '', { class: 'slot-' + slot });
      if (showTimes) {
        const heading = el('th', label, { scope: 'row' });
        heading.append(el('span', time, { class: 'slot-time' })); row.append(heading);
      }
      for (const i of indexes) {
        const cell = el('td', '', { 'data-week-day': String(i) });
        cell.append(el('span', label + (time ? ' | ' + time : ''), { class: 'day-slot-label' }));
        if (['email', 'interval', 'lunch', 'meetings'].includes(slot)) {
          cell.append(el('div', '', { class: 'weekly-duties', 'data-weekly-duties': slot + ':' + i }));
        }
        if (time || slot === 'meetings') cell.append(el('div', '', { class: 'weekly-school-events', 'data-weekly-school-events': slot + ':' + i }));
        if (['whanau', 'p1', 'p2', 'p3', 'p4', 'p5'].includes(slot)) {
          const top = el('div', '', { class: 'period-top' });
          top.append(el('div', '', { class: 'weekly-classes', 'data-weekly-classes': slot + ':' + i }));
          if (/^p[1-5]$/.test(slot)) {
            const value = date(week); value.setUTCDate(value.getUTCDate() + i);
            const planDate = iso(value), planKey = planDate + '_' + slot;
            const link = el('a', '+ Plan this period', {
              class: 'period-plan-link', 'data-period-key': planKey,
              href: '#' + viewFragment({ section: 'period', date: planDate, slot, day: i }),
              'aria-label': 'Period plan for ' + planDate + ', ' + label
            });
            link.addEventListener('click', event => {
              if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              openPeriodPlan(planDate, slot);
            });
            top.append(link);
          }
          cell.append(top);
        }
        if (/^p[1-5]$/.test(slot)) {
          const value = date(week); value.setUTCDate(value.getUTCDate() + i);
          cell.append(el('ul', '', { class: 'weekly-activity-links', 'data-period-activities': iso(value) + '_' + slot }));
        }
        cell.append(inputField(slot + ':' + i, bilingual[i] + ' ' + label + ' ' + time, data.cells?.[slot + ':' + i], '', '', true));
        row.append(cell);
      }
      body.append(row);
    }
    table.append(body);
    return table;
  }
  function renderWeek(data) {
    if (invalidPeriodLink) {
      content.append(el('p', 'That Period Planner link has an invalid date or period. Select a teaching period below instead.', { role: 'alert' }));
      invalidPeriodLink = false;
    }
    const spread = el('div', '', { class: 'planner-spread weekly-spread' });
    const left = el('section', '', { class: 'paper-page week-left', 'aria-label': 'Weekly planner left page' });
    const right = el('section', '', { class: 'paper-page week-right', 'aria-label': 'Weekly planner right page' });
    const top = el('div', '', { class: 'week-top' });
    const meta = el('div', '', { class: 'week-meta' });
    const termField = el('div', '', { class: 'planner-field' });
    termField.append(el('label', 'Term', { for: 'week-term' }));
    const select = el('select', '', { id: 'week-term', name: 'term' });
    select.append(el('option', 'Not set / holiday', { value: '' }));
    for (let i = 1; i <= 4; i++) select.append(el('option', 'Term ' + i, { value: String(i) }));
    select.value = data.term || '';
    select.dataset.autoTerm = data.term ? 'false' : 'true';
    select.addEventListener('change', () => { select.dataset.autoTerm = 'false'; });
    termField.append(select);
    meta.append(termField);
    for (const [id, label] of [['term-week-number', 'Term Week'], ['school-year-week-number', 'School Year Week']]) {
      const wrapper = el('div', '', { class: 'planner-field' });
      wrapper.append(el('label', label, { for: id }), el('input', '', {
        id, type: 'text', readonly: '', 'aria-describedby': 'week-number-help', placeholder: '—'
      }));
      meta.append(wrapper);
    }
    if (data.weekNumber !== undefined) {
      meta.append(el('input', '', { type: 'hidden', name: 'weekNumber', value: data.weekNumber }));
    }
    const numberHelp = el('p', 'Week numbers are calculated from school dates. Loading dates...', { id: 'week-number-help', class: 'week-number-help' });
    const focus = el('div', '', { class: 'week-focus' });
    focus.append(meta, numberHelp, field('focus', data), field('reflection', data));
    top.append(focus, field('whakatauki', data));
    left.append(top, weeklyTable(data, [0, 1, 2], true));
    const notes = el('div', '', { class: 'week-notes' });
    notes.append(field('notes', data), field('calls', data));
    left.append(notes);
    const rightTop = el('div', '', { class: 'week-top' });
    const valueField = field('value', data);
    valueField.classList.add('weekly-value-field');
    valueField.append(el('div', '', { id: 'weekly-value-resource' }));
    rightTop.append(valueField, field('vocabulary', data));
    const rightBody = el('div', '', { class: 'week-right-body' });
    const days = el('div', '', { class: 'week-last-days' });
    days.append(rightTop, weeklyTable(data, [3, 4], false));
    const sidebar = el('aside', '', { class: 'week-sidebar', 'aria-label': 'Weekly notices and tasks' });
    const taskManager = el('section');
    const todoNotes = field('todos', data);
    todoNotes.querySelector('label').textContent = 'Planner notes | Previous To do';
    const notices = el('section', '', { class: 'weekly-notices' });
    notices.append(field('notices', data), el('div', '', { class: 'weekly-school-notices' }));
    sidebar.append(notices, taskManager, todoNotes);
    rightBody.append(days, sidebar); right.append(rightBody);
    spread.append(left, right); content.append(spread);
    mountDayView(spread);
    mountPeriodLinks(spread, week);
    mountGoogleTasks(taskManager, false);
    for (const name of ['focus', 'reflection', 'whakatauki', 'value', 'vocabulary']) {
      const input = spread.querySelector('[name="' + name + '"]');
      input.dataset.autoWeeklyPrompt = Object.hasOwn(data, name) ? 'false' : 'true';
      for (const event of ['input', 'change']) input.addEventListener(event, () => { input.dataset.autoWeeklyPrompt = 'false'; });
    }
    alignWeekRows(spread);
    let frame;
    const observer = new ResizeObserver(() => {
      if (!spread.isConnected) { observer.disconnect(); cancelAnimationFrame(frame); return; }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => alignWeekRows(spread));
    });
    observer.observe(spread);
    for (const area of spread.querySelectorAll('textarea')) observer.observe(area);
    mountWeeklyTimetable(spread, week);
    mountWeeklySchoolEvents(spread, week);
    globalThis.plannerDutyRoster.mountWeek(spread, {
      el, week, align: alignWeekRows, refreshButton: document.getElementById('refresh-weekly-duties'),
      request: async path => {
        await refreshSession();
        return request(path.startsWith('../') ? api.replace(/planner\/$/, '') + path.slice(3) : api + path);
      }
    });
  }
  function overviewSchoolEvents(events) {
    return events.map((event, index) => {
      const startTime = event.weeklyReference ? '' : event.startTime;
      const start = event.date + (startTime ? 'T' + startTime + ':00' : '');
      const endDate = date(event.date); endDate.setUTCDate(endDate.getUTCDate() + 1);
      let end = iso(endDate);
      if (startTime) {
        const finish = event.endTime || new Date(Date.parse(start + 'Z') + 60000).toISOString().slice(11, 16);
        end = (finish < event.startTime ? iso(endDate) : event.date) + 'T' + finish + ':00';
      }
      return { id: 'overview-' + JSON.stringify([event.source, event.name, index]), title: event.name, start, end, allDay: !startTime,
        displayTime: startTime && !event.endTime ? startTime + ' (finish not specified)' : '',
        source: event.source, weeklyReference: event.weeklyReference };
    });
  }
  function mergeWeeklySchoolEvents(events, onDate = '') {
    const normalise = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\b(?:hui|meetings)\b/g, 'meeting')
      .replace(/\bassemblies\b/g, 'assembly').split(/\s+/).sort().join(' ');
    const merged = [];
    for (const event of events) {
      const same = merged.findIndex(item => !item.weeklyReference && !event.weeklyReference &&
        normalise(item.title) === normalise(event.title) && (onDate || kamarEventDate(item.start) === kamarEventDate(event.start)) &&
        (item.allDay || event.allDay || (kamarMinutes(item.start) === kamarMinutes(event.start) &&
          (item.displayTime || event.displayTime ||
            (kamarEventDate(item.end) === kamarEventDate(event.end) && kamarMinutes(item.end) === kamarMinutes(event.end))))));
      if (same === -1) merged.push(event);
      else if ((merged[same].allDay && !event.allDay) ||
          (merged[same].displayTime && !event.allDay && !event.displayTime)) merged[same] = event;
    }
    return merged;
  }
  function weeklySchoolEntries(events, selectedWeek) {
    const unique = [...new Map(events.map(event => [JSON.stringify([event.id, event.start, event.end]), event])).values()];
    const cells = {}, notices = [], outside = [];
    const periods = slots.filter(([, , time]) => time).map(([slot, , time]) => {
      const [start, end] = time.split('-').map(clock => {
        const [hour, minute] = clock.split(':').map(Number);
        return hour * 60 + minute;
      });
      return { slot, start, end };
    });
    const clock = value => {
      const minutes = kamarMinutes(value);
      return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
    };
    for (let i = 0; i < 7; i++) {
      const day = date(selectedWeek); day.setUTCDate(day.getUTCDate() + i);
      const value = iso(day), allDay = [], extras = [];
      const daily = mergeWeeklySchoolEvents(kamarEventsForDay(unique, value), value)
        .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
      for (const event of daily) {
        if (event.allDay) { allDay.push({ title: event.title }); continue; }
        const first = kamarEventDate(event.start), last = kamarEventDate(event.end);
        const entry = {
          title: event.title,
          time: event.displayTime || (first === last ? '' : first + ' ') + clock(event.start) + ' - ' +
            (first === last ? '' : last + ' ') + clock(event.end)
        };
        const start = first < value ? 0 : kamarMinutes(event.start);
        const end = last > value ? 1440 : kamarMinutes(event.end);
        let covered = 0;
        if (i < 5) for (const period of periods) {
          const overlap = Math.min(end, period.end) - Math.max(start, period.start);
          if (overlap > 0) {
            (cells[period.slot + ':' + i] ||= []).push(entry);
            covered += overlap;
          }
        }
        if (covered < end - start) extras.push(entry);
      }
      if (allDay.length) notices.push({ date: value, entries: allDay });
      if (extras.length) outside.push({ date: value, entries: extras });
    }
    return { cells, notices, outside };
  }
  async function weeklyOverviewSources(selectedWeek) {
    const years = [...new Set(kamarWeekDates(selectedWeek).map(value => Number(value.slice(0, 4))))];
    const sources = [];
    for (const selectedYear of years) {
      sources.push({
        name: 'WHS Year Overview dates (' + selectedYear + ')',
        load: async () => {
          const { content: settings } = await request(api + 'school-settings/' + selectedYear);
          const events = (settings.events || []).map(event => ({
            date: event.date, name: event.label, source: 'WHS school-wide setup'
          }));
          for (const [name, label] of setupDates) if (settings[name]) events.push({
            date: settings[name], name: label, source: 'WHS school-wide setup'
          });
          return { events: overviewSchoolEvents(events), warnings: [] };
        }
      }, {
        name: 'Year Overview holidays (' + selectedYear + ')',
        load: async () => {
          const calendar = await request(api.replace(/planner\/$/, '') + 'school-calendar/' + selectedYear);
          if (calendar.year !== selectedYear) throw new Error('The school calendar returned a different year.');
          const events = [...(calendar.publicHolidays || [])];
          for (const range of calendar.holidays) for (const cursor = date(range.startDate); iso(cursor) <= range.endDate; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
            events.push({ date: iso(cursor), name: 'School holidays' });
          }
          return { events: overviewSchoolEvents(events), publicHolidays: calendar.publicHolidays || [], warnings: [
            ...(!calendar.available ? ['Ministry term dates are unavailable for ' + selectedYear + '.'] : []),
            ...(calendar.publicHolidaysError ? [calendar.publicHolidaysError] : [])
          ] };
        }
      }, {
        name: 'Year Overview meetings and assemblies (' + selectedYear + ')',
        load: async () => {
          const result = await globalThis.plannerGoogleDocSync.loadEvents({
            request: path => request(api + path), settings: () => loadTermDates(selectedYear), year: selectedYear
          });
          return { events: overviewSchoolEvents(result.events), warnings: result.warnings };
        }
      });
    }
    return sources;
  }
  function highlightWeeklyPublicHolidays(spread, selectedWeek, holidays) {
    const dates = kamarWeekDates(selectedWeek);
    for (const cell of spread.querySelectorAll('[data-week-day]')) {
      const names = holidays.filter(item => item.date === dates[Number(cell.dataset.weekDay)]).map(item => item.name);
      if (names.length) {
        cell.setAttribute('data-public-holiday', '');
        cell.setAttribute('title', names.join('; '));
      } else {
        cell.removeAttribute('data-public-holiday');
        cell.removeAttribute('title');
      }
    }
  }
  function mountWeeklySchoolEvents(spread, selectedWeek) {
    const host = spread.querySelector('.weekly-school-notices');
    const message = el('p', 'Loading school events and Year Overview...', { role: 'status', 'aria-live': 'polite' });
    const retry = el('button', 'Retry school events', { type: 'button', hidden: '' });
    const lists = el('div');
    host.append(message, retry, lists);
    const line = entry => {
      const item = el('p', entry.title, { class: 'weekly-school-event' });
      if (entry.time) item.append(el('span', entry.time + ' NZ', { class: 'weekly-school-time' }));
      return item;
    };
    function groups(title, days) {
      if (!days.length) return;
      lists.append(el('h3', title));
      for (const day of days) {
        lists.append(el('h4', new Intl.DateTimeFormat('en-NZ', {
          weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'
        }).format(date(day.date))));
        for (const entry of day.entries) lists.append(line(entry));
      }
    }
    async function populate() {
      retry.hidden = true;
      message.setAttribute('role', 'status');
      message.textContent = 'Loading school events and Year Overview...';
      try {
        await refreshSession();
        if (!spread.isConnected) return;
        const months = new Set(kamarWeekDates(selectedWeek).map(value => {
          const day = date(value);
          return day.getUTCFullYear() + '/' + (day.getUTCMonth() + 1);
        }));
        const sources = [{
          name: 'KAMAR school events',
          load: async () => {
            const feeds = await Promise.all([...months].map(month => request(api.replace(/planner\/$/, '') + 'kamar-calendar/' + month)));
            return { events: feeds.flatMap(feed => feed.events), warnings: [] };
          }
        }, ...await weeklyOverviewSources(selectedWeek)];
        const results = await Promise.allSettled(sources.map(source => source.load()));
        if (!spread.isConnected) return;
        const events = [], warnings = [], publicHolidays = [];
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            events.push(...result.value.events);
            publicHolidays.push(...(result.value.publicHolidays || []));
            warnings.push(...result.value.warnings.map(warning => sources[index].name + ': ' + warning));
          } else {
            console.error('Weekly event source could not be loaded: ' + sources[index].name);
            warnings.push(sources[index].name + ': ' + result.reason.message);
          }
        });
        highlightWeeklyPublicHolidays(spread, selectedWeek, publicHolidays);
        const entries = weeklySchoolEntries(events, selectedWeek);
        let count = 0;
        for (const cell of spread.querySelectorAll('[data-weekly-school-events]')) {
          const events = entries.cells[cell.dataset.weeklySchoolEvents] || [];
          cell.replaceChildren(...events.map(line)); count += events.length;
        }
        lists.replaceChildren();
        groups('School Notices | KAMAR & Year Overview', entries.notices);
        groups('Timed school events | Outside timetable hours / weekends', entries.outside);
        message.textContent = count || entries.notices.length || entries.outside.length ?
          'School and Year Overview events shown in NZ time. Timed events can span blocks; untimed notices are listed by date. Your own notices and lesson notes are unchanged.' :
          'No school events for this week in the loaded sources. Your own notices and lesson notes are unchanged.';
        if (warnings.length) {
          message.textContent += ' Some sources need attention: ' + warnings.join(' ');
          message.setAttribute('role', 'alert'); retry.hidden = false;
        }
        alignWeekRows(spread);
      } catch (error) {
        if (!spread.isConnected) return;
        console.error('Weekly school events could not be loaded.');
        message.textContent = error.message + ' School events could not be loaded. Your notes are unchanged; you can continue editing and saving.';
        message.setAttribute('role', 'alert'); retry.hidden = false;
      }
    }
    retry.addEventListener('click', populate);
    populate();
  }
  function weeklyTimetableEntries(events, selectedWeek, limit = 4) {
    const result = {};
    const schoolGroup = title => {
      title = title.trim();
      if (/^(?:9|10)(?=[A-Za-z]|\b)/i.test(title) || /^M[A-Z]+\b/.test(title)) return 'middle';
      if (/^(?:(?:7|8)(?=[A-Za-z]|\b)|(?:SR|PI)[A-Z])/i.test(title)) return 'junior';
      return '';
    };
    const seen = new Set();
    const unique = events.filter(event => {
      const key = JSON.stringify([event.id, event.start, event.end]);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    for (let i = 0; i < 5; i++) {
      const day = date(selectedWeek); day.setUTCDate(day.getUTCDate() + i);
      const entries = kamarWeekLayout(unique, iso(day));
      for (const [slot, , time] of slots) {
        if (!['whanau', 'p1', 'p2', 'p3', 'p4', 'p5'].includes(slot)) continue;
        const [start, end] = time.split('-').map(clock => {
          const [hour, minute] = clock.split(':').map(Number);
          return hour * 60 + minute;
        });
        const priority = item => {
          const title = item.event.title.trim();
          if (schoolGroup(title)) return 0;
          const dtech = /^(11|12|13)\s*DTECH\b/i.exec(title);
          if (dtech) return Number(dtech[1]) - 10;
          if (/^(?:11|12|13)(?=[A-Za-z]|\b)/i.test(title)) return 4;
          return 5;
        };
        result[slot + ':' + i] = entries.filter(item => item.start < end && item.end > start)
          .sort((a, b) => priority(a) - priority(b)).slice(0, limit).map(item => ({
          title: item.event.title,
          schoolGroup: schoolGroup(item.event.title),
          time: [item.event.start, item.event.end].map(value => {
            const minutes = kamarMinutes(value);
            return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
          }).join('-')
        }));
      }
    }
    return result;
  }
  function mountWeeklyTimetable(spread, selectedWeek) {
    const panel = el('div', '', { class: 'weekly-timetable-status' });
    const message = el('p', 'Loading your KAMAR classes for this week...', { role: 'status' });
    const retryTimetable = el('button', 'Retry weekly timetable', { type: 'button', hidden: '' });
    panel.append(message, retryTimetable); spread.before(panel);
    async function populate() {
      retryTimetable.hidden = true;
      message.setAttribute('role', 'status');
      message.textContent = 'Loading your KAMAR classes for this week...';
      try {
        await refreshSession();
        if (!spread.isConnected) return;
        const settings = await request(api + 'kamar-timetable');
        if (!spread.isConnected) return;
        if (!settings.subscription_url) {
          message.textContent = 'Add your personal KAMAR timetable link in Setup My Planner to show classes above your notes.';
          return;
        }
        const months = new Set();
        for (let i = 0; i < 5; i++) {
          const day = date(selectedWeek); day.setUTCDate(day.getUTCDate() + i);
          months.add(day.getUTCFullYear() + '/' + (day.getUTCMonth() + 1));
        }
        const feeds = await Promise.all([...months].map(month => request(api + 'kamar-timetable/' + month)));
        if (!spread.isConnected) return;
        const entries = weeklyTimetableEntries(feeds.flatMap(feed => feed.events), selectedWeek);
        let count = 0;
        for (const host of spread.querySelectorAll('[data-weekly-classes]')) {
          host.replaceChildren();
          for (const entry of entries[host.dataset.weeklyClasses]) {
            const line = el('p', entry.title, { class: entry.schoolGroup ? 'weekly-class-' + entry.schoolGroup : '' });
            line.append(el('span', entry.time, { class: 'weekly-class-time' }));
            host.append(line); count++;
          }
        }
        message.textContent = count ? 'KAMAR classes: up to four per period. Junior/Middle School classes first, then 11DTECH, 12DTECH and 13DTECH, then other Senior classes and other timetable entries. Matched to this week’s dates and actual NZ times; a class crossing periods can appear in both. Planner row times are a guide. Your notes are unchanged.' :
          'No KAMAR classes fall within the teaching periods for this week. Your planning notes are unchanged.';
        alignWeekRows(spread);
      } catch (error) {
        if (!spread.isConnected) return;
        console.error('Weekly teacher timetable could not be loaded.');
        message.textContent = error.message + ' Your planning notes are unchanged; you can continue editing and saving.';
        message.setAttribute('role', 'alert');
        retryTimetable.hidden = false;
      }
    }
    retryTimetable.addEventListener('click', populate);
    populate();
  }
  function alignWeekRows(spread) {
    if (!spread) return;
    const tops = [...spread.querySelectorAll('.week-top')];
    const tables = [...spread.querySelectorAll('.planner-week')];
    for (const top of tops) top.style.minHeight = '';
    for (const table of tables) for (const row of table.rows) row.style.height = '';
    const pages = spread.querySelectorAll('.paper-page');
    const stacked = pages[0].getBoundingClientRect().left === pages[1].getBoundingClientRect().left;
    const labels = tables.map(table => [...table.querySelectorAll('.week-day-name')]);
    for (const group of labels) for (const label of group) label.style.minHeight = '';
    for (const group of stacked ? labels : [labels.flat()]) {
      const labelHeight = Math.max(0, ...group.map(label => label.getBoundingClientRect().height));
      for (const label of group) label.style.minHeight = labelHeight + 'px';
    }
    if (stacked) return;
    const height = Math.max(...tops.map(top => top.getBoundingClientRect().height));
    for (const top of tops) top.style.minHeight = height + 'px';
    const heights = [...tables[0].rows].map((row, index) =>
      Math.max(row.getBoundingClientRect().height, tables[1].rows[index].getBoundingClientRect().height));
    for (const table of tables) {
      [...table.rows].forEach((row, index) => { row.style.height = heights[index] + 'px'; });
    }
  }
  function bilingualRow(mi, en, tag = 'p') {
    const row = el('div', '', { class: 'bilingual-row' });
    row.append(el(tag, mi, { lang: 'mi' }), el(tag, en, { lang: 'en' }));
    return row;
  }
  function renderStandards(data) {
    const pages = el('div', '', { class: 'reference-pages' });
    const picture = el('section', '', { class: 'paper-page standards-page' });
    picture.append(el('h2', 'Ngā Paerewa | Teaching Standards', { class: 'paper-heading' }),
      artwork('teaching-standards', 'Teaching standards diagram from the planner prototype'));
    const focus = el('section', '', { class: 'paper-page standards-focus' });
    focus.append(el('h2', 'Ngā Paerewa mō te umanga whakaakoranga', { lang: 'mi', class: 'paper-heading' }),
      el('h3', 'New Zealand Teaching Standards', { class: 'paper-heading' }));
    const table = el('table', '', { class: 'standards-table' });
    const body = el('tbody');
    standards.forEach((title, index) => {
      const row = el('tr');
      const heading = el('th', 'Standard ' + (index + 1) + ': ' + title, { scope: 'row' });
      if (index === 0) heading.append(el('p', commitment[1]));
      const cell = el('td');
      cell.append(inputField('focus' + (index + 1), 'Focus on: Standard ' + (index + 1), data['focus' + (index + 1)]));
      row.append(heading, cell); body.append(row);
    });
    table.append(body); focus.append(table);
    const reflection = el('section', '', { class: 'paper-page standards-reflection' });
    reflection.append(el('h2', 'Te Hononga Patui i Raro o Te Tiriti o Waitangi | Te Tiriti o Waitangi Partnership', { class: 'paper-heading' }),
      el('h3', 'Te Huritao Whaiaro a te Kaihautū | Leader Self-reflection', { class: 'paper-heading' }),
      bilingualRow(...commitment), bilingualRow('Te Roanga atu o te Paerewa', 'Elaboration of the Standard', 'h4'));
    for (const pair of elaborations) reflection.append(bilingualRow(...pair));
    let number = 0;
    for (const group of reflectionGroups) {
      const band = bilingualRow(group.mi, group.en, 'h3');
      band.classList.add('reflection-band'); reflection.append(band);
      for (const [name, mi, en] of group.questions) {
        number++;
        const question = el('div', '', { class: 'reflection-question' });
        const prompt = bilingualRow(number + '. ' + mi, number + '. ' + en);
        prompt.id = 'prompt-' + name;
        const field = inputField(name, number + '. Whakautu | Reflection', data[name]);
        field.querySelector('textarea').setAttribute('aria-describedby', prompt.id);
        question.append(prompt, field); reflection.append(question);
      }
    }
    reflection.append(el('p', 'Source: Ako Panuku, Te Tāhuhu o te Mātauranga / Ministry of Education, 2019. Bilingual prompts reproduced from the supplied planner prototype.', { class: 'reference-credit' }));
    picture.append(el('p', 'Reference from the supplied planner prototype; not a claim that these are the current official standards.', { class: 'reference-credit' }));
    pages.append(picture, focus, reflection); content.append(pages);
  }
  function renderLearning(data) {
    const page = el('section', '', { class: 'paper-page learning-page' });
    page.append(el('h2', 'Rātaka Akoranga Ngaiotanga | Professional Learning Log', { class: 'paper-heading' }));
    const types = el('fieldset', '', { class: 'learning-types' });
    types.append(el('legend', 'Types of professional learning I have undertaken this year'));
    const title = bilingualRow('Ngā momo akoranga ngaiotanga kua whai wāhi atu au i tēnei tau:',
      'Types of professional learning I have undertaken this year:');
    types.append(title);
    for (const [id, mi, en] of learningTypes) {
      const label = el('label', '', { class: 'learning-choice' });
      const checkbox = el('input', '', { type: 'checkbox', name: 'types', value: id });
      checkbox.checked = data.types?.includes(id) || false;
      label.append(checkbox, el('span', mi, { lang: 'mi' }), el('span', en, { lang: 'en' }));
      types.append(label);
    }
    page.append(types, inputField('other', 'Tētahi atu | Other learning details', data.other),
      inputField('applications', 'Tononga | Applications', data.applications),
      inputField('entries', fields.learning[0][1], data.entries, '', fields.learning[0][3]));
    content.append(page);
  }
  function renderGoals(data) {
    const notes = el('section', '', { class: 'planner-grid paper-page ruled-page' });
    notes.append(el('h2', 'Whāinga | Goals and reflection', { class: 'paper-heading' }));
    for (const name of ['standards', 'reflection']) {
      const definition = fields.goals.find(field => field[0] === name);
      notes.append(inputField(name, definition[1], data[name]));
    }
    const annual = el('section', '', { class: 'paper-page annual-goals' });
    annual.append(el('h2', 'Whakamahere Tau | Annual Plan', { class: 'paper-heading' }),
      el('h3', 'Ngā rā nui i tēnei tau | Important dates this year', { class: 'annual-band' }));
    const dates = el('div', '', { class: 'annual-dates' });
    for (let column = 0; column < 2; column++) {
      const list = el('div', '', { class: 'annual-date-list' });
      for (let row = 1; row <= 4; row++) {
        const index = column * 4 + row;
        const entry = el('div', '', { class: 'annual-date-entry' });
        entry.append(inputField('annualDate' + index, 'Date ' + index, data['annualDate' + index], 'text'),
          inputField('annualEvent' + index, 'Important date / event ' + index, data['annualEvent' + index], 'text'));
        list.append(entry);
      }
      dates.append(list);
    }
    annual.append(dates, el('h3', 'E toru ngā kaupapa mātua i tēnei tau | Top three priorities this year', { class: 'annual-band' }));
    const priorities = el('div', '', { class: 'annual-priorities' });
    for (let index = 1; index <= 3; index++) {
      priorities.append(inputField('priority' + index, 'Priority ' + index, data['priority' + index]));
    }
    const goals = el('div', '', { class: 'annual-goal-pair' });
    goals.append(inputField('professional', 'Whāinga ngaio | Professional Goals', data.professional),
      inputField('wellbeing', 'Whāinga hauora | Wellbeing Goals', data.wellbeing));
    annual.append(priorities, goals);
    content.append(notes, annual);
  }
  function setupEvent(event = {}) {
    const row = el('div', '', { class: 'setup-event', 'data-setup-event': '' });
    const id = crypto.randomUUID();
    const dateField = inputField('eventDate-' + id, 'Date', event.date, 'date');
    const title = inputField('eventLabel-' + id, 'Event title / affected year levels', event.label, 'text');
    const details = inputField('eventDetails-' + id, 'Details / times', event.details);
    const dateInput = dateField.querySelector('input');
    dateInput.min = year + '-01-01'; dateInput.max = year + '-12-31'; dateInput.required = true;
    title.querySelector('input').required = true;
    title.querySelector('input').maxLength = 200;
    details.querySelector('textarea').maxLength = 4000;
    const kind = el('div', '', { class: 'planner-field' });
    kind.append(el('label', 'Event type', { for: 'eventKind-' + id }));
    const select = el('select', '', { id: 'eventKind-' + id, name: 'eventKind-' + id });
    for (const [value, label] of Object.entries(eventKinds)) select.append(el('option', label, { value }));
    select.value = event.kind || 'opening'; kind.append(select);
    const remove = el('button', 'Remove event', { type: 'button' });
    remove.addEventListener('click', () => { row.remove(); dirty = true; save.disabled = busy || !loaded; notice('Unsaved school-wide setup changes.'); });
    row.append(dateField, kind, title, details, remove);
    return row;
  }
  function kamarEventDate(value) {
    if (!value.endsWith('Z')) return value.slice(0, 10);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
  }
  function kamarEventsForDay(events, value) {
    return events.filter(event => {
      const midnight = event.end.endsWith('Z') ?
        new Intl.DateTimeFormat('en-GB', { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(event.end)) === '00:00:00' :
        event.end.endsWith('T00:00:00');
      return kamarEventDate(event.start) <= value &&
        (event.allDay || midnight ? value < kamarEventDate(event.end) : value <= kamarEventDate(event.end));
    });
  }
  function kamarToday(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  }
  function kamarDefaultDate(selectedYear, month, now = new Date()) {
    const today = kamarToday(now);
    const prefix = `${selectedYear}-${String(month).padStart(2, '0')}`;
    return today.startsWith(prefix + '-') ? today : prefix + '-01';
  }
  function kamarSunday(value) {
    const start = date(value);
    start.setUTCDate(start.getUTCDate() - start.getUTCDay());
    return iso(start);
  }
  function kamarWeekDates(start) {
    return Array.from({ length: 7 }, (_, index) => {
      const day = date(start); day.setUTCDate(day.getUTCDate() + index);
      return iso(day);
    });
  }
  function kamarMinutes(value) {
    const clock = value.endsWith('Z') ?
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)) :
      value.slice(11, 16);
    return Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
  }
  function kamarWeekLayout(events, value) {
    const entries = kamarEventsForDay(events, value).filter(event => !event.allDay).map(event => {
      const start = kamarEventDate(event.start) < value ? 0 : kamarMinutes(event.start);
      const end = kamarEventDate(event.end) > value ? 1440 : kamarMinutes(event.end);
      return { event, start: Math.max(480, start), end: Math.min(1020, end) };
    }).filter(item => item.end > item.start).sort((a, b) => a.start - b.start || a.end - b.end);
    return entries;
  }
  function kamarHourEvents(events, value, hour) {
    return kamarWeekLayout(events, value).filter(item => item.start < (hour + 1) * 60 && item.end > hour * 60).map(item => item.event);
  }
  function kamarHourLabel(hour) {
    return (hour > 12 ? hour - 12 : hour) + (hour >= 12 ? 'pm' : 'am');
  }
  function renderKamarWeek(events, start, showDay, buttons, options = {}) {
    const scroll = el('div', '', { class: 'kamar-week-scroll', tabindex: '0', role: 'region', 'aria-label': options.label || 'Teacher timetable, Sunday to Saturday, 8am to 5pm' });
    const grid = el('div', '', { class: 'kamar-week' });
    grid.append(el('div', 'NZ time', { class: 'kamar-week-corner' }));
    const days = kamarWeekDates(start);
    for (const value of days) {
      const button = el('button', new Intl.DateTimeFormat('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date(value)),
        { type: 'button', class: 'kamar-week-heading', 'data-date': value, 'aria-pressed': 'false' });
      button.addEventListener('click', () => showDay(value));
      buttons.push(button); grid.append(button);
    }
    grid.append(el('div', 'All day / outside hours', { class: 'kamar-week-extra-label' }));
    for (const value of days) {
      const extra = el('div', '', { class: 'kamar-week-extra' });
      const visible = new Set(kamarWeekLayout(events, value).map(item => item.event));
      const others = kamarEventsForDay(events, value).filter(event => event.allDay || !visible.has(event));
      for (const event of others) {
        const button = el('button', event.title, { type: 'button' });
        button.addEventListener('click', () => showDay(value)); extra.append(button);
      }
      grid.append(extra);
    }
    for (let hour = 8; hour < 17; hour++) {
      grid.append(el('div', kamarHourLabel(hour), { class: 'kamar-week-time' }));
      for (const value of days) {
        const entries = kamarHourEvents(events, value, hour);
        const label = value + ', ' + kamarHourLabel(hour) + '–' + kamarHourLabel(hour + 1) + ': ' + entries.length + ' ' + (options.noun || 'classes') + '. View full hour details.';
        const button = el('button', '', { type: 'button', class: 'kamar-week-hour', 'data-date': value, 'data-hour': String(hour), 'aria-label': label, 'aria-pressed': 'false' });
        for (const event of entries.slice(0, 3)) button.append(el('span', event.title, { class: 'kamar-hour-class' }));
        if (entries.length > 3) button.append(el('span', '+' + (entries.length - 3) + ' more', { class: 'kamar-hour-more' }));
        button.addEventListener('click', () => showDay(value, hour));
        buttons.push(button); grid.append(button);
      }
    }
    grid.append(el('div', '5pm', { class: 'kamar-week-time kamar-week-end' }));
    scroll.append(grid);
    return scroll;
  }
  function renderKamarCalendar(host, options = {}) {
    const personal = Boolean(options.personal);
    const title = personal ? 'KAMAR Teacher Timetable' : 'KAMAR School Events';
    const selectedYear = year;
    const today = kamarToday();
    let month = Number(today.slice(0, 4)) === selectedYear ? Number(today.slice(5, 7)) : 1;
    let weekStart = kamarSunday(Number(today.slice(0, 4)) === selectedYear ? today : selectedYear + '-01-01');
    const controls = el('div', '', { class: 'kamar-calendar-controls' });
    const previous = el('button', personal ? 'Previous week' : 'Previous month', { type: 'button' });
    const next = el('button', personal ? 'Next week' : 'Next month', { type: 'button' });
    const heading = el('h3', '', { 'aria-live': 'polite' });
    const body = el('div', '', { class: 'kamar-calendar-body' });
    const links = el('div', '', { class: 'kamar-calendar-links' });
    const feed = options.feed || 'https://westlandhigh.school.kiwi/ics/school.ics';
    links.append(el('a', personal ? 'Add my Teacher Timetable to Google Calendar' : 'Add School Events to Google Calendar', {
      href: 'https://calendar.google.com/calendar/u/0/r?cid=' + encodeURIComponent(feed.replace('https:', 'webcal:')),
      target: '_blank', rel: 'noopener noreferrer', class: 'kamar-google-link'
    }), el('p', 'Opens Google Calendar to subscribe with your usual Google account. KAMAR → Google Calendar only. Google controls refresh timing, so updates may not appear immediately.'),
    el('a', personal ? 'My KAMAR timetable subscription (.ics)' : 'Public KAMAR calendar subscription (.ics)', { href: feed, target: '_blank', rel: 'noopener noreferrer' }),
    el('p', personal ? 'Your personal subscription link grants access to your timetable. Keep it private. These lessons are not added to your Year Overview or weekly plans.' :
      'Public subscription: published school events only. This is not the staff-only Faculty calendar. These events are not added to your Year Overview or weekly plans.'));
    if (personal) {
      const copy = el('button', 'Copy my timetable subscription link', { type: 'button' });
      const copied = el('p', '', { role: 'status' });
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(feed); copied.textContent = 'Timetable link copied. In Google Calendar, choose Other calendars → + → From URL.'; }
        catch { copied.textContent = 'Clipboard access is unavailable. Copy your link from the subscription box above instead.'; copied.setAttribute('role', 'alert'); }
      });
      links.append(copy, copied);
    }
    controls.append(previous, heading, next);
    host.append(controls, body, links);
    async function loadMonth() {
      previous.disabled = true; next.disabled = true;
      const days = personal ? kamarWeekDates(weekStart) : [];
      const formatDate = value => new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date(value));
      heading.textContent = personal ? formatDate(days[0]) + ' – ' + formatDate(days[6]) :
        new Intl.DateTimeFormat('en-NZ', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date(`${selectedYear}-${String(month).padStart(2, '0')}-01`));
      body.replaceChildren(el('p', 'Loading ' + title + '…', { role: 'status' }));
      try {
        const endpoint = personal ? api + 'kamar-timetable/' : api.replace(/planner\/$/, '') + 'kamar-calendar/';
        let result;
        if (personal) {
          const months = [...new Set(days.map(value => value.slice(0, 7)))].filter(value => Number(value.slice(0, 4)) >= 2000 && Number(value.slice(0, 4)) <= 2100);
          const results = await Promise.all(months.map(value => request(endpoint + Number(value.slice(0, 4)) + '/' + Number(value.slice(5, 7)))));
          const events = [...new Map(results.flatMap(result => result.events).map(event => [JSON.stringify([event.id, event.start, event.end]), event])).values()];
          result = { events: events.filter(event => days.some(value => kamarEventsForDay([event], value).length)),
            fetchedAt: results.map(result => result.fetchedAt).sort()[0] };
        } else result = await request(endpoint + selectedYear + '/' + month);
        if (!host.isConnected) return;
        body.replaceChildren();
        const table = el('table', '', { class: 'kamar-month' });
        table.append(el('caption', title + ' — ' + heading.textContent));
        const head = el('thead'), header = el('tr');
        for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) header.append(el('th', day, { scope: 'col' }));
        head.append(header); table.append(head);
        const rows = el('tbody'), details = el('section', '', { class: 'kamar-day-details', 'aria-live': 'polite', 'aria-label': 'Selected KAMAR day' });
        const buttons = [];
        function showDay(value, hour) {
          const hourly = Number.isInteger(hour);
          const heading = new Intl.DateTimeFormat('en-NZ', { dateStyle: 'full', timeZone: 'UTC' }).format(date(value));
          details.replaceChildren(el('h4', heading + (hourly ? ' — ' + kamarHourLabel(hour) + '–' + kamarHourLabel(hour + 1) : '')));
          const events = hourly ? kamarHourEvents(result.events, value, hour) : kamarEventsForDay(result.events, value);
          if (!events.length) details.append(el('p', personal ? 'No timetable entries for this ' + (hourly ? 'hour.' : 'day.') : 'No published school events for this day.'));
          for (const event of events) {
            const item = el('article');
            const formatTime = value => value.endsWith('Z') ?
              new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Pacific/Auckland' }).format(new Date(value)) :
              value.replace('T', ' ');
            item.append(el('h5', event.title), el('p', event.allDay ? 'All day' : formatTime(event.start) + ' – ' + formatTime(event.end) + ' (NZ time)'));
            if (event.location) item.append(el('p', 'Location: ' + event.location));
            if (event.description) item.append(el('p', event.description, { class: 'kamar-description' }));
            details.append(item);
          }
          for (const button of buttons) button.setAttribute('aria-pressed',
            String(button.dataset.date === value && (hourly ? button.dataset.hour === String(hour) : button.dataset.hour === undefined)));
        }
        const offset = (date(`${selectedYear}-${String(month).padStart(2, '0')}-01`).getUTCDay() + 6) % 7;
        const dayCount = new Date(Date.UTC(selectedYear, month, 0)).getUTCDate();
        for (let index = 0; !personal && index < Math.ceil((offset + dayCount) / 7) * 7; index++) {
          if (index % 7 === 0) rows.append(el('tr'));
          const cell = el('td'), day = index - offset + 1;
          if (day >= 1 && day <= dayCount) {
            const value = `${selectedYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const events = kamarEventsForDay(result.events, value);
            const button = el('button', '', { type: 'button', 'data-date': value, 'aria-label': value + ': ' + events.length + (personal ? ' timetable entries' : ' school events'), 'aria-pressed': 'false' });
            button.append(el('span', String(day)));
            for (const event of events.slice(0, 2)) button.append(el('span', event.title, { class: 'kamar-event-title' }));
            if (events.length > 2) button.append(el('span', '+' + (events.length - 2) + ' more'));
            button.addEventListener('click', () => showDay(value));
            buttons.push(button); cell.append(button);
          }
          rows.children[rows.children.length - 1].append(cell);
        }
        table.append(rows);
        if (personal) {
          const layout = el('div', '', { class: 'kamar-week-layout' });
          details.classList.add('kamar-hour-panel');
          layout.append(renderKamarWeek(result.events, weekStart, showDay, buttons), details);
          body.append(el('p', 'Each hour shows up to three class names. Click an hour for all classes and full times; click a day heading for the whole day.'), layout);
        } else body.append(table, details);
        body.append(el('p', 'Source checked: ' + new Date(result.fetchedAt).toLocaleString('en-NZ') + '. Times shown in New Zealand time.'));
        showDay(personal ? (days.includes(kamarToday()) ? kamarToday() : weekStart) : kamarDefaultDate(selectedYear, month));
        if (!result.events.length) body.prepend(el('p', personal ? 'No timetable entries in this week. Your subscription may not include those dates yet.' : 'No published events in this month. The public feed may not include future dates yet.'));
      } catch (error) {
        console.error('KAMAR calendar failed:', error);
        if (!host.isConnected) return;
        const retry = el('button', 'Retry KAMAR calendar', { type: 'button' });
        retry.addEventListener('click', loadMonth);
        body.replaceChildren(el('p', error.message, { role: 'alert' }), retry);
      } finally {
        previous.disabled = personal ? weekStart <= selectedYear + '-01-01' : month === 1;
        next.disabled = personal ? days[6] >= selectedYear + '-12-31' : month === 12;
      }
    }
    function move(offset) {
      if (personal) { const start = date(weekStart); start.setUTCDate(start.getUTCDate() + offset * 7); weekStart = iso(start); }
      else month += offset;
      loadMonth();
    }
    previous.addEventListener('click', () => move(-1));
    next.addEventListener('click', () => move(1));
    loadMonth();
  }
  function renderTeacherTimetable(host) {
    host.dataset.teacherTimetable = '';
    host.append(el('h3', 'Kamar Teacher Timetable'),
      el('p', 'Your personal timetable, separate from the school-wide calendar. Each staff member must provide their own KAMAR subscription link. It is saved privately to your school account and applies across planner years.'));
    const hint = el('details', '', { class: 'planner-hint timetable-instructions' });
    hint.append(el('summary', 'Hint: Find my KAMAR timetable link'));
    const steps = el('ol');
    for (const text of [
      'Sign in to KAMAR and open Teachers.',
      'Select your own name in the staff list. Check that your name and teacher code appear above the timetable.',
      'Open the Timetable tab.',
      'Click Calendar Subscription, beside Actions.',
      'Copy the complete subscription link shown in the popout.',
      'Return here, paste the link into My timetable subscription, then click Save my timetable link.',
      'To subscribe in Google Calendar, use Add my Teacher Timetable to Google Calendar below the calendar. Alternatively, copy your link, then in Google Calendar on a computer choose Other calendars → + → From URL, paste the link and choose Add calendar.'
    ]) steps.append(el('li', text));
    hint.append(steps, el('p', 'Use your own Teacher Timetable subscription, not the public School Events or Faculty calendar. Keep the link private. Sync is one-way from KAMAR; Google decides when subscribed calendars refresh.'));
    host.append(hint);
    const settings = el('div', '', { class: 'teacher-timetable-settings' });
    const label = el('label', 'My timetable subscription', { for: 'teacher-timetable-url' });
    // Unnamed text avoids submitting this link or blocking the separate school-wide form validation.
    const input = el('input', '', { id: 'teacher-timetable-url', type: 'text', inputmode: 'url', autocomplete: 'off', spellcheck: 'false', placeholder: 'Paste your KAMAR Calendar Subscription link', maxlength: '500' });
    const button = el('button', 'Save my timetable link', { type: 'button' });
    const message = el('p', 'Loading your timetable settings…', { role: 'status' });
    const calendar = el('div', '', { class: 'teacher-timetable-calendar' });
    settings.append(label, input, button, message); host.append(settings, calendar);
    let savedUrl = '', settingRevision = 0;
    function feedback(text, error = false) { message.textContent = text; message.setAttribute('role', error ? 'alert' : 'status'); }
    input.addEventListener('input', () => {
      host.dataset.timetableDirty = String(input.value.trim() !== savedUrl);
      feedback('Unsaved timetable link. Save it here; the school-wide Save button does not save this link.');
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); button.click(); }
    });
    function showCalendar() {
      calendar.replaceChildren();
      if (savedUrl) renderKamarCalendar(calendar, { personal: true, feed: savedUrl });
      else calendar.append(el('p', 'Paste and save your personal subscription link to show your timetable. Clear the box and save to disconnect.'));
    }
    async function loadSettings() {
      input.disabled = true; button.disabled = true;
      try {
        const result = await request(api + 'kamar-timetable');
        if (!host.isConnected) return;
        savedUrl = result.subscription_url; settingRevision = result.revision;
        input.value = savedUrl; input.disabled = false;
        feedback(savedUrl ? 'Your private timetable link is saved. Clear it and save to disconnect.' : 'No personal timetable link saved yet.');
        showCalendar(); button.disabled = false;
      } catch (error) {
        if (!host.isConnected) return;
        console.error('Teacher timetable settings could not be loaded.');
        feedback(error.message, true);
        const retry = el('button', 'Retry timetable settings', { type: 'button' });
        retry.addEventListener('click', () => { retry.remove(); loadSettings(); });
        settings.append(retry);
      }
    }
    button.addEventListener('click', async () => {
      const url = input.value.trim();
      if (url && !/^https:\/\/westlandhigh\.school\.kiwi\/ics\/[A-Za-z0-9]+-[A-Za-z0-9]+\.ics$/.test(url)) {
        feedback('Paste your complete personal HTTPS Calendar Subscription link from Westland High School KAMAR.', true); return;
      }
      host.dataset.timetableBusy = 'true'; input.disabled = true; button.disabled = true;
      try {
        await refreshSession();
        const result = await request(api + 'kamar-timetable', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-planner-csrf': csrf },
          body: JSON.stringify({ subscription_url: url, revision: settingRevision }) });
        if (!host.isConnected) return;
        savedUrl = url; settingRevision = result.revision; input.value = url;
        host.dataset.timetableDirty = 'false';
        feedback(url ? 'Your private timetable link is saved.' : 'Your timetable is disconnected. An existing Google subscription must be removed in Google Calendar separately.');
        showCalendar();
      } catch (error) { console.error('Teacher timetable settings could not be saved.'); feedback(error.message, true); }
      finally { host.dataset.timetableBusy = 'false'; input.disabled = false; button.disabled = false; }
    });
    loadSettings();
  }
  function mountGoogleTasks(host, setup) {
    globalThis.plannerGoogleTasks.mount(host, {
      el, setup, week,
      request: async path => { await refreshSession(); return request(api + 'google-calendar/' + path); },
      mutate: async (path, method, body) => {
        await refreshSession();
        return request(api + 'google-calendar/' + path, {
          method, headers: { 'Content-Type': 'application/json', 'x-planner-csrf': csrf },
          body: JSON.stringify(body)
        });
      }
    });
  }
  function setupFolder(page) {
    const folder = el('div', '', { class: 'setup-folder' });
    const tabs = el('div', '', { class: 'setup-folder-tabs', role: 'tablist', 'aria-label': 'Planner setup pages', 'aria-orientation': 'vertical' });
    const kamar = el('section', '', { class: 'paper-page setup-page kamar-setup-page' });
    kamar.append(el('h2', 'Kamar Calendar Setup — ' + year, { class: 'paper-heading' }),
      el('p', 'Public School Events, followed by your private Teacher Timetable. Select a day in either calendar to read its full details.'));
    const calendar = el('div', '', { class: 'kamar-calendar' });
    const teacher = el('section', '', { class: 'teacher-timetable' });
    kamar.append(calendar, teacher);
    let calendarLoaded = false;
    const tasks = el('section', '', { class: 'paper-page setup-page' });
    let tasksLoaded = false;
    const drive = el('section', '', { class: 'paper-page setup-page' });
    let driveLoaded = false;
    const holidays = el('section', '', { class: 'paper-page setup-page' });
    let holidaysLoaded = false;
    const duties = el('section', '', { class: 'paper-page setup-page duty-roster-setup' });
    let dutiesLoaded = false;
    const attendance = el('section', '', { class: 'paper-page setup-page attendance-setup-page', 'data-planner-navigation': '' });
    let attendanceLoaded = false;
    const pages = [page, kamar, tasks, drive, holidays, duties, attendance];
    const buttons = ['Planner Setup', 'Kamar Calendar Setup', 'Google Tasks Setup', 'Google Drive Setup', 'Public Holidays Setup', 'Duty Roster', 'Two-Week Attendance'].map((label, index) => {
      const button = el('button', label, { type: 'button', role: 'tab', id: 'setup-tab-' + index, 'aria-controls': 'setup-sheet-' + index });
      pages[index].id = 'setup-sheet-' + index;
      pages[index].setAttribute('role', 'tabpanel');
      pages[index].setAttribute('aria-labelledby', 'setup-tab-' + index);
      pages[index].tabIndex = 0;
      return button;
    });
    function activate(index) {
      if (setupTab === 5 && index !== 5 && duties.querySelector('[data-preferences-busy="true"]')) {
        notice('Save or reload your duty setup changes before switching tabs.', true); return false;
      }
      if (setupTab === 6 && index !== 6 && (attendanceSyncRunning || attendance.dataset.attendanceLoading === 'true' || attendance.querySelector('[data-preferences-busy="true"]'))) {
        notice('Finish the attendance sync or save/reload attendance changes before switching tabs.', true); return false;
      }
      setupTab = index;
      pages.forEach((sheet, i) => { sheet.hidden = i !== index; });
      buttons.forEach((button, i) => {
        button.setAttribute('aria-selected', String(i === index));
        button.tabIndex = i === index ? 0 : -1;
      });
      document.querySelector('.planner-save').hidden = index !== 0;
      history.replaceState(null, '', '#' + viewFragment());
      if (index === 1 && !calendarLoaded) {
        calendarLoaded = true;
        renderKamarCalendar(calendar);
        renderTeacherTimetable(teacher);
      }
      if (index === 2 && !tasksLoaded) {
        tasksLoaded = true;
        const connection = el('section');
        tasks.append(connection);
        mountGoogleTasks(connection, true);
      }
      if (index === 3 && !driveLoaded) {
        driveLoaded = true;
        globalThis.plannerGoogleDrive.mountSetup(drive, {
          el,
          request: async () => { await refreshSession(); return request(api + 'google-drive/config'); }
        });
      }
      if (index === 4 && !holidaysLoaded) {
        holidaysLoaded = true;
        mountHolidayPreferences(holidays);
      }
      if (index === 5 && !dutiesLoaded) {
        dutiesLoaded = true;
        const host = el('div'); duties.append(host);
        globalThis.plannerDutyRoster.mountSetup(host, {
          el, year, week, canEdit: canManageSchoolSettings,
          request: async path => { await refreshSession(); return request(api + path); },
          mutate: async (path, body, method = 'POST') => {
            await refreshSession();
            return request(api + path, { method, headers: { 'Content-Type': 'application/json', 'x-planner-csrf': csrf },
              body: JSON.stringify(body) });
          }
        });
      }
      if (index === 6 && !attendanceLoaded) {
        attendanceLoaded = true;
        attendance.dataset.attendanceLoading = 'true';
        setupAttendanceReady = mountAttendancePage(attendance, true).catch(error => {
          if (!attendance.isConnected) return;
          console.error('Two-Week Attendance setup could not be loaded:', error);
          attendanceLoaded = false;
          attendance.replaceChildren(el('p', error.message, { role: 'alert' }));
          const retryAttendance = el('button', 'Retry Two-Week Attendance', { type: 'button' });
          retryAttendance.addEventListener('click', () => { attendance.replaceChildren(); activate(6); });
          attendance.append(retryAttendance);
        }).finally(() => { attendance.dataset.attendanceLoading = 'false'; });
      }
      return true;
    }
    buttons.forEach((button, index) => {
      button.addEventListener('click', () => activate(index));
      button.addEventListener('keydown', event => {
        const target = { ArrowDown: (index + 1) % pages.length, ArrowUp: (index + pages.length - 1) % pages.length, Home: 0, End: pages.length - 1 }[event.key];
        if (target === undefined) return;
        event.preventDefault(); if (activate(target) !== false) buttons[target].focus();
      });
      tabs.append(button);
    });
    folder.append(tabs, ...pages);
    activate(setupTab);
    return folder;
  }
  function mountModerationSetup(host) {
    async function read() {
      host.replaceChildren(el('p', 'Loading moderation setup…', { role: 'status' }));
      try {
        await refreshSession();
        const result = await request(api + year + '/moderation/main');
        if (!host.isConnected) return;
        let savedRevision = result.revision;
        host.replaceChildren();
        globalThis.plannerModeration.mount(host, {
          el, data: result.content, year, record: '', page: 'overview', setupOnly: true,
          request: async path => { await refreshSession(); return request(api + path); },
          saveNow: async () => {
            await refreshSession();
            const data = { ...result.content };
            for (const input of host.querySelectorAll('[data-moderation-setting]')) data[input.getAttribute('data-moderation-setting')] = input.value;
            const saved = await request(api + year + '/moderation/main', {
              method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-planner-csrf': csrf },
              body: JSON.stringify({ content: data, revision: savedRevision })
            });
            savedRevision = saved.revision;
            return true;
          }
        });
      } catch (error) {
        console.error('Moderation setup could not be loaded.');
        if (!host.isConnected) return;
        host.replaceChildren(el('p', error.message, { role: 'alert' }));
        const retry = el('button', 'Retry moderation setup', { type: 'button' });
        retry.addEventListener('click', read); host.append(retry);
      }
    }
    read();
  }
  function mountHolidayPreferences(host) {
    host.setAttribute('data-planner-navigation', '');
    host.append(el('h2', 'Public Holidays Setup', { class: 'paper-heading' }),
      el('p', 'Choose the anniversary day observed in your area. This personal setting applies across all planner years and does not change other teachers’ calendars. National holidays are always included. Westland is the default. Check your local council if unsure which anniversary applies.'));
    const select = el('select', '', { id: 'anniversary-region' });
    for (const region of globalThis.plannerHolidayRegions) select.append(el('option', region, { value: region }));
    select.disabled = true;
    host.append(el('label', 'Anniversary region', { for: 'anniversary-region' }), select);
    const saveRegion = el('button', 'Save anniversary region', { type: 'button' });
    saveRegion.disabled = true;
    const retry = el('button', 'Retry loading region', { type: 'button', hidden: '' });
    const status = el('p', 'Loading your anniversary region…', { role: 'status', 'aria-live': 'polite' });
    host.append(saveRegion, retry, status);
    let savedRevision = 0;
    async function readRegion() {
      retry.hidden = true;
      status.setAttribute('role', 'status');
      try {
        await refreshSession();
        const result = await request(api + '2000/preferences/main');
        if (!host.isConnected) return;
        savedRevision = result.revision;
        select.value = result.content.anniversaryRegion || 'Westland';
        select.disabled = false; saveRegion.disabled = false;
        status.textContent = 'Your selection is saved privately in the database. Choose Save to apply any changes.';
      } catch (error) {
        console.error('Anniversary region could not be loaded.');
        if (!host.isConnected) return;
        status.textContent = error.message; status.setAttribute('role', 'alert'); retry.hidden = false;
      }
    }
    saveRegion.addEventListener('click', async () => {
      host.dataset.preferencesBusy = 'true'; select.disabled = true; saveRegion.disabled = true;
      try {
        await refreshSession();
        const result = await request(api + '2000/preferences/main', {
          method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-planner-csrf': csrf },
          body: JSON.stringify({ content: { anniversaryRegion: select.value }, revision: savedRevision })
        });
        savedRevision = result.revision;
        status.setAttribute('role', 'status');
        status.textContent = 'Saved. Year Overview and weekly public holiday highlights will use ' + select.value + ' when opened.';
      } catch (error) {
        console.error('Anniversary region could not be saved.');
        status.textContent = error.message; status.setAttribute('role', 'alert'); retry.hidden = false;
      } finally {
        host.dataset.preferencesBusy = 'false'; select.disabled = false; saveRegion.disabled = false;
      }
    });
    retry.addEventListener('click', readRegion);
    readRegion();
  }
  function renderAssessmentSetup(data) {
    let selected = [];
    try { selected = JSON.parse(data.selectedStandards || '[]'); }
    catch (error) {
      console.error('Saved assessment standards could not be read.', error);
      notice('Saved standards could not be read. Do not change this page; contact the project owner.', true);
      content.append(el('p', 'The saved standards list is invalid and has been left unchanged.', { role: 'alert' }));
      return;
    }
    const saved = el('input', '', { type: 'hidden', name: 'selectedStandards' });
    saved.maxLength = 20000;
    saved.value = JSON.stringify(selected);
    const folder = el('div', '', { class: 'setup-folder assessment-setup-folder' });
    const tabs = el('div', '', { class: 'setup-folder-tabs', role: 'tablist', 'aria-label': 'Assessment setup pages', 'aria-orientation': 'vertical' });
    const library = el('section', '', { class: 'paper-page setup-page' });
    const mine = el('section', '', { class: 'paper-page setup-page' });
    const moderation = el('section', '', { class: 'setup-page', 'data-planner-navigation': '' });
    let moderationLoaded = false;
    const pages = [library, mine, moderation];
    const buttons = ['Standards Library', 'My Standards', 'Setup Moderation'].map((label, index) => {
      const button = el('button', label, { type: 'button', role: 'tab', id: 'assessment-setup-tab-' + index,
        'aria-controls': 'assessment-setup-sheet-' + index });
      pages[index].id = 'assessment-setup-sheet-' + index;
      pages[index].setAttribute('role', 'tabpanel');
      pages[index].setAttribute('aria-labelledby', button.id);
      pages[index].tabIndex = 0;
      return button;
    });
    const mineCount = el('span', '');
    buttons[1].append(el('span', ' '), mineCount);
    const results = el('div', '', { class: 'assessment-standard-results', 'aria-live': 'polite' });
    const query = el('input', ''); query.id = 'assessment-standard-query'; query.type = 'search'; query.maxLength = 100;
    query.setAttribute('placeholder', 'e.g. Biology, Computing, 92004');
    query.setAttribute('aria-label', 'Search NZQA standards');
    const view = el('select', '', { id: 'assessment-standard-view', 'aria-label': 'Standard type' });
    for (const [value, label] of [['all', 'All national standards'], ['achievements', 'Achievement standards'],
      ['units', 'Unit standards'], ['skills', 'Skill standards']]) {
      const option = el('option', label, { value }); view.append(option);
    }
    view.value = 'all';
    const level = el('select', '', { id: 'assessment-standard-level', 'aria-label': 'NCEA level' });
    for (const [value, label] of [['all', 'All levels'], ['01', 'Level 1'], ['02', 'Level 2'],
      ['03', 'Level 3'], ['04', 'Level 4']]) {
      const option = el('option', label, { value }); level.append(option);
    }
    level.value = 'all';
    const searchForm = el('form', '', { class: 'assessment-standard-search' });
    searchForm.append(el('label', 'Subject, keyword or standard number', { for: query.id }), query,
      el('label', 'Standard type', { for: view.id }), view, el('label', 'Level', { for: level.id }), level,
      el('button', 'Search NZQA', { type: 'submit' }));
    const note = el('p', 'Search NZQA national standards by subject, keyword or standard number. Select a result to add it to your private My Standards list. Check NZQA for the current standard version and assessment resources.', { class: 'planner-hint' });
    library.append(el('h2', 'NZQA Standards Library', { class: 'paper-heading' }), note, searchForm, results);
    function renderMine() {
      mine.replaceChildren(el('h2', 'My Standards — ' + year, { class: 'paper-heading' }),
        el('p', 'Standards you plan to teach are saved privately to your planner account.'));
      mineCount.textContent = '(' + selected.length + ')';
      if (!selected.length) {
        mine.append(el('p', 'No standards selected yet. Search the NZQA library and add the standards you plan to teach.'));
        return;
      }
      const list = el('ul', '', { class: 'assessment-selected-standards' });
      for (const standard of selected) {
        const item = el('li');
        const details = [standard.subject, standard.level ? 'Level ' + standard.level : '', standard.credits, standard.assessment].filter(Boolean).join(' · ');
        item.append(el('a', standard.number + ' — ' + standard.title,
          { href: standard.url, target: '_blank', rel: 'noopener noreferrer' }),
          el('p', details));
        const remove = el('button', 'Remove', { type: 'button' });
        remove.addEventListener('click', () => {
          selected = selected.filter(item => item.number !== standard.number);
          saveSelected();
          renderMine(); renderResults(currentResults, currentResultsTruncated);
        });
        item.append(remove); list.append(item);
      }
      mine.append(list);
    }
    let currentResults = [];
    let currentResultsTruncated = false;
    let currentResultsUrl = '';
    function renderResults(standardsFound, truncated = false) {
      currentResults = standardsFound;
      currentResultsTruncated = truncated;
      results.replaceChildren();
      if (currentResultsUrl) {
        const source = el('p');
        source.append(el('a', 'Open this search on NZQA', { href: currentResultsUrl, target: '_blank', rel: 'noopener noreferrer' }));
        results.append(source);
      }
      if (!standardsFound.length) {
        results.append(el('p', 'No matching standards were returned. Try a broader subject or keyword.'));
        return;
      }
      if (truncated) results.append(el('p', 'Showing the first 100 results. Narrow your search for more specific matches.'));
      const list = el('ul', '', { class: 'assessment-standard-results-list' });
      for (const standard of standardsFound) {
        const item = el('li', '', { class: 'assessment-standard-result' });
        const details = [standard.subject, standard.level ? 'Level ' + standard.level : '', standard.credits, standard.assessment].filter(Boolean).join(' · ');
        item.append(el('strong', standard.number + ' — ' + standard.title),
          el('p', details),
          el('a', 'View NZQA standard and resources', { href: standard.url, target: '_blank', rel: 'noopener noreferrer' }));
        const add = el('button', selected.some(item => item.number === standard.number) ? 'Added' : 'Add to My Standards', { type: 'button' });
        add.disabled = selected.some(item => item.number === standard.number);
        add.addEventListener('click', () => {
          if (selected.some(item => item.number === standard.number)) return;
          if (selected.length >= 100) { notice('My Standards can hold up to 100 standards.', true); return; }
          selected = [...selected, standard];
          const next = JSON.stringify(selected);
          if (next.length > saved.maxLength) { selected.pop(); notice('The selected standards exceed the storage limit. Remove some standards before adding more.', true); return; }
          saveSelected();
          renderMine(); renderResults(currentResults, currentResultsTruncated);
        });
        item.append(add); list.append(item);
      }
      results.append(list);
    }
    function saveSelected() {
      saved.value = JSON.stringify(selected);
      saved.dispatchEvent(new Event('input', { bubbles: true }));
    }
    searchForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (query.value.trim().length < 2) { results.replaceChildren(el('p', 'Enter at least two search characters.', { role: 'alert' })); return; }
      results.replaceChildren(el('p', 'Searching NZQA standards…', { role: 'status' }));
      searchForm.querySelector('button').disabled = true;
      try {
        await refreshSession();
        const params = new URLSearchParams({ q: query.value.trim(), view: view.value, level: level.value });
        const result = await request(api + 'standards/search?' + params);
        currentResultsUrl = result.resultsUrl;
        renderResults(result.standards, result.truncated);
      } catch (error) {
        console.error('NZQA standards search failed.');
        results.replaceChildren(el('p', error.message, { role: 'alert' }));
      } finally { searchForm.querySelector('button').disabled = false; }
    });
    function activate(index) {
      pages.forEach((sheet, i) => { sheet.hidden = i !== index; });
      buttons.forEach((button, i) => {
        button.setAttribute('aria-selected', String(i === index));
        button.tabIndex = i === index ? 0 : -1;
      });
      if (index === 2 && !moderationLoaded) {
        moderationLoaded = true;
        mountModerationSetup(moderation);
      }
    }
    buttons.forEach((button, index) => {
      button.addEventListener('click', () => activate(index));
      button.addEventListener('keydown', event => {
        const target = { ArrowDown: (index + 1) % pages.length, ArrowUp: (index + pages.length - 1) % pages.length, Home: 0, End: pages.length - 1 }[event.key];
        if (target === undefined) return;
        event.preventDefault(); activate(target); buttons[target].focus();
      });
      tabs.append(button);
    });
    renderMine();
    folder.append(tabs, ...pages);
    content.append(saved, folder);
    activate(0);
    results.append(el('p', 'Enter a subject, keyword or standard number, then choose Search NZQA.'));
  }
  function renderSetup(data) {
    const page = el('section', '', { class: 'paper-page setup-page' });
    page.append(el('h2', 'Setup My Planner — ' + year, { class: 'paper-heading' }),
      el('p', 'School-wide dates: saved changes apply to every planner for this year. Personal plans and reflections remain private. Teacher Planner Lead Teachers and global administrators can edit school setup.'));
    const dates = el('div', '', { class: 'planner-grid' });
    for (const [name, label] of setupDates) {
      const field = inputField(name, label, data[name], 'date');
      const input = field.querySelector('input');
      input.min = year + '-01-01'; input.max = year + '-12-31';
      dates.append(field);
    }
    page.append(dates, el('h3', 'Opening dates, teacher-only days and school closures'));
    const events = el('div', '', { class: 'setup-events' });
    for (const event of data.events || []) events.append(setupEvent(event));
    const add = el('button', 'Add date / event', { type: 'button' });
    add.addEventListener('click', () => {
      if (events.children.length >= 80) { notice('Maximum 80 school events per year.', true); return; }
      events.append(setupEvent()); dirty = true; save.disabled = busy || !loaded; notice('Unsaved school-wide setup changes.');
    });
    page.append(events, add);
    if (year === 2026 && canManageSchoolSettings) {
      const importDates = el('button', 'Load 2026 opening dates — review before saving', { type: 'button' });
      importDates.addEventListener('click', () => {
        if (!confirm('Replace the event list with the supplied 2026 opening schedule? Term dates and the teacher first day will not be changed. Nothing is published until you save.')) return;
        events.replaceChildren(...globalThis.openingDates2026.events.map(setupEvent));
        page.querySelector('[name="studentFirstDay"]').value = globalThis.openingDates2026.studentFirstDay;
        dirty = true; save.disabled = busy || !loaded; notice('2026 opening dates loaded as an unsaved draft. Review, then save school-wide setup.');
      });
      page.append(importDates, el('p', 'Source: supplied Staff opening dates 2026 document. Students start in stages: Years 7–9/new students 29 January; Years 11–13 on 30 January; Year 10 on 2 February; full timetable 3 February. The document does not give all four term boundaries or a single first day for every teacher; those fields remain for confirmation.'));
    }
    content.append(setupFolder(page));
    if (!canManageSchoolSettings) for (const control of page.querySelectorAll('input,textarea,select,button')) control.disabled = true;
  }
  function termRanges(settings, terms) {
    return [1, 2, 3, 4].map(number => {
      const fallback = terms.find(item => item.term === number);
      return { term: String(number), startDate: settings['term' + number + 'Start'] || fallback?.startDate,
        endDate: settings['term' + number + 'End'] || fallback?.endDate };
    });
  }
  function defaultTerm(ranges, today) {
    return ranges.filter(item => item.startDate && item.endDate && item.startDate <= today && item.startDate <= item.endDate)
      .sort((a, b) => b.startDate.localeCompare(a.startDate))[0]?.term || '';
  }
  async function loadTermDates(selectedYear, settings) {
    if (!settings) settings = await request(api + 'school-settings/' + selectedYear);
    const complete = [1, 2, 3, 4].every(number => settings.content['term' + number + 'Start'] && settings.content['term' + number + 'End']);
    const calendar = complete ? null : await request(api.replace(/planner\/$/, '') + 'school-calendar/' + selectedYear);
    return { settings, calendar, ranges: termRanges(settings.content, calendar?.terms || []) };
  }
  function weeklyTerm(settings, terms, selectedWeek) {
    const friday = date(selectedWeek); friday.setUTCDate(friday.getUTCDate() + 4);
    const matches = [];
    for (const range of termRanges(settings, terms)) {
      if (range.startDate && range.endDate && range.startDate <= iso(friday) && range.endDate >= selectedWeek) matches.push(range.term);
    }
    return matches.length === 1 ? matches[0] : '';
  }
  function weeklyNumbers(settings, terms, selectedWeek) {
    const mondayOf = value => {
      const day = date(value);
      day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
      return iso(day);
    };
    const valid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(date(value).getTime()) && iso(date(value)) === value;
    const ranges = termRanges(settings, terms).map(range => ({
      ...range, startDate: range.term === '1' && settings.studentFirstDay && settings.studentFirstDay > range.startDate ?
        settings.studentFirstDay : range.startDate
    }));
    const weeks = ranges.map(range => {
      if (!valid(range.startDate) || !valid(range.endDate) || range.startDate > range.endDate) return null;
      const result = [];
      for (const day = date(range.startDate); iso(day) <= range.endDate; day.setUTCDate(day.getUTCDate() + 1)) {
        if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
        const key = mondayOf(iso(day));
        if (!result.includes(key)) result.push(key);
      }
      return result;
    });
    const matches = weeks.map((items, index) => items?.includes(selectedWeek) ? index : -1).filter(index => index >= 0);
    if (matches.length !== 1) return { termWeek: '', schoolYearWeek: '' };
    const index = matches[0], termWeek = weeks[index].indexOf(selectedWeek) + 1;
    const earlier = weeks.slice(0, index);
    // Missing or overlapping earlier term dates cannot establish a trustworthy year count.
    const known = earlier.every(items => items !== null);
    const allEarlier = known ? earlier.flat() : [];
    const distinct = new Set(allEarlier);
    const ordered = ranges.slice(0, index).every((range, i) => range.endDate < ranges[i + 1].startDate);
    const schoolYearWeek = known && ordered && distinct.size === allEarlier.length &&
      allEarlier.every(value => value < selectedWeek) ? String(allEarlier.length + termWeek) : '';
    return { termWeek: String(termWeek), schoolYearWeek };
  }
  function weeklyValueResource(settings, terms, selectedWeek) {
    const matched = weeklyTerm(settings, terms, selectedWeek);
    const { termWeek } = weeklyNumbers(settings, terms, selectedWeek);
    if (year !== 2026 || matched !== '4' || !/^[1-9]$/.test(termWeek)) return null;
    return {
      title: 'Kaitiakitanga - Term 4, Week ' + termWeek,
      path: 'values/2026-term-4/week-' + termWeek
    };
  }
  function renderWeeklyValue(settings, terms, selectedWeek) {
    const host = content.querySelector('#weekly-value-resource');
    if (!host) return;
    host.replaceChildren();
    const resource = weeklyValueResource(settings, terms, selectedWeek);
    if (!resource) return;
    const fullUrl = assets + resource.path + '.jpg';
    const button = el('button', '', { type: 'button', class: 'weekly-value-thumbnail', 'aria-haspopup': 'dialog', 'aria-label': 'Enlarge ' + resource.title });
    const thumbnail = el('img', '', { src: assets + resource.path + '-thumb.jpg', alt: resource.title + ' weekly tasks poster', width: '480', height: '270' });
    button.append(thumbnail, el('span', 'Click to read: ' + resource.title));
    const dialog = el('dialog', '', { class: 'weekly-value-dialog', 'aria-labelledby': 'weekly-value-title' });
    const heading = el('h2', resource.title, { id: 'weekly-value-title' });
    const close = el('button', 'Close poster', { type: 'button', autofocus: '' });
    close.addEventListener('click', () => dialog.close());
    const original = el('a', 'Open full-resolution image in a new tab', { href: fullUrl, target: '_blank', rel: 'noopener noreferrer' });
    const controls = el('div', '', { class: 'weekly-value-controls' });
    controls.append(heading, original, close);
    const large = el('img', '', { alt: resource.title + ' weekly tasks poster', width: '2400', height: '1350' });
    const failure = () => {
      if (host.querySelector('[role="alert"]')) return;
      console.error('Weekly value poster could not be loaded.');
      host.append(el('p', 'The weekly value poster could not be loaded. Refresh after saving your notes to retry.', { role: 'alert' }));
    };
    thumbnail.addEventListener('error', failure);
    large.addEventListener('error', () => {
      console.error('Full-size weekly value poster could not be loaded.');
      if (!dialog.querySelector('[role="alert"]')) dialog.append(el('p', 'The full-size poster could not be loaded. Close this view and reopen it to retry.', { role: 'alert' }));
    });
    button.addEventListener('click', () => {
      // Load the larger image only when requested, keeping weekly pages lightweight.
      large.src = fullUrl;
      for (const alert of dialog.querySelectorAll('[role="alert"]')) alert.remove();
      dialog.showModal();
    });
    dialog.append(controls, large);
    host.append(button, dialog);
  }
  function fillWeeklyPrompts(settings, terms, selectedWeek) {
    const matched = weeklyTerm(settings, terms, selectedWeek);
    const numbers = weeklyNumbers(settings, terms, selectedWeek);
    const prompts = globalThis.plannerWeeklyPrompts[matched + '-' + numbers.termWeek];
    if (!prompts) return -1;
    let filled = 0;
    for (const [name, text] of Object.entries(prompts)) {
      if (name === 'value' && weeklyValueResource(settings, terms, selectedWeek)) continue;
      const input = content.querySelector('[name="' + name + '"]');
      if (input?.dataset.autoWeeklyPrompt === 'true' && !input.value) {
        input.value = text;
        filled++;
      }
    }
    return filled;
  }
  async function loadSharedDates(termDates) {
    const selectedYear = year;
    const box = el('details', '', { class: 'school-setup-info planner-hint' });
    box.append(el('summary', 'Hint: WHS school-wide dates'));
    box.append(el('h2', 'WHS school-wide dates — ' + year, { class: 'paper-heading' }));
    content.prepend(box);
    try {
      const settings = termDates?.settings || await request(api + 'school-settings/' + selectedYear);
      if (!box.isConnected) return;
      const data = settings.content;
      if (section === 'term') {
        const inputs = ['startDate', 'endDate'].map(name => content.querySelector('[name="' + name + '"]'));
        if (inputs.some(input => input.dataset.autoTermDate === 'true')) {
          const dates = termDates || await loadTermDates(selectedYear, settings);
          if (!box.isConnected) return;
          const range = dates.ranges.find(item => item.term === term);
          for (const [index, name] of ['startDate', 'endDate'].entries()) {
            if (inputs[index].dataset.autoTermDate === 'true' && range?.[name]) inputs[index].value = range[name];
          }
          box.append(el('p', dates.calendar === null ? 'Unset term dates filled from WHS school-wide setup. Saved or manually edited dates are preserved.' :
            dates.calendar.available ? 'Unset term dates use WHS settings where available, otherwise the Ministry ranges shown in Year Overview. Ministry opening/closing ranges may need school-specific confirmation. Saved or manually edited dates are preserved.' :
              'Ministry dates are unavailable for this year. Only published WHS dates can be filled; enter any missing dates manually.'));
        }
      }
      if (section === 'week') {
        const select = content.querySelector('#week-term');
        const termNumber = content.querySelector('#term-week-number');
        const yearNumber = content.querySelector('#school-year-week-number');
        if (select?.dataset.autoTerm === 'true' || termNumber || yearNumber) {
          const complete = [1, 2, 3, 4].every(number => data['term' + number + 'Start'] && data['term' + number + 'End']);
          const calendar = complete ? null : await request(api.replace(/planner\/$/, '') + 'school-calendar/' + selectedYear);
          if (!box.isConnected) return;
          const matchedTerm = weeklyTerm(data, calendar?.terms || [], week);
          if (matchedTerm) term = matchedTerm;
          const badge = selectors.querySelector('.planner-term-badge');
          if (badge) { badge.value = matchedTerm; badge.dataset.displayedTerm = matchedTerm; }
          if (select.dataset.autoTerm === 'true') select.value = weeklyTerm(data, calendar?.terms || [], week);
          const numbers = weeklyNumbers(data, calendar?.terms || [], week);
          if (termNumber) termNumber.value = numbers.termWeek;
          if (yearNumber) yearNumber.value = numbers.schoolYearWeek;
          renderWeeklyValue(data, calendar?.terms || [], week);
          if (globalThis.plannerWeeklyPrompts) {
            const filled = fillWeeklyPrompts(data, calendar?.terms || [], week);
            if (filled > 0) changed({ target: content });
            box.append(el('p', filled >= 0 ? 'Weekly header defaults come from the supplied planner document. Saved text and edits are preserved. Newly filled defaults autosave in your private weekly entry.' :
              'No source prompt set for this term/week. Unsupplied weeks and holidays are left blank; saved text is preserved.'));
          }
          const help = content.querySelector('#week-number-help');
          if (help) help.textContent = 'Teaching weeks only: the first partial student week counts as Week 1. Term Week restarts each term; School Year Week continues across terms, excluding holidays. Blank means holiday or insufficient dates. ' +
            (data.studentFirstDay ? 'Counting starts no earlier than the published first student day.' : 'First student day is not set; Term 1 start is used. Confirm it in Setup My Planner.');
          if (help) box.append(el('p', help.textContent));
          box.append(el('p', complete ? 'Weekly term matched from WHS term dates.' :
            calendar.available ? 'Weekly term uses WHS dates where set, otherwise Ministry term ranges. Confirm school-specific opening and closing dates in Setup My Planner.' :
              'Ministry term dates are unavailable for this year. Add WHS term dates in Setup My Planner or choose the weekly term manually.'));
        }
      }
      if (!settings.revision) box.append(el('p', 'School-wide dates have not been published for this year. Use Setup My Planner in the Setup bar to configure them.'));
      const list = el('ul');
      const firstDays = ['teacherFirstDay', 'studentFirstDay'].filter(name => data[name]);
      if (section !== 'week') {
        for (const name of firstDays) list.append(el('li', setupDates.find(([id]) => id === name)[1] + ': ' + data[name]));
        for (let number = 1; number <= 4; number++) {
          if (section === 'term' && String(number) !== term) continue;
          const start = data['term' + number + 'Start'], end = data['term' + number + 'End'];
          if (start || end) list.append(el('li', 'Term ' + number + ': ' + (start || 'start not set') + ' to ' + (end || 'end not set')));
        }
      }
      const end = date(week); end.setUTCDate(end.getUTCDate() + 6);
      if (section === 'week') {
        for (const [name, label] of setupDates) {
          if (data[name] && data[name] >= week && data[name] <= iso(end)) list.append(el('li', data[name] + ' — ' + label));
        }
      }
      for (const event of data.events || []) {
        if (section === 'week' && (event.date < week || event.date > iso(end))) continue;
        list.append(el('li', event.date + ' — ' + eventKinds[event.kind] + ': ' + event.label + (event.details ? '. ' + event.details : '')));
      }
      for (const button of content.querySelectorAll('.annual-calendar button')) {
        const value = button.getAttribute('aria-label').match(/\d{4}-\d{2}-\d{2}/)[0];
        const labels = (data.events || []).filter(event => event.date === value).map(event => eventKinds[event.kind] + ': ' + event.label);
        for (const [name, label] of setupDates) if (data[name] === value) labels.push(label);
        if (!labels.length) continue;
        button.parentElement.classList.add('school-event');
        const description = labels.join('; ');
        button.title = (button.title ? button.title + ' | ' : '') + description;
        button.setAttribute('aria-label', button.getAttribute('aria-label') + ' — ' + description);
      }
      if (section === 'year') {
        const events = (data.events || []).map(event => ({
          date: event.date, name: event.label, details: event.details, source: 'WHS — ' + eventKinds[event.kind]
        }));
        for (const [name, label] of setupDates) if (data[name]) events.push({ date: data[name], name: label, source: 'WHS school-wide setup' });
        setCalendarEvents('school', events);
      }
      if (section === 'week' && !list.children.length) box.append(el('p', 'No published school events for this week.'));
      box.append(list, el('p', 'School-wide dates are reference information; your saved term dates and weekly labels are not overwritten.'));
    } catch (error) {
      console.error('School-wide planner dates failed:', error);
      if (!box.isConnected) return;
      box.open = true;
      box.append(el('p', error.message, { role: 'alert' }));
      const retryShared = el('button', 'Retry school-wide dates', { type: 'button' });
      retryShared.addEventListener('click', () => { box.remove(); loadSharedDates(); });
      box.append(retryShared);
    }
  }
  function render(data) {
    content.replaceChildren();
    content.dataset.view = section;
    if (['period', 'activity'].includes(section)) { renderPeriod(data); return; }
    if (section === 'cover') {
      const cover = coverPage('cover-kokako', '');
      content.append(cover); return;
    }
    if (section === 'week') { renderWeek(data); return; }
    if (section === 'standards') { renderStandards(data); return; }
    if (section === 'learning') { renderLearning(data); return; }
    if (section === 'goals') { renderGoals(data); return; }
    if (section === 'setup') { renderSetup(data); return; }
    if (section === 'assessmentSetup') { renderAssessmentSetup(data); return; }
    if (section === 'moderation') {
      globalThis.plannerModeration.mount(content, {
        el, data, year, record: moderationRecord, page: moderationPage, ownerId, notice,
        feedbackTemplateUrl: api + 'moderation/templates/feedback',
        scheduleTemplateUrl: api + 'moderation/templates/schedule',
        coversheetTemplateUrl: api + 'moderation/templates/coversheet',
        displayName: document.body.dataset.plannerName,
        userEmail: document.body.dataset.userEmail,
        request: async path => { await refreshSession(); return request(api + path); },
        mutate: async (path, body) => {
          await refreshSession();
          return request(api + path, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-planner-csrf': csrf }, body: JSON.stringify(body) });
        },
        binaryRequest: async (path, options = {}) => {
          await refreshSession();
          return request(api + path, { ...options, headers: { ...options.headers, 'x-planner-csrf': csrf } });
        },
        saveNow: ensureSaved,
        navigate: async (record, page) => {
          if (content.querySelector('[data-moderation-busy="true"]') || !await ensureSaved()) return;
          moderationRecord = record; moderationPage = page; await load();
        }
      });
      return;
    }
    if (section === 'year') renderCalendar();
    const grid = el('div', '', { class: 'planner-grid paper-page ruled-page' + (section === 'term' ? ' term-start-panel' : '') });
    const headings = {year:'Whakamahere Tau | Annual Plan',term:'Ngā kōrero mo te tīmatanga o te wāhanga | Start of term',goals:'Whāinga | Goals and reflection',learning:'Rātaka Akoranga Ngaiotanga | Professional Learning Log'};
    if (section === 'term') {
      const navigation = el('div', '', { class: 'term-panel-navigation', 'data-planner-navigation': '' });
      const goals = el('button', 'Goals and reflection', { type: 'button', 'data-section': 'goals' });
      goals.addEventListener('click', () => navigatePlannerSection('goals'));
      navigation.append(goals); grid.append(navigation);
    }
    grid.append(el('h2', headings[section], { class: 'paper-heading' }));
    for (const [name, label, type, hint] of fields[section]) {
      if (section === 'term' && name === 'reflection') continue;
      const field = inputField(name, label, data[name], type, hint);
      if (section === 'term' && ['startDate', 'endDate'].includes(name)) {
        const input = field.querySelector('input');
        input.dataset.autoTermDate = data[name] ? 'false' : 'true';
        input.addEventListener('input', () => { input.dataset.autoTermDate = 'false'; });
        input.addEventListener('change', () => { input.dataset.autoTermDate = 'false'; });
      }
      grid.append(field);
    }
    if (section === 'term') {
      const files = ['term-1-takahe', 'term-2-bird', 'term-3-kakapo', 'term-4-kiwi'];
      const spread = el('div', '', { class: 'planner-spread term-spread' });
      spread.append(coverPage(files[Number(term) - 1], 'TERM ' + term + ' | ' + year), grid);
      content.append(spread);
      for (const area of grid.querySelectorAll('textarea')) {
        area.classList.add('term-auto-expand');
        area.addEventListener('input', () => expandTermArea(area));
        expandTermArea(area);
      }
      const calendarPanel = el('section', '', { class: 'paper-page term-calendar-panel', 'aria-label': 'Term planner Google Calendar' });
      const calendar = el('section');
      calendarPanel.append(calendar); spread.append(calendarPanel);
      globalThis.plannerGoogleCalendar.mount(calendar, {
        el, request: async path => { await refreshSession(); return request(api + path); },
        mutate: async (path, method, body) => {
          await refreshSession();
          return request(api + 'google-calendar/' + path, {
            method, headers: { 'Content-Type': 'application/json', 'x-planner-csrf': csrf },
            ...(body ? { body: JSON.stringify(body) } : {})
          });
        },
        renderWeek: renderKamarWeek, sunday: kamarSunday, today: kamarToday, weekDates: kamarWeekDates,
        dayEvents: kamarEventsForDay, hourEvents: kamarHourEvents, hourLabel: kamarHourLabel, date, iso
      });
    } else content.append(grid);
  }
  async function mountAttendancePage(host, overview) {
    await refreshSession();
    const settings = await request(api + 'school-settings/' + year);
    let calendar;
    try { calendar = await request(api.replace(/planner\/$/, '') + 'school-calendar/' + year); }
    catch (error) {
      calendar = { publicHolidaysAvailable: false, publicHolidays: [],
        publicHolidaysError: 'Government calendar dates could not be loaded. ' + error.message };
    }
    if (!host.isConnected) return;
    await globalThis.plannerAttendance.mount(host, {
      overview, automaticTabs: true, syncNow: node => runAttendanceDriveSync(node), bindSyncState: bindAttendanceSyncState,
      el, year, ranges: termRanges(settings.content, calendar.terms || []), school: settings.content, calendar, today: localDate,
      uploadPdf: async file => {
        await refreshSession();
        return request(api + 'attendance/' + year + '/import-preview', { method: 'POST',
          headers: { 'Content-Type': 'application/pdf', 'x-planner-csrf': csrf }, body: file });
      },
      loadSchedule: selectedWeek => loadAttendanceSchedule(selectedWeek),
      request: async path => { await refreshSession(); return request(api + path); },
      mutate: async (path, body, method = 'PUT') => {
        await refreshSession();
        return request(api + path, { method,
          headers: { 'Content-Type': 'application/json', 'x-planner-csrf': csrf }, body: JSON.stringify(body) });
      }
    });
    const driveTarget = host.querySelector('[data-attendance-drive-feedback]');
    if (driveTarget) placeAttendanceDriveNote(driveTarget);
  }
  async function loadAttendanceSchedule(selectedWeek) {
    const months = new Set(Array.from({ length: 5 }, (_, i) => {
      const day = date(selectedWeek); day.setUTCDate(day.getUTCDate() + i);
      return day.getUTCFullYear() + '/' + (day.getUTCMonth() + 1);
    }));
    const feeds = await Promise.all([...months].map(month => request(api + 'kamar-timetable/' + month)));
    return weeklyTimetableEntries(feeds.flatMap(feed => feed.events), selectedWeek, Infinity);
  }
  let attendanceSyncRunning = false;
  let attendanceSyncNote = null;
  let attendanceSyncYear = null;
  let attendanceSyncStateListener = null;
  function bindAttendanceSyncState(listener, target) {
    attendanceSyncStateListener = listener;
    listener(attendanceSyncRunning);
    placeAttendanceDriveNote(target);
  }
  function placeAttendanceDriveNote(host = content) {
    if (!attendanceSyncNote || attendanceSyncYear !== year) return;
    const target = host.querySelector('[data-attendance-drive-feedback]') || host;
    if (target === content) return;
    attendanceSyncNote.hidden = false;
    target.replaceChildren(attendanceSyncNote);
  }
  async function runAttendanceDriveSync(host = content) {
    if (attendanceSyncRunning) throw new Error('Attendance Drive sync is already running. Wait until it finishes.');
    attendanceSyncRunning = true;
    const note = el('div', 'Checking Google Drive for new attendance PDFs...', {
      class: 'duty-roster-feedback', role: 'status', 'aria-live': 'polite', 'data-preferences-busy': 'true'
    });
    attendanceSyncNote = note;
    attendanceSyncYear = year;
    const target = host.querySelector('[data-attendance-drive-feedback]') || host;
    note.hidden = target === content;
    if (target === content) target.append(note);
    else target.replaceChildren(note);
    attendanceSyncStateListener?.(true);
    let documents = [];
    function show(message) {
      note.replaceChildren();
      note.textContent = message;
      for (const [status, title] of [
        ['synced', 'Successfully synced documents'],
        ['error', 'Document errors - not fully synced'],
        ['unchanged', 'Already synced - unchanged documents']
      ]) {
        const matching = documents.filter(document => document.status === status);
        if (!matching.length) continue;
        const list = el('ol');
        for (const document of matching) {
          list.append(el('li', document.name + ': ' + (status === 'error' ? document.error :
            status === 'unchanged' ? 'Previously synced; unchanged.' :
              document.marks + ' blank marks saved; ' + document.conflicts + ' conflicts kept; ' +
                document.warnings + ' student/class match warnings.')));
        }
        note.append(el('h4', title), list);
      }
    }
    try {
      await refreshSession();
      const settings = await request(api + 'attendance/' + year + '/drive-sync');
      if (!settings.enabled) { note.textContent = 'Automatic Drive attendance sync is disabled. Save and enable a folder before syncing.'; return; }
      const school = (await request(api + 'school-settings/' + year)).content;
      let calendar;
      try { calendar = await request(api.replace(/planner\/$/, '') + 'school-calendar/' + year); }
      catch (error) { calendar = { publicHolidays: [], publicHolidaysError: error.message }; }
      const ranges = termRanges(school, calendar.terms || []);
      if (!ranges.some(range => range.startDate && range.endDate)) throw new Error('Publish term dates in Planner Setup before syncing attendance.');
      const result = await globalThis.plannerAttendance.syncDrive({
        year, school, calendar, ranges, today: localDate, automaticTabs: true,
        request: async path => { await refreshSession(); return request(api + path); },
        mutate: async (path, body) => {
          await refreshSession();
          return request(api + path, { method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-planner-csrf': csrf }, body: JSON.stringify(body) });
        },
        loadSchedule: selectedWeek => loadAttendanceSchedule(selectedWeek),
        onProgress: show,
        onDocument: document => {
          documents.push(document);
          if (document.status === 'error') note.setAttribute('role', 'alert');
          show('Document finished: ' + document.name + '. Continuing to the next PDF. Keep this page open.');
        }
      });
      if (!result.enabled) { note.textContent = 'Automatic Drive attendance sync is disabled.'; return; }
      documents = result.documents || documents;
      note.setAttribute('role', result.failed ? 'alert' : 'status');
      show((result.failed ? 'Drive attendance sync completed with document errors at ' : 'Drive attendance sync completed successfully at ') +
        new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' }) + ': ' +
        result.files + ' new/updated PDFs processed; ' +
        result.marks + ' blank marks filled; ' + result.conflicts + ' conflicts kept; ' +
        result.warnings + ' student/class match warnings; ' + result.skipped + ' unchanged PDFs skipped; ' +
        (result.failed || 0) + ' document errors.' +
        (!result.files && !result.skipped && !result.failed ? ' No PDFs found in the selected folder.' : '') +
        (!result.files && result.skipped && !result.failed ? ' Already up to date; no new or changed PDFs.' : '') +
        (result.failed ? ' Successfully synced documents are saved. Correct or remove rejected PDFs, then retry; completed documents will not be duplicated.' : '') +
        (result.warnings ? ' Re-preview affected PDFs in Two-Week Attendance to review unmatched students.' : '') +
        (calendar.publicHolidaysError ? ' Public holiday dates unavailable: check the imported dates.' : ''));
      return { note };
    } catch (error) {
      note.setAttribute('role', 'alert');
      show(error.message + ' Open Two-Week Attendance to check the folder, authorise Google Drive or retry sync.');
      throw error;
    } finally {
      attendanceSyncRunning = false;
      note.removeAttribute('data-preferences-busy');
      attendanceSyncStateListener?.(false);
    }
  }
  async function load() {
    setupAttendanceReady = undefined;
    if (section === 'attendanceImport') { section = 'setup'; setupTab = 6; }
    attendanceSyncStateListener = null;
    const dutyRefresh = document.getElementById?.('refresh-weekly-duties');
    if (dutyRefresh) { dutyRefresh.hidden = true; dutyRefresh.onclick = null; }
    clearTimeout(autosaveTimer);
    autosavePaused = false;
    busy = true; loaded = false; dirty = false; save.disabled = true; retry.hidden = true; signin.hidden = true;
    updateWeekNavigation();
    content.replaceChildren();
    notice('Loading your private planner...');
    try {
      let termDates, openingNote = '';
      if (openingTermPending) {
        await refreshSession();
        termDates = await loadTermDates(year);
        let selected = defaultTerm(termDates.ranges, localDate);
        if (!selected && year === Number(localDate.slice(0, 4)) && year > 2000 &&
            termDates.ranges.some(item => item.startDate && item.startDate > localDate)) {
          const previous = await loadTermDates(year - 1);
          selected = defaultTerm(previous.ranges, localDate);
          if (selected) { year--; termDates = previous; }
        }
        if (selected) { section = 'term'; term = selected; }
        else { section = 'cover'; openingNote = 'No current or finished term can be determined from the available dates. Open Year overview or Setup My Planner to check the calendar.'; }
        openingTermPending = false;
        yearInput.value = year;
        updateYearBadge();
      }
      if (section === 'term' && termSelectionPending) {
        await refreshSession();
        termDates ||= await loadTermDates(year);
        const selected = defaultTerm(termDates.ranges, localDate);
        if (!selected) throw new Error('No current or finished term can be determined. Open Year overview to check the school dates.');
        term = selected;
        termSelectionPending = false;
      }
      renderSelectors();
      history.replaceState(null, '', '#' + viewFragment());
      document.querySelector('.planner-save').hidden = ['cover', 'attendance', 'attendanceImport'].includes(section);
      save.textContent = section === 'setup' ? 'Save school-wide setup' : 'Save changes';
      document.getElementById('save-note').textContent = section === 'setup' ? 'These settings are shared by all planners for this year.' :
        'Private Planner edits autosave. Wait for Autosaved before closing.';
      for (const button of document.querySelectorAll('[data-section]')) {
        if (button.dataset.section === section) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      }
      if (section === 'cover') { render({}); loaded = true; notice(openingNote || 'Your planner, familiar pages. Open the cover or choose a section above.'); return; }
      await refreshSession();
      if (section === 'attendance') {
        const host = el('section');
        content.append(host);
        await mountAttendancePage(host, false);
        loaded = true;
        notice('Private attendance log. Class setup and individual marks save separately from planner notes.');
        return;
      }
      const data = await request(address());
      if (section === 'activity' && !data.revision) throw new Error('This activity is unavailable. Use the Period Planner to create or link an activity.');
      if (section === 'setup') canManageSchoolSettings = data.canEdit === true;
      revision = data.revision; savedTermContent = section === 'term' ? { ...data.content } : {}; render(data.content); loaded = true;
      if (section === 'year') await loadSchoolCalendar();
      if (['year', 'week', 'term'].includes(section)) await loadSharedDates(termDates);
      if (!dirty) notice(section === 'setup' ? (data.updated_at ? 'School-wide setup loaded. Last saved ' + new Date(data.updated_at).toLocaleString('en-NZ') : 'School-wide setup has not been published. Add confirmed dates or load the opening schedule, then save.') :
        (data.updated_at ? 'Loaded. Last saved ' + new Date(data.updated_at).toLocaleString('en-NZ') : 'New entry.') +
        ' Changes autosave after a short pause. Private to your account.');
    } catch (error) { console.error('Planner load failed:', error); notice(error.message, true); retry.hidden = !signin.hidden; }
    finally {
      busy = false; save.disabled = !loaded || !dirty;
      updateWeekNavigation();
      globalThis.plannerTextareaAutosize?.refresh();
      if (dirty) scheduleAutosave();
    }
  }
  function expandTermArea(area) {
    area.style.height = 'auto';
    area.style.height = area.scrollHeight + 'px';
  }
  function autosaves() {
    return ['week', 'year', 'term', 'goals', 'standards', 'learning', 'period', 'activity', 'assessmentSetup', 'moderation'].includes(section);
  }
  function scheduleAutosave(delay = 800) {
    clearTimeout(autosaveTimer);
    if (!autosaves() || !dirty || !loaded || autosavePaused) return;
    autosaveTimer = setTimeout(() => { if (!busy) saveEntry(true); }, delay);
  }
  function changed(event) {
    if (event.target.closest('[data-teacher-timetable],[data-google-calendar],[data-planner-navigation]')) return;
    dirty = true; editVersion++; save.disabled = busy || !loaded;
    notice(autosaves() ? (autosavePaused ? 'Autosave is paused. Your latest changes are NOT saved. Keep this page open and use Save changes to retry.' : 'Unsaved changes - autosave pending...') : 'Unsaved changes.', autosaves() && autosavePaused);
    scheduleAutosave();
  }
  form.addEventListener('input', changed);
  form.addEventListener('change', changed);
  form.addEventListener('focusout', event => {
    if (!event.target.closest('[data-teacher-timetable],[data-google-calendar],[data-planner-navigation]') && event.target.matches('textarea,input,select')) scheduleAutosave(0);
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') scheduleAutosave(0); });
  window.addEventListener('resize', () => {
    for (const area of content.querySelectorAll('.term-auto-expand')) expandTermArea(area);
    alignWeekRows(content.querySelector('.weekly-spread'));
  });
  async function saveEntry(automatic = false) {
    if (busy || !loaded || (section === 'setup' && (!canManageSchoolSettings || content.querySelector('#setup-sheet-0')?.hidden))) return;
    clearTimeout(autosaveTimer);
    if (!form.reportValidity()) {
      if (autosaves()) { autosavePaused = true; notice('Planner changes are NOT saved. Check the highlighted fields, then use Save changes to retry.', true); }
      return;
    }
    const version = editVersion;
    const data = section === 'term' ? { ...savedTermContent } : {}, cells = {};
    const formData = new FormData(form);
    for (const [name, value] of formData) {
      if (section === 'setup' && name.startsWith('event')) continue;
      if (section === 'learning' && name === 'types') continue;
      if (name.includes(':')) cells[name] = value;
      else data[name] = value;
    }
    if (section === 'setup') {
      data.events = [...content.querySelectorAll('[data-setup-event]')].map(row => ({
        date: row.querySelector('[name^="eventDate-"]').value,
        kind: row.querySelector('[name^="eventKind-"]').value,
        label: row.querySelector('[name^="eventLabel-"]').value,
        details: row.querySelector('[name^="eventDetails-"]').value
      }));
    }
    if (section === 'learning') data.types = formData.getAll('types');
    if (section === 'week') data.cells = cells;
    busy = true; save.disabled = true; notice(automatic ? 'Autosaving to the database...' : 'Saving...');
    updateWeekNavigation();
    const controlRoot = section === 'setup' ? content.querySelector('#setup-sheet-0') : content;
    const controls = [...controlRoot.querySelectorAll('input,textarea,select,button')].filter(control => !control.closest('[data-google-calendar]'));
    if (!autosaves()) controls.forEach((control) => control.disabled = true);
    let succeeded = false;
    let finishSave;
    saveInFlight = new Promise(resolve => { finishSave = resolve; });
    try {
      await refreshSession();
      const result = await request(address(), { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-planner-csrf': csrf }, body: JSON.stringify({ content: data, revision }) });
      revision = result.revision; dirty = version !== editVersion; succeeded = true;
      if (section === 'term') savedTermContent = data;
      if (autosaves()) autosavePaused = false;
      notice(dirty ? 'Latest changes are waiting to autosave...' : (automatic ? 'Autosaved ' : 'Saved ') + new Date(result.updated_at).toLocaleString('en-NZ') + (section === 'setup' ? '. School-wide dates published for all planners in ' + year + '.' : '. To the database, private to your account.'));
    } catch (error) {
      console.error('Planner save failed:', error);
      if (autosaves()) autosavePaused = true;
      notice(error.message + (autosaves() ? ' Autosave paused. Your changes are NOT saved. Keep this page open; copy your text and retry with Save changes after reconnecting.' : ''), true);
    }
    finally {
      busy = false;
      updateWeekNavigation();
      if (!autosaves()) controls.forEach((control) => control.disabled = section === 'setup' && !canManageSchoolSettings);
      save.disabled = !dirty || (section === 'setup' && !canManageSchoolSettings);
      if (succeeded && dirty) scheduleAutosave();
      finishSave(succeeded && !dirty); saveInFlight = undefined;
    }
    return succeeded && !dirty;
  }
  async function ensureSaved() {
    if (saveInFlight) await saveInFlight;
    if (busy || !loaded) return false;
    return dirty ? await saveEntry() : true;
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!['attendance', 'attendanceImport'].includes(section) && !(section === 'setup' && setupTab !== 0)) saveEntry();
  });
  document.querySelectorAll('[data-section]').forEach((button) => button.addEventListener('click', () => {
    return navigatePlannerSection(button.dataset.section);
  }));
  openYear.addEventListener('click', () => {
    const value = Number(yearInput.value);
    if (!Number.isInteger(value) || value < 2000 || value > 2100) { notice('Enter a year between 2000 and 2100.', true); return; }
    if (!canLeave()) { yearInput.value = year; updateYearBadge(); return; }
    year = value; week = monday(`${year}-01-04`);
    if (['period', 'activity'].includes(section)) section = 'week';
    if (section === 'moderation') { moderationRecord = ''; moderationPage = 'overview'; }
    load();
  });
  retry.addEventListener('click', load);
  document.getElementById('resume-planner').addEventListener('click', async () => {
    if (busy) return;
    if (loaded && section === 'setup' && content.querySelector('#setup-sheet-0')?.hidden) {
      try { await refreshSession(); notice('Sign-in renewed. Your entries are preserved. Retry the timetable save or calendar load on this sheet.'); }
      catch (error) { notice(error.message, true); }
      return;
    }
    if (dirty && loaded) form.requestSubmit();
    else load();
  });
  window.addEventListener('beforeunload', (event) => { if (hasUnsavedChanges() || busy || content.querySelector('[data-timetable-busy="true"],[data-moderation-busy="true"],[data-preferences-busy="true"],[data-activity-busy="true"]')) { event.preventDefault(); event.returnValue = ''; } });
  document.getElementById('print-planner').addEventListener('click', () => {
    if (!loaded || busy) return;
    pendingPrint = true;
    for (const area of content.querySelectorAll('textarea')) {
      if (!area.getClientRects().length) continue;
      area.style.height = 'auto'; area.style.height = area.scrollHeight + 'px';
    }
    window.print();
  });
  window.addEventListener('afterprint', () => {
    if (pendingPrint) for (const area of content.querySelectorAll('textarea')) area.style.height = '';
    for (const area of content.querySelectorAll('.term-auto-expand')) expandTermArea(area);
    pendingPrint = false;
    alignWeekRows(content.querySelector('.weekly-spread'));
  });
  window.addEventListener('beforeprint', () => {
    globalThis.plannerTextareaAutosize?.refresh();
    alignWeekRows(content.querySelector('.weekly-spread'));
  });
  load();
})();
