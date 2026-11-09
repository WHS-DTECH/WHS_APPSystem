(() => {
  'use strict';
  const form = document.getElementById('history-filter');
  const year = document.getElementById('history-year');
  const term = document.getElementById('history-term');
  const status = document.getElementById('history-status');
  const rows = document.getElementById('history-rows');
  const types = { staff: 'Staff', student_details: 'Student details', student_timetable: 'Student timetable',
    teacher_timetable: 'Staff timetable', subjects: 'Subjects' };
  year.value = new Intl.DateTimeFormat('en-NZ', { year: 'numeric', timeZone: 'Pacific/Auckland' }).format(new Date());
  let loading = false;
  async function load() {
    if (loading || !form.reportValidity()) return;
    loading = true;
    const controls = [...form.querySelectorAll('input,select,button')];
    controls.forEach(control => { control.disabled = true; });
    status.setAttribute('role', 'status');
    status.textContent = 'Loading preserved datasets...';
    rows.replaceChildren();
    try {
      const query = new URLSearchParams({ year: year.value });
      if (term.value) query.set('term', term.value);
      const response = await fetch('/api/kamar-datasets?' + query, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load dataset history.');
      if (!Array.isArray(data.datasets)) throw new Error('Dataset history returned invalid data.');
      for (const dataset of data.datasets) {
        if (!/^[0-9a-f-]{36}$/i.test(dataset.id)) throw new Error('Dataset history returned an invalid identifier.');
        const row = document.createElement('tr');
        for (const value of [dataset.term, types[dataset.dataset_type] || dataset.dataset_type, dataset.source_date + ' ' + dataset.source_time,
          dataset.source_name, dataset.row_count, dataset.origin]) {
          const cell = document.createElement('td');
          cell.textContent = String(value); row.append(cell);
        }
        const cell = document.createElement('td'), link = document.createElement('a');
        link.href = '/api/kamar-datasets/' + dataset.id;
        link.textContent = 'Download saved dataset';
        cell.append(link); row.append(cell); rows.append(row);
      }
      status.textContent = data.datasets.length ? data.datasets.length + ' preserved dataset' +
        (data.datasets.length === 1 ? '' : 's') + '. No current data has been changed.' :
        'No preserved uploads for this selection. Archived CSVs must be imported separately; current tables are not historical term snapshots.';
    } catch (error) {
      console.error('Kamar history load failed:', error.message);
      rows.replaceChildren(); status.setAttribute('role', 'alert'); status.textContent = error.message;
    } finally {
      loading = false; controls.forEach(control => { control.disabled = false; });
    }
  }
  form.addEventListener('submit', event => { event.preventDefault(); void load(); });
  void load();
})();
