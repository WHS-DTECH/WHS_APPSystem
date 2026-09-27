const bodyEl = document.getElementById('assessment-standards-body');
const statusEl = document.getElementById('assessment-management-status');
const subjectSetFilter = document.getElementById('subject-set-filter');
const levelFilter = document.getElementById('level-filter');
const standardSearch = document.getElementById('standard-search');
const refreshBtn = document.getElementById('refresh-standards');

let allStandards = [];

function setStatus(message, isError) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#b63a3a' : '#37618a';
}

function escHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderRows(rows) {
  if (!bodyEl) return;

  if (!rows.length) {
    bodyEl.innerHTML = '<tr><td colspan="6" style="text-align:left; color:#5c7590;">No standards found for this filter.</td></tr>';
    return;
  }

  bodyEl.innerHTML = rows.map((row) => {
    const number = escHtml(row.standard_number || '');
    const name = escHtml(row.standard_name || '');
    const level = escHtml(row.level || '');
    const credits = escHtml(row.credits || '');
    const type = escHtml(row.assessment_type || '');
    const link = escHtml(row.nzqa_search_url || '');

    return `
      <tr>
        <td>${number}</td>
        <td>${name}</td>
        <td>${level}</td>
        <td>${credits}</td>
        <td>${type}</td>
        <td>${link ? `<a href="${link}" target="_blank" rel="noopener noreferrer">View</a>` : ''}</td>
      </tr>
    `;
  }).join('');
}

function populateSubjectOptions(rows) {
  if (!subjectSetFilter) return;

  const seen = new Set(['']);
  const options = ['<option value="">All subject sets</option>'];

  rows.forEach((row) => {
    const subject = String(row.subject_set || '').trim();
    if (!subject || seen.has(subject)) return;
    seen.add(subject);
    options.push(`<option value="${escHtml(subject)}">${escHtml(subject)}</option>`);
  });

  subjectSetFilter.innerHTML = options.join('');
}

function applyFilters() {
  const subject = String(subjectSetFilter?.value || '').trim().toLowerCase();
  const level = String(levelFilter?.value || '').trim().toLowerCase();
  const search = String(standardSearch?.value || '').trim().toLowerCase();

  const filtered = allStandards.filter((row) => {
    if (subject && String(row.subject_set || '').trim().toLowerCase() !== subject) return false;
    if (level && String(row.level || '').trim().toLowerCase() !== level) return false;

    if (search) {
      const hay = [
        row.standard_number,
        row.standard_name,
        row.subject_set,
      ].map((v) => String(v || '').toLowerCase()).join(' ');
      if (!hay.includes(search)) return false;
    }

    return true;
  });

  renderRows(filtered);
}

async function loadStandards() {
  setStatus('Loading NZQA standards...', false);

  try {
    const res = await fetch('/api/admin/assessment-standards', {
      credentials: 'include',
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load standards');

    allStandards = Array.isArray(data.standards) ? data.standards : [];
    populateSubjectOptions(allStandards);
    applyFilters();

    setStatus(`Loaded ${allStandards.length} standards from NZQA Level 1 Materials and Processing Technology listing.`, false);
  } catch (err) {
    allStandards = [];
    renderRows([]);
    setStatus(err.message || 'Could not load standards', true);
  }
}

subjectSetFilter?.addEventListener('change', applyFilters);
levelFilter?.addEventListener('change', applyFilters);
standardSearch?.addEventListener('input', applyFilters);
refreshBtn?.addEventListener('click', loadStandards);

loadStandards();
