(function () {
  const calendarApi = '/teacher-planner/api/kamar-calendar';
  const plannerApi = '/teacher-planner/api/planner';
  const yearInput = document.getElementById('schoolCalendarYear');
  const termPreview = document.getElementById('schoolTermPreview');
  const termStatus = document.getElementById('schoolTermStatus');
  const publishButton = document.getElementById('publishSchoolTerms');
  const previousButton = document.getElementById('previousSchoolMonth');
  const nextButton = document.getElementById('nextSchoolMonth');
  const monthHeading = document.getElementById('schoolCalendarMonth');
  const calendarStatus = document.getElementById('schoolCalendarStatus');
  const calendarEvents = document.getElementById('schoolCalendarEvents');
  const calendarLinks = document.getElementById('schoolCalendarLinks');
  let csrf = '';
  let month = 1;
  let terms = null;
  let schoolSettings = null;
  let canEdit = false;
  let busy = false;
  let termLoadId = 0;
  let calendarLoadId = 0;

  function setStatus(element, message, error = false) {
    element.textContent = message;
    element.setAttribute('role', error ? 'alert' : 'status');
  }
  async function request(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    const method = String(options.method || 'GET').toUpperCase();
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers['x-planner-csrf'] = csrf;
    const response = await fetch(url, { ...options, headers, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'KAMAR School Calendar request failed.');
    return payload;
  }
  async function loadCsrf() {
    const session = await request(plannerApi + '/session');
    csrf = session.csrf;
    if (typeof csrf !== 'string' || csrf.length < 32) throw new Error('The Planner form session is unavailable. Reload this page.');
  }
  function dateLabel(value) {
    return new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z'));
  }
  function eventTime(value) {
    if (!value.endsWith('Z')) return value.replace('T', ' ');
    return new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium', timeStyle: 'short',
      timeZone: 'Pacific/Auckland' }).format(new Date(value));
  }
  function renderTerms() {
    termPreview.replaceChildren();
    if (!terms) {
      termPreview.textContent = 'Term dates are unavailable until the KAMAR feed has a first day back and four school-holiday ranges for this year.';
      publishButton.disabled = true;
      return;
    }
    const table = document.createElement('table');
    table.className = 'school-term-table';
    const head = document.createElement('thead');
    const header = document.createElement('tr');
    for (const label of ['Term', 'Start', 'Last school day']) {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = label;
      header.append(cell);
    }
    head.append(header);
    const body = document.createElement('tbody');
    for (let term = 1; term <= 4; term++) {
      const row = document.createElement('tr');
      for (const value of ['Term ' + term, terms['term' + term + 'Start'], terms['term' + term + 'End']]) {
        const cell = document.createElement('td');
        cell.textContent = value.startsWith('Term ') ? value : dateLabel(value);
        row.append(cell);
      }
      body.append(row);
    }
    table.append(head, body);
    termPreview.append(table);
    if (schoolSettings) {
      const current = document.createElement('p');
      current.className = 'school-calendar-current';
      const currentDates = [];
      for (let term = 1; term <= 4; term++) {
        const start = schoolSettings['term' + term + 'Start'];
        const end = schoolSettings['term' + term + 'End'];
        if (start || end) currentDates.push('Term ' + term + ': ' + (start ? dateLabel(start) : 'not set') +
          ' – ' + (end ? dateLabel(end) : 'not set'));
      }
      current.textContent = currentDates.length ? 'Currently published: ' + currentDates.join('; ') :
        'No school-wide term dates are currently published for this year.';
      termPreview.append(current);
    }
    publishButton.disabled = busy || !canEdit;
  }
  function monthName(year, value) {
    return new Intl.DateTimeFormat('en-NZ', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(year, value - 1, 1)));
  }
  function eventDate(value) {
    if (!value.endsWith('Z')) return value.slice(0, 10);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric',
      month: '2-digit', day: '2-digit' }).format(new Date(value));
  }
  function endsAtMidnight(value) {
    if (value.endsWith('Z')) return new Intl.DateTimeFormat('en-GB', { timeZone: 'Pacific/Auckland',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(value)) === '00:00:00';
    return value.endsWith('T00:00:00');
  }
  function eventsForDay(events, value) {
    return events.filter(event => eventDate(event.start) <= value &&
      ((event.allDay || endsAtMidnight(event.end)) ? value < eventDate(event.end) : value <= eventDate(event.end)));
  }
  function showDay(events, value, details, buttons) {
    const title = new Intl.DateTimeFormat('en-NZ', { dateStyle: 'full', timeZone: 'UTC' })
      .format(new Date(value + 'T00:00:00Z'));
    details.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = title;
    details.append(heading);
    const matches = eventsForDay(events, value);
    if (!matches.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No published school events for this day.';
      details.append(empty);
    }
    for (const event of matches) {
      const article = document.createElement('article');
      const eventTitle = document.createElement('h4');
      eventTitle.textContent = event.title;
      article.append(eventTitle);
      const time = document.createElement('p');
      time.textContent = event.allDay ? 'All day' : eventTime(event.start) + ' – ' + eventTime(event.end) + ' (NZ time)';
      article.append(time);
      if (event.location) {
        const location = document.createElement('p');
        location.textContent = 'Location: ' + event.location;
        article.append(location);
      }
      if (event.description) {
        const description = document.createElement('p');
        description.className = 'school-calendar-description';
        description.textContent = event.description;
        article.append(description);
      }
      details.append(article);
    }
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.date === value));
  }
  function renderMonth(year, selectedMonth, result) {
    calendarEvents.replaceChildren();
    calendarLinks.replaceChildren();
    monthHeading.textContent = monthName(year, selectedMonth);
    const table = document.createElement('table');
    table.className = 'school-kamar-month';
    const caption = document.createElement('caption');
    caption.textContent = 'KAMAR School Events — ' + monthHeading.textContent;
    table.append(caption);
    const head = document.createElement('thead');
    const header = document.createElement('tr');
    for (const label of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = label;
      header.append(cell);
    }
    head.append(header);
    table.append(head);
    const body = document.createElement('tbody');
    const offset = (new Date(Date.UTC(year, selectedMonth - 1, 1)).getUTCDay() + 6) % 7;
    const dayCount = new Date(Date.UTC(year, selectedMonth, 0)).getUTCDate();
    const count = Math.ceil((offset + dayCount) / 7) * 7;
    const buttons = [];
    const details = document.createElement('section');
    details.className = 'school-kamar-details';
    details.setAttribute('aria-live', 'polite');
    for (let index = 0; index < count; index++) {
      if (index % 7 === 0) body.append(document.createElement('tr'));
      const cell = document.createElement('td');
      const day = index - offset + 1;
      if (day >= 1 && day <= dayCount) {
        const value = year + '-' + String(selectedMonth).padStart(2, '0') + '-' + String(day).padStart(2, '0');
        const events = eventsForDay(result.events, value);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'school-kamar-day';
        button.dataset.date = value;
        button.setAttribute('aria-label', value + ': ' + events.length + ' school events');
        button.setAttribute('aria-pressed', 'false');
        const dayNumber = document.createElement('span');
        dayNumber.textContent = String(day);
        button.append(dayNumber);
        for (const event of events.slice(0, 2)) {
          const label = document.createElement('span');
          label.textContent = event.title;
          button.append(label);
        }
        if (events.length > 2) {
          const more = document.createElement('span');
          more.textContent = '+' + (events.length - 2) + ' more';
          button.append(more);
        }
        button.addEventListener('click', () => showDay(result.events, value, details, buttons));
        buttons.push(button);
        cell.append(button);
      }
      body.children[body.children.length - 1].append(cell);
    }
    table.append(body);
    calendarEvents.append(table, details);
    if (!result.events.length) setStatus(calendarStatus, 'No published school events for this month. The KAMAR feed may not include future dates yet.');
    const selectedDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric',
      month: '2-digit', day: '2-digit' }).format(new Date());
    const firstOfMonth = year + '-' + String(selectedMonth).padStart(2, '0') + '-01';
    showDay(result.events, selectedDate.startsWith(firstOfMonth.slice(0, 7)) ? selectedDate : firstOfMonth, details, buttons);
    if (result.googleUrl) {
      const google = document.createElement('a');
      google.className = 'hero-link';
      google.href = result.googleUrl;
      google.target = '_blank';
      google.rel = 'noopener noreferrer';
      google.textContent = 'Add School Events to Google Calendar';
      calendarLinks.append(google);
    }
    if (result.sourceUrl) {
      const source = document.createElement('a');
      source.href = result.sourceUrl;
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      source.textContent = 'Public KAMAR calendar subscription (.ics)';
      calendarLinks.append(source);
    }
    const checked = document.createElement('p');
    checked.textContent = 'Source checked: ' + new Date(result.fetchedAt).toLocaleString('en-NZ') + '. Times shown in New Zealand time.';
    calendarLinks.append(checked);
  }
  async function loadTerms(year, requestId) {
    termPreview.textContent = 'Loading KAMAR term dates...';
    setStatus(termStatus, '');
    terms = null;
    schoolSettings = null;
    canEdit = false;
    publishButton.disabled = true;
    try {
      const [suggestion, saved] = await Promise.all([
        request(calendarApi + '/' + year + '/terms'),
        request(plannerApi + '/school-settings/' + year)
      ]);
      if (requestId !== termLoadId) return;
      terms = suggestion.dates;
      schoolSettings = saved.content || {};
      canEdit = saved.canEdit === true;
      renderTerms();
      if (!canEdit) setStatus(termStatus, 'You can review these dates, but your account cannot publish shared Planner settings.', true);
      else setStatus(termStatus, 'Review the derived dates, then publish once for all Planner staff.');
    } catch (error) {
      if (requestId !== termLoadId) return;
      renderTerms();
      setStatus(termStatus, error.message, true);
    }
  }
  async function loadMonth(year, selectedMonth, requestId) {
    calendarEvents.replaceChildren();
    setStatus(calendarStatus, 'Loading public school events...');
    monthHeading.textContent = monthName(year, selectedMonth);
    try {
      const result = await request(calendarApi + '/' + year + '/' + selectedMonth);
      if (requestId !== calendarLoadId) return;
      renderMonth(year, selectedMonth, result);
      if (result.events.length) setStatus(calendarStatus, 'Public school events loaded.');
    } catch (error) {
      if (requestId !== calendarLoadId) return;
      setStatus(calendarStatus, error.message, true);
    }
  }
  async function loadYear(year, selectedMonth = month) {
    const termRequestId = ++termLoadId;
    const calendarRequestId = ++calendarLoadId;
    yearInput.value = String(year);
    month = selectedMonth;
    publishButton.disabled = true;
    await Promise.all([loadTerms(year, termRequestId), loadMonth(year, month, calendarRequestId)]);
  }
  function changeMonth(offset) {
    if (busy) return;
    const current = new Date(Date.UTC(Number(yearInput.value), month - 1 + offset, 1));
    const year = current.getUTCFullYear();
    const selectedMonth = current.getUTCMonth() + 1;
    if (year < 2000 || year > 2100) return;
    month = selectedMonth;
    if (year !== Number(yearInput.value)) return loadYear(year, selectedMonth);
    const requestId = ++calendarLoadId;
    loadMonth(year, selectedMonth, requestId);
  }
  async function publishTerms() {
    if (busy || !terms || !canEdit) return;
    const year = Number(yearInput.value);
    if (!window.confirm('Publish these KAMAR-derived term dates to shared Teacher Planner settings for ' + year +
      '? This updates term dates for all staff. Existing teacher/student first-day settings and school events are preserved.')) return;
    busy = true;
    publishButton.disabled = true;
    yearInput.disabled = true;
    previousButton.disabled = true;
    nextButton.disabled = true;
    setStatus(termStatus, 'Publishing shared term dates...');
    try {
      const latest = await request(plannerApi + '/school-settings/' + year);
      if (latest.canEdit !== true) throw new Error('This account can no longer edit shared Planner dates.');
      const content = { ...(latest.content || {}), ...terms };
      await request(plannerApi + '/school-settings/' + year, {
        method: 'PUT',
        body: JSON.stringify({ revision: latest.revision, content })
      });
      schoolSettings = content;
      renderTerms();
      setStatus(termStatus, 'KAMAR term dates published to shared Teacher Planner settings for ' + year + '. All staff will use these dates.');
    } catch (error) {
      setStatus(termStatus, error.message, true);
    } finally {
      busy = false;
      yearInput.disabled = false;
      previousButton.disabled = false;
      nextButton.disabled = false;
      publishButton.disabled = !terms || !canEdit;
    }
  }
  yearInput.value = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', year: 'numeric' }).format(new Date());
  const currentYear = Number(yearInput.value);
  month = Number(new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', month: 'numeric' }).format(new Date()));
  previousButton.addEventListener('click', () => changeMonth(-1));
  nextButton.addEventListener('click', () => changeMonth(1));
  yearInput.addEventListener('change', () => {
    const year = Number(yearInput.value);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      setStatus(termStatus, 'Choose a year from 2000 to 2100.', true);
      return;
    }
    loadYear(year, year === currentYear ? month : 1);
  });
  publishButton.addEventListener('click', publishTerms);
  loadCsrf().then(() => loadYear(Number(yearInput.value), month)).catch(error => {
    setStatus(termStatus, error.message, true);
    setStatus(calendarStatus, error.message, true);
  });
})();
