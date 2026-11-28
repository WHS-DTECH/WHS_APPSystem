(() => {
  function mount(host, data, helpers) {
    const { el } = helpers;
    const pilot = Boolean(data.teaching);
    const page = el('section', '', { class: 'paper-page session-planner', 'aria-label': pilot ? 'JPI session plan' : 'Scheduled session plan' });
    page.append(el('h2', 'Period Planner', { class: 'paper-heading' }),
      el('h3', pilot ? data.event.className + ' - ' + data.event.course : data.content.session.title),
      el('p', globalThis.plannerSessionSchema.dateLabel(data.event.date) +
        (pilot ? ' | Period 2 | 10:00-11:00 | Room ' + data.event.location :
          ' | ' + data.event.label + (data.event.location ? ' | ' + data.event.location : ''))));
    function link(name, url) {
      return el('a', name, { href: url, target: '_blank', rel: 'noopener noreferrer' });
    }
    const toggle = el('div', '', { class: 'term-notes-toggle planner-nav-buttons', role: 'group',
      'aria-label': 'Session views', 'data-planner-navigation': '' });
    const notesButton = el('button', 'Notes', { type: 'button', 'aria-pressed': 'true' });
    const rollButton = el('button', 'Class Roll', { type: 'button', 'aria-pressed': 'false' });
    const trelloButton = el('button', helpers.showTrello ? 'Trello Planner' : 'Trello', { type: 'button', 'aria-pressed': 'false' });
    toggle.append(notesButton, trelloButton, rollButton);
    const notes = el('section', '', { 'aria-label': 'Session Notes' });
    const roll = el('section', '', { 'aria-label': 'Class Roll' });
    roll.hidden = true;
    const trello = el('section', '', { 'aria-label': 'Session Trello', 'data-planner-navigation': '' });
    trello.hidden = true;
    trello.append(el('h3', 'Trello is not configured'),
      el('p', 'A session-tracker source has not been agreed. No Trello data is loaded and no cards are created. Your plan and progress remain in Notes.'));
    let teachingDay;
    async function showRoll() {
      roll.replaceChildren(el('h3', 'Class Roll'), el('p', 'Loading the school class list...', { role: 'status' }));
      try {
        if (!helpers.classRoll) throw new Error('The school class-list connection is unavailable.');
        const roster = await helpers.classRoll(data.event);
        roll.replaceChildren(el('h3', 'Class Roll'),
          el('p', 'Term ' + roster.term + ' KAMAR timetable snapshot. Membership may have changed since this teaching date.'));
        if (!roster.students.length) roll.append(el('p', 'No students were found in this class list.'));
        else {
          const list = el('ul');
          roster.students.forEach(student => list.append(el('li', student.name)));
          roll.append(list);
        }
      } catch (error) {
        roll.replaceChildren(el('h3', 'Class Roll'), el('p', 'Class roll unavailable: ' + error.message, { role: 'alert' }));
      }
    }
    function select(view) {
      const current = view === 'roll' ? 'roll' : view ? 'notes' : 'trello';
      notes.hidden = current !== 'notes'; roll.hidden = current !== 'roll'; trello.hidden = current !== 'trello';
      notesButton.setAttribute('aria-pressed', String(current === 'notes'));
      rollButton.setAttribute('aria-pressed', String(current === 'roll'));
      trelloButton.setAttribute('aria-pressed', String(current === 'trello'));
      helpers.viewChanged?.(current === 'notes', current);
      if (current === 'notes') helpers.refreshPlannedTitles?.();
      if (current === 'roll') void showRoll();
      if (current === 'trello' && helpers.showTrello) helpers.showTrello(trello);
      else if (current === 'trello' && helpers.teachingDay) {
        if (!teachingDay) teachingDay = globalThis.plannerTeachingDayTrello.mount(trello, () => ({
          date: data.event.date, slot: data.event.slot, classKey: data.event.classKey,
          sessionType: pilot ? 'teaching' : data.content.session.type
        }), { el, request: helpers.teachingDay });
        else teachingDay.refreshContext();
      }
      globalThis.plannerTextareaAutosize?.refresh();
    }
    notesButton.addEventListener('click', () => select(true));
    rollButton.addEventListener('click', () => select('roll'));
    trelloButton.addEventListener('click', () => select(false));
    page.append(toggle, notes, roll, trello);
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
    function combinedNotes(content) {
      return [content?.actualProgress, content?.note].filter(value => typeof value === 'string' && value.length).join('\n\n');
    }
    const slotOutcomes = (data.content.slotOutcomes || []).map(item => ({ ...item }));
    function savedSlotOutcomes() {
      return slotOutcomes.length || data.content.slotOutcomes ? { slotOutcomes: slotOutcomes.map(item => ({ ...item })) } : {};
    }
    function pathwayUnits() {
      const box = el('section', '', { class: 'session-pathway-units', 'aria-label': 'Pathway Units' });
      box.append(el('h3', 'Pathway Units'));
      notes.append(box);
      function show(units, warning) {
        const list = el('ul');
        for (const unit of units) {
          const item = el('li', '', unit.current ? { class: 'session-pathway-current' } : {});
          item.append(link(unit.title, unit.url));
          if (unit.current) item.append(el('span', 'Current unit', { class: 'session-pathway-current-label' }));
          if (unit.lesson) {
            const lesson = el('p');
            lesson.append(link(unit.lesson.title, unit.lesson.url));
            item.append(lesson);
          }
          list.append(item);
        }
        box.replaceChildren(el('h3', 'Pathway Units'), ...(units.length ? [list] :
          [el('p', 'No pathway units are available for this course.')]),
        ...(warning ? [el('p', warning, { role: 'alert' })] : []));
      }
      if (pilot) show([{ ...data.teaching.unit, current: true, lesson: data.teaching.lesson }]);
      else box.append(el('p', 'Loading pathway units...', { role: 'status' }));
      if (helpers.pathwayUnits) {
        helpers.pathwayUnits(data).then(result => show(result.units, result.warning)).catch(error => {
          const warning = el('p', 'Pathway units unavailable: ' + error.message, { role: 'alert' });
          if (!pilot) box.replaceChildren(el('h3', 'Pathway Units'), warning);
          else box.append(warning);
        });
      } else if (!pilot) show([]);
    }
    function originalNotes() {
      const legacy = el('details'); legacy.append(el('summary', 'Original Period Planner records'));
      const original = Object.entries(data.legacy.content).filter(([, value]) => value);
      if (!original.length) legacy.append(el('p', 'There are no saved original notes for this session. Existing records elsewhere are unchanged.'));
      else for (const [name, value] of original) legacy.append(el('h4', name), el('p', value, { class: 'session-preserved-text' }));
      const editLegacy = el('button', 'Edit original Period notes', { type: 'button', 'data-planner-navigation': '' });
      editLegacy.addEventListener('click', helpers.legacy);
      legacy.append(editLegacy); notes.append(legacy);
      if (data.unassignedNotes) {
        const unassigned = el('details');
        unassigned.append(el('summary', 'Earlier date and period notes (class not verified)'),
          el('p', 'These notes were saved before class-specific sessions. They have not been assigned to this class.'));
        if (data.unassignedNotes.session?.title) unassigned.append(el('h4', 'Session title'),
          el('p', data.unassignedNotes.session.title, { class: 'session-preserved-text' }));
        for (const [label, value] of [['Session notes', data.unassignedNotes.note], ['Later evaluation', data.unassignedNotes.evaluation],
          ['Actual progress', data.unassignedNotes.actualProgress]]) {
          if (value) unassigned.append(el('h4', label), el('p', value, { class: 'session-preserved-text' }));
        }
        notes.append(unassigned);
      }
      if (data.otherClassNotes?.length) {
        const other = el('details');
        other.append(el('summary', 'Other saved class notes for this date and period'),
          el('p', 'These notes are kept separately and do not overwrite this session.'));
        for (const item of data.otherClassNotes) {
          other.append(el('h4', item.classKey));
          for (const [label, value] of [['Actual progress', item.content.actualProgress], ['Session notes', item.content.note],
            ['Later evaluation', item.content.evaluation]]) {
            if (value) other.append(el('h5', label), el('p', value, { class: 'session-preserved-text' }));
          }
        }
        notes.append(other);
      }
    }
    function plannedReference(host) {
      const reference = el('div', '', { 'aria-label': 'Planned activity titles' });
      host.append(reference);
      const saved = (data.revision > 0 || data.event.date >= new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date())) ? data.content.activities.map(item => item.title).filter(Boolean) : [];
      function show(titles, source, error) {
        reference.replaceChildren();
        const values = titles.length ? titles : saved;
        if (!values.length) reference.append(el('p', 'No planned activity titles are available.'));
        else {
          reference.append(el('p', titles.length ? source : data.revision > 0 ? 'Saved session activities:' : 'Draft session activities:'));
          const list = el('div', '', { class: 'session-slot-rows' });
          const occurrences = new Map();
          values.forEach((title, index) => {
            const occurrence = (occurrences.get(title) || 0) + 1;
            occurrences.set(title, occurrence);
            const row = el('div', '', { class: 'session-slot-row' });
            const label = el('label', '', { class: 'session-slot-status' });
            label.append(el('span', 'Slot ' + (index + 1) + ' status', { class: 'session-slot-status-label' }));
            const status = el('select', '', { 'aria-label': 'Slot ' + (index + 1) + ' status for ' + title });
            for (const [value, text] of [['', 'Select status'], ['taught', 'Taught'],
              ['partial', 'Partially taught'], ['not_taught', 'Not taught']]) status.append(el('option', text, { value }));
            status.value = slotOutcomes.find(item => item.title === title && item.occurrence === occurrence)?.status || '';
            if (title.length > 2000 || !title.trim()) {
              status.disabled = true;
              row.append(el('p', 'This activity title cannot be saved as a status. Shorten it in the source plan.', { role: 'alert' }));
            }
            status.addEventListener('change', () => {
              const old = slotOutcomes.findIndex(item => item.title === title && item.occurrence === occurrence);
              if (old >= 0) slotOutcomes.splice(old, 1);
              if (status.value) slotOutcomes.push({ title, occurrence, status: status.value });
            });
            label.append(status);
            row.append(el('strong', 'Slot ' + (index + 1)), el('span', title, { class: 'session-slot-name' }), label);
            list.append(row);
          });
          reference.append(list);
        }
        if (error) reference.append(el('p', error, { role: 'alert' }));
      }
      show([], '');
      helpers.plannedTitles?.(show);
    }
    function previousProgress() {
      if (data.event.classKey !== 'JPI' && !pilot) return;
      const name = data.event.className || data.event.classKey;
      const previous = section('Previous progress — ' + name);
      const last = data.previousSession;
      if (!last) {
        previous.append(el('p', 'No earlier saved session was found for ' + name + '.'));
        return;
      }
      const period = globalThis.plannerSessionSchema.slots.find(item => item[0] === last.slot_key)?.[1] || last.slot_key;
      previous.append(el('p', 'Previous session: ' + String(last.session_date).slice(0, 10) + ' | ' + period));
      const actual = combinedNotes(last.content);
      const outcomes = last.confirmed_content?.activities?.filter(item => item.status !== 'planned') || [];
      if (actual) previous.append(el('p', actual, { class: 'session-preserved-text' }));
      if (outcomes.length) {
        previous.append(el('p', 'Confirmed activity outcomes:'));
        const list = el('ul');
        for (const activity of outcomes) list.append(el('li',
          activity.title + ' - ' + activity.status + (activity.teachingNote ? ': ' + activity.teachingNote : '')));
        previous.append(list);
      }
      if (!actual && !outcomes.length) previous.append(el('p', 'No actual progress was recorded for this session.'));
    }
    pathwayUnits();
    previousProgress();
    if (!pilot) {
      const planning = section('Planned activities and actual progress');
      plannedReference(planning);
      const note = field(planning, 'Session notes', combinedNotes(data.content));
      note.rows = 1; note.maxLength = 40002; note.setAttribute('class', 'session-note');
      const settings = el('details');
      settings.append(el('summary', 'Session details'));
      notes.append(settings);
      settings.append(el('p', data.event.source === 'ambiguous' ?
        'Multiple timetable events match this time. No class has been selected; check the timetable. These notes belong to the date and slot, not a class.' :
        data.event.source === 'KAMAR' ? 'Timetable context: ' + data.event.title + '. Your plan does not change KAMAR.' :
        'Manually recorded commitment. No KAMAR timetable data is created or changed.',
        data.event.source === 'ambiguous' ? { role: 'alert' } : {}));
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
      const hint = el('p', prompts[type.value]); settings.append(hint);
      type.addEventListener('change', () => { hint.textContent = prompts[type.value]; data.content.session.type = type.value; });
      const evaluation = el('details'); evaluation.append(el('summary', 'Review and follow-up - complete later'));
      const reflection = field(evaluation, 'Later evaluation', data.content.evaluation); reflection.maxLength = 20000;
      notes.append(evaluation);
      originalNotes(); host.append(page);
      if (helpers.initialRoll) select('roll');
      else if (helpers.initialTrello) select(false);
      return { selectView: select, read: () => ({ note: note.value, actualProgress: '', evaluation: reflection.value, activities: [], ...savedSlotOutcomes(),
        session: { title: title.value, type: type.value, startTime: startTime.value, endTime: endTime.value,
          ...(data.event.classKey ? { classKey: data.event.classKey } : {}) } }),
        saved: () => {} };
    }
    const activities = section('Planned activities and actual progress');
    plannedReference(activities);
    const note = field(activities, 'Session notes', combinedNotes(data.content));
    note.rows = 1; note.maxLength = 40002; note.setAttribute('class', 'session-note');

    const advanced = el('details');
    advanced.append(el('summary', 'Linked lesson, routine and confirmed progress'));
    notes.append(advanced);
    const routine = el('section', '', { class: 'session-section' });
    routine.append(el('h3', 'Regular class routine')); advanced.append(routine);
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
    checkpoint.append(confirmCheckpoint, checkpointStatus); advanced.append(checkpoint);
    if (data.awaitingConfirmation.length) advanced.append(el('p',
      'Earlier sessions awaiting confirmation: ' + data.awaitingConfirmation.join(', ') + '. Suggestions use confirmed outcomes only.', { class: 'session-warning' }));

    advanced.append(el('p', 'Plan a flexible sequence. Status and actual-time edits autosave as a draft; use Confirm session progress to confirm outcomes. Blank actual time means not recorded, never the period length.'));
    const activityList = el('div', '', { class: 'session-activities' });
    advanced.append(activityList);
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
    advanced.append(add);
    const outcomeStatus = el('p', '', { role: 'status', 'aria-live': 'polite' });
    const confirm = el('button', 'Confirm session progress', { type: 'button', 'data-planner-navigation': '' });
    confirm.disabled = !data.canConfirm;
    confirm.addEventListener('click', helpers.confirm);
    advanced.append(confirm, outcomeStatus);
    if (!data.canConfirm) advanced.append(el('p', 'This is a future session. Prepare the plan now; confirm actual outcomes on the teaching day or later.'));
    const resources = el('section', '', { class: 'session-section' });
    resources.append(el('h3', 'Resources and preparation')); advanced.append(resources);
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
    const evaluation = el('details'); evaluation.append(el('summary', 'Detailed evaluation - complete later'));
    const reflection = field(evaluation, 'Later evaluation', data.content.evaluation); reflection.maxLength = 20000;
    notes.append(evaluation);
    originalNotes();
    host.append(page);
    if (helpers.initialRoll) select('roll');
    else if (helpers.initialTrello) select(false);
    function read() {
      return { note: note.value, actualProgress: '', evaluation: reflection.value, ...savedSlotOutcomes(), activities: rows.map(row => ({
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
    return { read, saved, selectView: select };
  }
  globalThis.plannerTeachingSession = { mount };
})();
