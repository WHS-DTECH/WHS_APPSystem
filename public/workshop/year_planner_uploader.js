function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
}

function getPrimaryRole(roles) {
  const priority = ['Admin', 'Lead Teacher', 'Teacher', 'Technician', 'Manager', 'Staff', 'Student'];
  for (const p of priority) {
    if (roles.some(r => r.role === p)) return p;
  }
  return 'Member';
}

function wireDropdowns() {
  document.querySelectorAll('.nav-dropdown').forEach(dropdown => {
    const btn = dropdown.querySelector('.nav-dropdown-btn');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.nav-dropdown.open').forEach(d => d.classList.remove('open'));
  });
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const form = document.getElementById('plannerUploadForm');
const alertBox = document.getElementById('plannerUploadAlert');
const importBtn = document.getElementById('importPlannerBtn');
const previewPanel = document.getElementById('plannerPreviewPanel');
const previewBody = document.getElementById('plannerPreviewBody');
const summaryEl = document.getElementById('plannerImportSummary');
const openYearPlannerLink = document.getElementById('openYearPlannerLink');
let canImportPlanner = false;

const PLANNER_GROUP_DEFAULTS = {
  Junior: 'Year 7',
  Middle: 'Year 9',
  Senior: 'Year 11',
};

function setAlert(type, message) {
  alertBox.dataset.type = type;
  alertBox.textContent = message;
}

function setPreview(template, yearLevel) {
  if (!template || !Array.isArray(template.rows) || !template.rows.length) {
    previewPanel.style.display = 'none';
    return;
  }

  previewBody.innerHTML = template.rows.map(row => `
    <tr class="planner-term-header">
      <td>${esc(row.term)}</td>
      <td>${esc(row.weeks)}</td>
      <td>${esc(row.unitStandard)}</td>
      <td>${esc(row.unitCode)}</td>
      <td>${esc(row.level)}</td>
      <td>${esc(row.version)}</td>
      <td>${esc(row.credits)}</td>
    </tr>
  `).join('');

  summaryEl.textContent = `Imported ${template.rows.length} planner rows for ${yearLevel} from ${template.fileName || 'the uploaded document'}.`;
  previewPanel.style.display = 'block';
}

async function hydrateUserState() {
  try {
    const userRes = await fetch('/api/user');
    const user = await userRes.json();

    if (!user) {
      setAlert('warning', 'Sign in with your school Google account before importing a planner document.');
      canImportPlanner = false;
      importBtn.disabled = true;
      return;
    }

    const signInBtn = document.getElementById('googleSignIn');
    const chip = document.getElementById('userChip');
    if (signInBtn) signInBtn.style.display = 'none';
    if (chip) chip.style.display = 'inline-flex';

    const initialsEl = document.getElementById('userInitials');
    if (initialsEl) initialsEl.textContent = getInitials(user.name);

    let primaryRole = 'Member';
    try {
      const rolesRes = await fetch('/api/my-roles');
      const roles = await rolesRes.json();
      primaryRole = getPrimaryRole(roles);
      canImportPlanner = roles.some(r => r.role === 'Admin' || r.role === 'Lead Teacher');
      const badge = document.getElementById('userRoleBadge');
      if (badge) badge.textContent = primaryRole;

      if (roles.some(r => r.role === 'Admin' || r.role === 'Lead Teacher')) {
        const adminMenu = document.getElementById('adminMenu');
        if (adminMenu) adminMenu.style.display = 'flex';
      }
    } catch {
      // no-op
      canImportPlanner = false;
    }

    if (canImportPlanner) {
      setAlert('ready', `Signed in as ${primaryRole}. Choose a DOCX file to import.`);
    } else {
      setAlert('warning', `Signed in as ${primaryRole}, but planner importing is limited to Admin and Lead Teacher accounts.`);
    }

    importBtn.disabled = !canImportPlanner;
  } catch {
    setAlert('error', 'Unable to check sign-in status. Refresh and try again.');
    canImportPlanner = false;
    importBtn.disabled = true;
  }
}

function validateForm() {
  const file = document.getElementById('plannerDocxFile').files[0];
  importBtn.disabled = !canImportPlanner || !file || !form;
}

form.addEventListener('change', validateForm);

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const fileInput = document.getElementById('plannerDocxFile');
  const selectedYearLevel = document.getElementById('plannerUploadYearLevel').value;
  const yearLevel = PLANNER_GROUP_DEFAULTS[selectedYearLevel] || selectedYearLevel;
  const file = fileInput.files[0];

  if (!file) {
    setAlert('error', 'Please choose a DOCX file to import.');
    return;
  }

  const data = new FormData();
  data.append('year_level', yearLevel);
  data.append('planner_docx', file);

  importBtn.disabled = true;
  setAlert('saving', 'Importing planner document...');

  try {
    const res = await fetch('/api/planning/import-year-planner', {
      method: 'POST',
      body: data,
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Failed to import planner document.');
    }

    const template = {
      fileName: json.fileName,
      importedAt: json.importedAt,
      planner: json.planner,
    };

    setPreview(template, json.yearLevel);
    const selectedLabel = selectedYearLevel === yearLevel ? json.yearLevel : `${selectedYearLevel} (${json.yearLevel})`;
    setAlert('success', `Imported ${json.fileName} for ${selectedLabel}. Open Year Planner and select ${selectedLabel}.`);
    if (openYearPlannerLink) {
      openYearPlannerLink.href = `/year_planner.html?yearLevel=${encodeURIComponent(json.yearLevel)}`;
      openYearPlannerLink.textContent = `Open Year Planner (${selectedLabel})`;
    }
    form.reset();
    validateForm();
  } catch (error) {
    setAlert('error', error.message || 'Failed to import planner document.');
  } finally {
    validateForm();
  }
});

wireDropdowns();
hydrateUserState();
validateForm();
