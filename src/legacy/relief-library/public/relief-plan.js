(() => {
  const calendar = document.getElementById('relief-plan-calendar');
  const details = document.getElementById('relief-plan-details');
  const eventDescription = document.getElementById('relief-plan-description');
  const status = document.getElementById('relief-plan-status');
  const previousButton = document.getElementById('relief-plan-previous');
  const todayButton = document.getElementById('relief-plan-today');
  const nextButton = document.getElementById('relief-plan-next');
  const dateInput = document.getElementById('relief-plan-date');
  const monthLabel = document.getElementById('relief-plan-month-label');
  const eventsUrl = document.body.dataset.reliefEventsUrl;
  let events = [];
  let viewDate = new Date();

  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const parseDate = (value) => {
    const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const date = new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]));
    return date.getFullYear() === Number(match[3]) &&
      date.getMonth() === Number(match[1]) - 1 &&
      date.getDate() === Number(match[2]) ? date : null;
  };

  const isoDate = (date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');

  const formatDate = (value) => {
    const date = parseDate(value);
    return date ? date.toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric'
    }) : value;
  };

  const descriptionHtml = (value) => escapeHtml(value)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

  const showDetails = (event) => {
    const date = `<strong>${escapeHtml(formatDate(event.startDate))}</strong>` +
      (event.endDate && event.endDate !== event.startDate
        ? ` to <strong>${escapeHtml(formatDate(event.endDate))}</strong>` : '');
    details.innerHTML = `
      <h2>${escapeHtml(event.subject)}</h2>
      <p class="relief-plan-detail-date">${date}</p>
      ${event.location ? `<p><strong>Location:</strong> ${escapeHtml(event.location)}</p>` : ''}
      <p class="relief-plan-description">${descriptionHtml(event.description).replace(/\n/g, '<br>')}</p>
    `;

    const aboutText = event.aboutTheEvent || event.description ||
      'No description available for this event.';
    eventDescription.innerHTML = `
      <h2>Event Description</h2>
      <p class="relief-plan-about">${descriptionHtml(aboutText).replace(/\n/g, '<br>')}</p>
    `;
  };

  const renderCalendar = () => {
    const byDate = new Map();
    events.forEach((event, index) => {
      const date = parseDate(event.startDate);
      if (!date) return;
      const key = isoDate(date);
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push({ event, index });
    });

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const first = new Date(year, month, 1);
    const days = new Date(year, month + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    const todayKey = isoDate(new Date());
    let cells = Array.from({ length: offset }, () =>
      '<div class="relief-plan-day relief-plan-day-empty" aria-hidden="true"></div>').join('');

    for (let day = 1; day <= days; day += 1) {
      const date = new Date(year, month, day);
      const dateKey = isoDate(date);
      const dayEvents = byDate.get(dateKey) || [];
      const todayClass = dateKey === todayKey ? ' relief-plan-day-today' : '';
      cells += `<div class="relief-plan-day${todayClass}"><time datetime="${dateKey}">${day}</time>` +
        (dayEvents.length
          ? dayEvents.map(({ event, index }) =>
            `<button class="relief-plan-event" type="button" data-event-index="${index}" title="${escapeHtml(event.subject)}">${escapeHtml(event.subject)}</button>`
          ).join('')
          : '<span class="relief-plan-no-event">No events</span>') + '</div>';
    }

    monthLabel.textContent = first.toLocaleDateString(undefined, {
      year: 'numeric', month: 'long'
    });
    dateInput.value = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    calendar.innerHTML = `<section class="relief-plan-month"><div class="relief-plan-weekdays" aria-hidden="true"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div><div class="relief-plan-days">${cells}</div></section>`;

    calendar.querySelectorAll('[data-event-index]').forEach((button) => {
      button.addEventListener('click', () =>
        showDetails(events[Number(button.dataset.eventIndex)]));
    });
  };

  const changeMonth = (amount) => {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + amount, 1);
    renderCalendar();
  };

  const loadEvents = async () => {
    const response = await fetch(eventsUrl, { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !Array.isArray(data.events)) {
      throw new Error(data.error || 'Relief Plan events could not be loaded.');
    }
    events = data.events;
    status.textContent = `${events.length} events loaded for ${data.year}.`;
    renderCalendar();
  };

  previousButton.addEventListener('click', () => changeMonth(-1));
  nextButton.addEventListener('click', () => changeMonth(1));
  todayButton.addEventListener('click', () => {
    viewDate = new Date();
    renderCalendar();
  });
  dateInput.addEventListener('change', () => {
    if (!dateInput.value) return;
    const selected = new Date(`${dateInput.value}T00:00:00`);
    viewDate = new Date(selected.getFullYear(), selected.getMonth(), 1);
    renderCalendar();
  });

  loadEvents().catch((error) => {
    status.textContent = error.message;
    status.setAttribute('role', 'alert');
  });
})();
