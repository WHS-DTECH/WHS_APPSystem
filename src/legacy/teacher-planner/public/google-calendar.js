(() => {
  'use strict';
  function mount(host, helpers) {
    const { el, request, mutate, renderWeek, sunday, today, weekDates, dayEvents, hourEvents, hourLabel, date, iso } = helpers;
    host.dataset.googleCalendar = '';
    host.className = 'google-calendar';
    host.setAttribute('aria-label', 'My Google Calendar');
    let start = sunday(today()), connection, selected = [], calendars = [], events = [], sequence = 0, loadSequence = 0;
    let waiting = false, timer, pollBusy = false;
    const title = el('h3', 'My Google Calendar');
    const account = el('p');
    const feedback = el('p', '', { role: 'status', 'aria-live': 'polite' });
    const actions = el('div', '', { class: 'google-calendar-actions' });
    const choices = el('details', '', { class: 'google-calendar-choices' });
    const navigation = el('div', '', { class: 'kamar-calendar-controls' });
    const previous = el('button', 'Previous week', { type: 'button' });
    const current = el('button', 'This week', { type: 'button' });
    const next = el('button', 'Next week', { type: 'button' });
    const heading = el('h4');
    const body = el('div');
    navigation.append(previous, current, heading, next);
    host.append(title, account, actions, feedback, choices, navigation, body);
    function message(text, error = false) {
      feedback.textContent = text;
      feedback.setAttribute('role', error ? 'alert' : 'status');
    }
    function button(label, action) {
      const node = el('button', label, { type: 'button' });
      node.addEventListener('click', action);
      return node;
    }
    function stopWaiting() {
      clearInterval(timer);
      waiting = false;
    }
    async function connect() {
      const popup = window.open('about:blank', '_blank', 'width=600,height=750');
      if (!popup) { message('Your browser blocked the Google sign-in tab. Allow pop-ups for this site, then try again.', true); return; }
      popup.opener = null;
      try {
        const result = await mutate('connect', 'POST');
        popup.location.href = result.url;
        message('Finish connecting in the Google sign-in tab. Your planner edits stay on this page.');
        stopWaiting();
        waiting = true;
        const previousConnection = connection?.connectionId, expires = Date.now() + 10 * 60000;
        actions.replaceChildren(button('Cancel waiting', () => {
          stopWaiting(); message('Stopped waiting. Close the Google sign-in tab if you do not want to connect.'); load();
        }));
        timer = setInterval(async () => {
          if (!host.isConnected || Date.now() > expires) {
            stopWaiting();
            if (host.isConnected) { message('Google sign-in timed out. Reload the connection or try connecting again.', true); actions.replaceChildren(button('Reload connection', load)); }
            return;
          }
          if (pollBusy) return;
          pollBusy = true;
          try {
            const status = await request('google-calendar/');
            if (waiting && status.connected && status.connectionId !== previousConnection) {
              stopWaiting();
              if (!popup.closed) popup.close();
              await load();
            }
          } catch (error) {
            stopWaiting(); message(error.message, true); actions.replaceChildren(button('Reload connection', load));
          } finally { pollBusy = false; }
        }, 3000);
      } catch (error) { popup.close(); message(error.message, true); }
    }
    function renderChoices() {
      choices.replaceChildren(el('summary', 'Choose calendars (up to 10)'));
      const group = el('fieldset');
      group.append(el('legend', 'Calendars visible in your planner'));
      for (const calendar of calendars) {
        const label = el('label');
        const checkbox = el('input', '', { type: 'checkbox', value: calendar.id });
        checkbox.checked = selected.includes(calendar.id);
        checkbox.addEventListener('change', async () => {
          const ids = [...group.querySelectorAll('input:checked')].map(input => input.value);
          group.disabled = true;
          message('Saving your calendar choices...');
          try {
            const result = await mutate('selection', 'PUT', { connectionId: connection.connectionId, calendarIds: ids });
            selected = result.selectedCalendars;
            await loadWeek();
          } catch (error) {
            for (const input of group.querySelectorAll('input')) input.checked = selected.includes(input.value);
            message(error.message, true);
          } finally { group.disabled = false; }
        });
        label.append(checkbox, el('span', calendar.summary + (calendar.primary ? ' (primary)' : '')));
        group.append(label);
      }
      choices.append(group, el('p', 'Choices are saved privately to your school account across all Term pages. KAMAR calendars appear here only after you subscribe to them in this Google account; Google controls their refresh timing.'));
    }
    function showEvents(value, hour, panel, buttons) {
      const hourly = Number.isInteger(hour);
      const label = new Intl.DateTimeFormat('en-NZ', { dateStyle: 'full', timeZone: 'UTC' }).format(date(value));
      panel.replaceChildren(el('h4', label + (hourly ? ' | ' + hourLabel(hour) + ' - ' + hourLabel(hour + 1) : '')));
      const entries = hourly ? hourEvents(events, value, hour) : dayEvents(events, value);
      if (!entries.length) panel.append(el('p', 'No events for this ' + (hourly ? 'hour.' : 'day.')));
      for (const event of entries) {
        const item = el('article');
        item.append(el('h5', event.title), el('p', event.calendar));
        const format = time => new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Pacific/Auckland' }).format(new Date(time));
        item.append(el('p', event.allDay ? 'All day' : format(event.start) + ' - ' + format(event.end) + ' (NZ time)'));
        if (event.location) item.append(el('p', event.location));
        if (event.description) item.append(el('p', event.description, { class: 'kamar-description' }));
        if (event.htmlLink) item.append(el('a', 'Open event in Google Calendar', { href: event.htmlLink, target: '_blank', rel: 'noopener noreferrer' }));
        panel.append(item);
      }
      for (const node of buttons) node.setAttribute('aria-pressed', String(node.dataset.date === value &&
        (hourly ? node.dataset.hour === String(hour) : node.dataset.hour === undefined)));
    }
    async function loadWeek() {
      const ticket = ++sequence;
      const days = weekDates(start);
      heading.textContent = days[0] + ' - ' + days[6];
      body.replaceChildren(el('p', 'Loading this week...'));
      previous.disabled = current.disabled = next.disabled = true;
      try {
        const result = await request('google-calendar/events?start=' + start);
        if (ticket !== sequence || !host.isConnected) return;
        if (result.connectionId !== connection.connectionId) throw new Error('Your connected Google account changed. Reload the connection.');
        events = result.events;
        const panel = el('section', '', { class: 'kamar-day-details kamar-hour-panel', tabindex: '-1', 'aria-label': 'Selected Google Calendar events', 'aria-live': 'polite' });
        const buttons = [];
        const show = (value, hour) => {
          showEvents(value, hour, panel, buttons);
          panel.focus({ preventScroll: true });
          panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        };
        const layout = el('div', '', { class: 'kamar-week-layout google-week-layout' });
        layout.append(renderWeek(events, start, show, buttons, { label: 'My Google Calendar, Sunday to Saturday, 8am to 5pm', noun: 'events' }), panel);
        body.replaceChildren(
          el('p', 'Read-only, New Zealand time. Each hour shows up to three events; select an hour for all details. All-day and outside-hours events are above the hourly grid.'),
          layout);
        showEvents(days.includes(today()) ? today() : start, undefined, panel, buttons);
        message(selected.length ? (events.length ? 'Calendar refreshed.' : 'No events in your selected calendars this week.') : 'Choose at least one calendar to display its events.');
      } catch (error) {
        if (ticket !== sequence || !host.isConnected) return;
        body.replaceChildren(button('Retry this week', loadWeek));
        message(error.message, true);
      } finally {
        if (ticket === sequence) {
          previous.disabled = start <= '2000-01-02';
          next.disabled = start >= '2100-12-26';
          current.disabled = false;
        }
      }
    }
    async function load() {
      const ticket = ++loadSequence;
      stopWaiting();
      ++sequence;
      choices.hidden = navigation.hidden = true;
      body.replaceChildren(); actions.replaceChildren();
      message('Checking your Google Calendar connection...');
      try {
        const result = await request('google-calendar/');
        if (!host.isConnected || ticket !== loadSequence) return;
        connection = result;
        if (!result.configured) {
          account.textContent = 'Google Calendar setup is not complete yet.';
          message('The project owner needs to configure Google Calendar API access and credentials. No calendar has been connected.');
          actions.append(button('Check setup again', load));
          return;
        }
        account.textContent = result.connected ? 'Connected Google account: ' + result.email : 'Connect a Google account to see your own calendars here.';
        actions.append(button(result.connected ? 'Change Google account' : 'Connect Google Calendar', connect));
        if (!result.connected) { message('Google sign-in opens separately. This does not change your school account or your private planner.'); return; }
        actions.append(button('Reload connection', load), button('Disconnect', async () => {
          if (!confirm('Disconnect Google Calendar from your planner? Your Google events and planner notes will not be deleted.')) return;
          try {
            const disconnected = await mutate('', 'DELETE', { connectionId: connection.connectionId });
            await load();
            message(disconnected.warning || 'Google Calendar disconnected.', Boolean(disconnected.warning));
          } catch (error) { message(error.message, true); }
        }), el('a', 'Open Google Calendar', { href: 'https://calendar.google.com/calendar/u/0/r?authuser=' + encodeURIComponent(result.email), target: '_blank', rel: 'noopener noreferrer' }));
        const list = await request('google-calendar/calendars');
        if (!host.isConnected || ticket !== loadSequence) return;
        if (list.connectionId !== result.connectionId) throw new Error('Your Google account changed. Reload the connection.');
        calendars = list.calendars; selected = result.selectedCalendars;
        renderChoices();
        choices.hidden = navigation.hidden = false;
        await loadWeek();
      } catch (error) {
        if (!host.isConnected || ticket !== loadSequence) return;
        message(error.message, true);
        actions.append(button('Retry connection', load));
      }
    }
    previous.addEventListener('click', () => { const value = date(start); value.setUTCDate(value.getUTCDate() - 7); start = iso(value); loadWeek(); });
    next.addEventListener('click', () => { const value = date(start); value.setUTCDate(value.getUTCDate() + 7); start = iso(value); loadWeek(); });
    current.addEventListener('click', () => { start = sunday(today()); loadWeek(); });
    load();
  }
  globalThis.plannerGoogleCalendar = { mount };
})();
