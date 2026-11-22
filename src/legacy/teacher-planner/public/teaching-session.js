(() => {
  function mount(host, data, helpers) {
    const { el } = helpers;
    const pilot = Boolean(data.teaching);
    const page = el('section', '', { class: 'paper-page session-planner', 'aria-label': pilot ? 'JPI session plan' : 'Scheduled session plan' });
    const back = el('button', 'Back to Teaching Dashboard', { type: 'button' });
    back.addEventListener('click', helpers.back);
    page.append(back, el('h2', 'Period Planner', { class: 'paper-heading' }),
      el('h3', pilot ? data.event.className + ' - ' + data.event.course : data.content.session.title),
      el('p', new Intl.DateTimeFormat('en-NZ', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(data.event.date + 'T00:00:00Z')) +
        (pilot ? ' | Period 2 | 10:00-11:00 | Room ' + data.event.location :
          ' | ' + data.event.label + (data.event.location ? ' | ' + data.event.location : ''))));
    function link(name, url) {
      return el('a', name, { href: url, target: '_blank', rel: 'noopener noreferrer' });
    }
    if (pilot) {
      const programme = el('p');
      programme.append(link(data.teaching.unit.title, data.teaching.unit.url), ' / ',
        link(data.teaching.lesson.title, data.teaching.lesson.url));
      page.append(programme);
    }
    const toggle = el('div', '', { class: 'term-notes-toggle planner-nav-buttons', role: 'group',
      'aria-label': 'Session Notes or Trello', 'data-planner-navigation': '' });
    const notesButton = el('button', 'Notes', { type: 'button', 'aria-pressed': 'true' });
    const trelloButton = el('button', helpers.showTrello ? 'Trello Planner' : 'Trello', { type: 'button', 'aria-pressed': 'false' });
    toggle.append(notesButton, trelloButton);
    const notes = el('section', '', { 'aria-label': 'Session Notes' });
    const trello = el('section', '', { 'aria-label': 'Session Trello', 'data-planner-navigation': '' });
    trello.hidden = true;
    trello.append(el('h3', 'Trello is not configured'),
      el('p', 'A session-tracker source has not been agreed. No Trello data is loaded and no cards are created. Your plan and progress remain in Notes.'));
    let teachingDay;
    function select(useNotes) {
      notes.hidden = !useNotes; trello.hidden = useNotes;
      notesButton.setAttribute('aria-pressed', String(useNotes));
      trelloButton.setAttribute('aria-pressed', String(!useNotes));
      helpers.viewChanged?.(useNotes);
      if (!useNotes && helpers.showTrello) helpers.showTrello(trello);
      else if (!useNotes && helpers.teachingDay) {
        if (!teachingDay) teachingDay = globalThis.plannerTeachingDayTrello.mount(trello, () => ({
          date: data.event.date, slot: data.event.slot, classKey: data.event.classKey,
          sessionType: pilot ? 'teaching' : data.content.session.type
        }), { el, request: helpers.teachingDay });
        else teachingDay.refreshContext();
      }
      globalThis.plannerTextareaAutosize?.refresh();
    }
    notesButton.addEventListener('click', () => select(true));
    trelloButton.addEventListener('click', () => select(false));
    page.append(toggle, notes, trello);
    function section(title) {
      const node = el('section', '', { class: 'session-section' });
      node.append(el('h3', title)); notes.append(node); return node;
    }
    function field(host, label, value, type = 'textarea') {
      const wrapper = el('label', '', { class: 'session-field' });
      wrapper.append(el('span', label));
      const input = el(type === 'textarea' ? 'textarea' : 'input', '', type === 'textarea' ? { rows: '3' } : { type });
      input.value = value ?? '';
      wrapper.append(input); host.append(wrapper); return input;
    }
    function originalNotes() {
      const legacy = el('details'); legacy.append(el('summary', 'Original Period Planner records'));
      const original = Object.entries(data.legacy.content).filter(([, value]) => value);
      if (!original.length) legacy.append(el('p', 'There are no saved original notes for this session. Existing records elsewhere are unchanged.'));
      else for (const [name, value] of original) legacy.append(el('h4', name), el('p', value, { class: 'session-preserved-text' }));
      const editLegacy = el('button', 'Edit original Period notes', { type: 'button', 'data-planner-navigation': '' });
      editLegacy.addEventListener('click', helpers.legacy);
      legacy.append(editLegacy); notes.append(legacy);
    }
    if (!pilot) {
      const settings = section('Session details');
      settings.append(el('p', data.event.source === 'KAMAR' ?
        'Timetable context: ' + data.event.title + '. Your plan does not change KAMAR.' :
        'Manually recorded commitment. No KAMAR timetable data is created or changed.'));
      const title = field(settings, 'Session title', data.content.session.title, 'text');
      title.required = true; title.maxLength = 200;
      const label = el('label', '', { class: 'session-field' }); label.append(el('span', 'Session type'));
      const type = el('select');
      for (const value of globalThis.plannerSessionSchema.types) type.append(el('option', value, { value }));
      type.value = data.content.session.type; type.disabled = data.event.slot === 'whanau';
      label.append(type); settings.append(label);
      const times = el('div', '', { class: 'session-timing' });
      const startTime = field(times, 'Planned start time', data.content.session.startTime, 'time');
      const endTime = field(times, 'Planned end time', data.content.session.endTime, 'time');
      settings.append(times);
      const prompts = {
        teaching: 'Teaching focus, routine, resources and preparation. Linked lesson progress is currently enabled only for verified JPI Period 2.',
        whanau: 'Whanau routine, notices, check-ins and preparation.',
        observation: 'Observation focus, arrangements and evidence to review.',
        meeting: 'Agenda, preparation, decisions and follow-up.',
        duty: 'Location, responsibilities and reminders.'
      };
      const planning = section('Notes');
      const hint = el('p', prompts[type.value]); planning.append(hint);
      type.addEventListener('change', () => { hint.textContent = prompts[type.value]; data.content.session.type = type.value; });
      const note = field(planning, 'Session notes', data.content.note); note.maxLength = 20000;
      const evaluation = el('details'); evaluation.append(el('summary', 'Review and follow-up - complete later'));
      const reflection = field(evaluation, 'Later evaluation', data.content.evaluation); reflection.maxLength = 20000;
      notes.append(evaluation);
      originalNotes(); host.append(page);
      if (helpers.initialTrello) select(false);
      return { read: () => ({ note: note.value, evaluation: reflection.value, activities: [],
        session: { title: title.value, type: type.value, startTime: startTime.value, endTime: endTime.value } }),
        saved: () => {} };
    }
    const routine = section('Regular class routine');
    routine.append(el('p', data.routine.priorities));
    const routineList = el('ul');
    for (const line of data.routine.instructions.split('\n').map(value => value.replace(/^[\s\u2022]+/, '').trim()).filter(Boolean)) {
      const item = el('li');
      const match = /^\[([^\]]+)\]\((https:\/\/[^)]+)\)$/.exec(line);
      item.append(match ? link(match[1], match[2]) : line);
      routineList.append(item);
    }
    routine.append(routineList);
    const openRoutine = el('button', 'Open existing CW Routine', { type: 'button', 'data-planner-navigation': '' });
    openRoutine.addEventListener('click', () => helpers.openRoutine(data.routine.id));
    routine.append(openRoutine, el('p', 'Routine content is reused, not copied. It does not automatically advance the unit.'));

    const previous = section('Previous progress - JPI only');
    const checkpoint = el('details', '', { 'data-planner-navigation': '' });
    const checkpointHeading = el('summary', data.checkpoint.confirmed_at ? 'Confirmed starting checkpoint' : 'Starting checkpoint - awaiting your confirmation');
    checkpoint.append(checkpointHeading);
    const checkpointNote = field(checkpoint, 'JPI starting checkpoint', data.checkpoint.checkpoint_note);
    checkpointNote.maxLength = 20000;
    const confirmCheckpoint = el('button', 'Confirm JPI starting checkpoint', { type: 'button' });
    const checkpointStatus = el('p', data.checkpoint.confirmed_at ?
      'Confirmed ' + new Date(data.checkpoint.confirmed_at).toLocaleString('en-NZ') + '. No previous teaching date was invented.' :
      'This is your reported starting point, not confirmed progress. Correct it before confirming.', { role: 'status' });
    confirmCheckpoint.addEventListener('click', async () => {
      confirmCheckpoint.disabled = true;
      try {
        const result = await helpers.checkpoint(checkpointNote.value, data.checkpoint.revision);
        data.checkpoint.revision = result.revision; data.checkpoint.confirmed_at = result.confirmed_at;
        checkpointHeading.textContent = 'Confirmed starting checkpoint';
        checkpointStatus.setAttribute('role', 'status');
        checkpointStatus.textContent = 'Confirmed ' + new Date(result.confirmed_at).toLocaleString('en-NZ') + '. No previous teaching date was invented.';
      }
      catch (error) { checkpointStatus.setAttribute('role', 'alert'); checkpointStatus.textContent = error.message; }
      finally { confirmCheckpoint.disabled = false; }
    });
    checkpoint.append(confirmCheckpoint, checkpointStatus); previous.append(checkpoint);
    if (data.awaitingConfirmation.length) previous.append(el('p',
      'Earlier sessions awaiting confirmation: ' + data.awaitingConfirmation.join(', ') + '. Suggestions use confirmed outcomes only.', { class: 'session-warning' }));
    if (data.previous.length) {
      const last = data.previous.at(-1), list = el('ul');
      previous.append(el('p', 'Last confirmed session: ' + String(last.session_date).slice(0, 10)));
      for (const activity of last.confirmed_content.activities) list.append(el('li',
        activity.title + ' - ' + activity.status + (activity.teachingNote ? ': ' + activity.teachingNote : '')));
      previous.append(list);
    } else previous.append(el('p', 'No dated teaching-session outcomes have been confirmed for JPI.'));

    const activities = section('Planned activities and actual progress');
    activities.append(el('p', 'Plan a flexible sequence. Status and actual-time edits autosave as a draft; use Confirm session progress to confirm outcomes. Blank actual time means not recorded, never the period length.'));
    const activityList = el('div', '', { class: 'session-activities' });
    activities.append(activityList);
    const rows = [];
    function dirty(node) { node.dispatchEvent(new Event('input', { bubbles: true })); }
    function addActivity(activity) {
      const card = el('article', '', { class: 'session-activity' });
      const header = el('div', '', { class: 'session-activity-header' });
      const title = field(header, 'Activity', activity.title, 'text'); title.required = true; title.maxLength = 200;
      const details = el('details', '', { class: 'session-activity-details' });
      details.append(el('summary', 'Timing and teaching note'));
      const timing = el('div', '', { class: 'session-timing' });
      const planned = field(timing, 'Planned minutes', activity.plannedMinutes, 'number');
      const actual = field(timing, 'Actual minutes (optional)', activity.actualMinutes, 'number');
      for (const input of [planned, actual]) { input.min = '0'; input.max = '1440'; input.step = '0.01'; }
      details.append(timing);
      const label = el('label', '', { class: 'session-field' }); label.append(el('span', 'Progress status'));
      const status = el('select');
      for (const [value, title] of [['planned', 'Planned / awaiting confirmation'], ['completed', 'Completed'], ['partial', 'Partial'], ['deferred', 'Deferred']]) {
        status.append(el('option', title, { value }));
      }
      status.value = activity.status; label.append(status); header.append(label);
      const teachingNote = field(details, 'Teaching note (optional)', activity.teachingNote); teachingNote.maxLength = 4000;
      const remove = el('button', 'Remove from this plan', { type: 'button' });
      const row = { activity, card, title, planned, actual, status, teachingNote };
      remove.addEventListener('click', () => {
        rows.splice(rows.indexOf(row), 1); card.remove(); dirty(activityList);
      });
      details.append(remove); card.append(header, details); rows.push(row); activityList.append(card);
    }
    data.content.activities.forEach(addActivity);
    const add = el('button', 'Add planned activity', { type: 'button' });
    add.addEventListener('click', () => {
      addActivity({ id: crypto.randomUUID(), sourceId: data.teaching.lesson.id, title: '',
        plannedMinutes: null, actualMinutes: null, status: 'planned', teachingNote: '' });
      dirty(activityList); rows.at(-1).title.focus();
    });
    activities.append(add);
    const outcomeStatus = el('p', '', { role: 'status', 'aria-live': 'polite' });
    const confirm = el('button', 'Confirm session progress', { type: 'button', 'data-planner-navigation': '' });
    confirm.disabled = !data.canConfirm;
    confirm.addEventListener('click', helpers.confirm);
    activities.append(confirm, outcomeStatus);
    if (!data.canConfirm) activities.append(el('p', 'This is a future session. Prepare the plan now; confirm actual outcomes on the teaching day or later.'));
    const resources = section('Resources and preparation');
    resources.append(link('Open original Binary Piano lesson', data.teaching.lesson.url));
    const resourceList = el('ul');
    for (const resource of data.teaching.resources) {
      const item = el('li'); item.append(link(resource.name, resource.url)); resourceList.append(item);
    }
    resources.append(resourceList, el('p', 'Have the existing prepared decoding worksheets and exercise books ready. The exact decoding worksheet link has not been identified; none was invented.'));
    const preparation = el('details'); preparation.append(el('summary', 'Original lesson preparation reminders'));
    const reminders = el('ul');
    data.teaching.preparation.forEach(value => reminders.append(el('li', value)));
    preparation.append(reminders); resources.append(preparation);
    const note = field(section('Session adjustments and reminders'), 'Session notes', data.content.note); note.maxLength = 20000;
    const evaluation = el('details'); evaluation.append(el('summary', 'Detailed evaluation - complete later'));
    const reflection = field(evaluation, 'Later evaluation', data.content.evaluation); reflection.maxLength = 20000;
    notes.append(evaluation);
    originalNotes();
    host.append(page);
    if (helpers.initialTrello) select(false);
    function read() {
      return { note: note.value, evaluation: reflection.value, activities: rows.map(row => ({
        id: row.activity.id, sourceId: row.activity.sourceId, title: row.title.value,
        plannedMinutes: row.planned.value === '' ? null : Number(row.planned.value),
        actualMinutes: row.actual.value === '' ? null : Number(row.actual.value),
        status: row.status.value, teachingNote: row.teachingNote.value
      })) };
    }
    function saved(result) {
      data.confirmed_at = result.confirmed_at; data.confirmed_content = result.confirmed_content;
      updateOutcomeStatus();
    }
    function updateOutcomeStatus() {
      const current = read().activities;
      const signature = items => JSON.stringify(items.map(item => [
        item.id, item.sourceId, item.title, item.plannedMinutes, item.actualMinutes, item.status, item.teachingNote
      ]));
      outcomeStatus.textContent = !data.confirmed_at ? 'No outcomes confirmed for this session.' :
        signature(current) === signature(data.confirmed_content.activities) ?
          'Progress confirmed ' + new Date(data.confirmed_at).toLocaleString('en-NZ') + '.' :
          'Previous confirmed progress is retained. Activity changes await explicit confirmation.';
    }
    notes.addEventListener('input', updateOutcomeStatus);
    notes.addEventListener('change', updateOutcomeStatus);
    updateOutcomeStatus();
    return { read, saved };
  }
  globalThis.plannerTeachingSession = { mount };
})();
