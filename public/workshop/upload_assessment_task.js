const authArea = document.getElementById('authArea');
const googleSignIn = document.getElementById('googleSignIn');
const userChip = document.getElementById('userChip');
const userInitials = document.getElementById('userInitials');
const userRoleBadge = document.getElementById('userRoleBadge');
const adminMenu = document.getElementById('adminMenu');

const alertBox = document.getElementById('uploadAssessmentAlert');
const form = document.getElementById('uploadAssessmentForm');
const saveBtn = document.getElementById('saveAssessmentBtn');
const cancelBtn = document.getElementById('cancelAssessmentBtn');
const standardSelect = document.getElementById('standardSelect');
const standardDetails = document.getElementById('standardDetails');

let currentUser = null;
let standards = [];

function setAlert(message, type = 'warning') {
  alertBox.textContent = message;
  alertBox.setAttribute('data-type', type);
}

function initialsFromName(name) {
  const clean = String(name || '').trim();
  if (!clean) return 'U';
  const parts = clean.split(/\s+/).slice(0, 2);
  return parts.map(part => part[0].toUpperCase()).join('');
}

function toggleDropdown(button, panel) {
  const expanded = button.getAttribute('aria-expanded') === 'true';
  button.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  panel.classList.toggle('open', !expanded);
}

function setupDropdowns() {
  document.querySelectorAll('.nav-dropdown').forEach(dropdown => {
    const button = dropdown.querySelector('.nav-dropdown-btn');
    const panel = dropdown.querySelector('.nav-dropdown-panel');
    if (!button || !panel) return;

    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', event => {
      event.preventDefault();
      toggleDropdown(button, panel);
    });

    dropdown.addEventListener('mouseleave', () => {
      button.setAttribute('aria-expanded', 'false');
      panel.classList.remove('open');
    });
  });

  document.addEventListener('click', event => {
    document.querySelectorAll('.nav-dropdown').forEach(dropdown => {
      if (dropdown.contains(event.target)) return;
      const button = dropdown.querySelector('.nav-dropdown-btn');
      const panel = dropdown.querySelector('.nav-dropdown-panel');
      if (!button || !panel) return;
      button.setAttribute('aria-expanded', 'false');
      panel.classList.remove('open');
    });
  });
}

function parseStandardsFromManagerScript(scriptText) {
  const marker = 'const NZQA_STANDARDS =';
  const start = scriptText.indexOf(marker);
  if (start === -1) return [];

  const arrayStart = scriptText.indexOf('[', start);
  if (arrayStart === -1) return [];

  let depth = 0;
  let inString = false;
  let quote = '';
  let escaped = false;

  for (let i = arrayStart; i < scriptText.length; i++) {
    const ch = scriptText[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      continue;
    }

    if (ch === '[') depth++;
    if (ch === ']') {
      depth--;
      if (depth === 0) {
        const rawArray = scriptText.slice(arrayStart, i + 1);
        // Existing manager data uses plain object literals with quoted values, which can be safely parsed.
        return JSON.parse(rawArray);
      }
    }
  }

  return [];
}

async function loadStandards() {
  try {
    const response = await fetch('/admin_assessment_management.js', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Could not load standards manager source.');
    const scriptText = await response.text();
    standards = parseStandardsFromManagerScript(scriptText);

    if (!Array.isArray(standards) || !standards.length) {
      setAlert('No standards found. Please check Assessment Standards Manager data.', 'warning');
      return;
    }

    standards
      .slice()
      .sort((a, b) => Number(a.level) - Number(b.level) || String(a.standard).localeCompare(String(b.standard)))
      .forEach(item => {
        const option = document.createElement('option');
        option.value = item.standard;
        option.textContent = `${item.standard} - ${item.name} (L${item.level}, ${item.credits} credits)`;
        standardSelect.appendChild(option);
      });
  } catch (error) {
    console.error(error);
    setAlert('Unable to load standards from Assessment Standards Manager.', 'error');
  }
}

function updateStandardDetails() {
  const selected = standards.find(item => String(item.standard) === standardSelect.value);
  if (!selected) {
    standardDetails.value = '';
    return;
  }
  standardDetails.value = `Standard ${selected.standard} | ${selected.name}\nLevel ${selected.level} | ${selected.credits} Credits | ${selected.type}\nNZQA link: ${selected.url}`;
}

function setSignedInState(user, roles = []) {
  const displayName = user?.name || user?.email || 'User';
  googleSignIn.style.display = 'none';
  userChip.style.display = 'inline-flex';
  userInitials.textContent = initialsFromName(displayName);
  userRoleBadge.textContent = roles[0] || 'Staff';

  const elevated = roles.some(role => role === 'Admin' || role === 'Lead Teacher');
  adminMenu.style.display = elevated ? 'inline-block' : 'none';

  saveBtn.disabled = false;
  setAlert('Signed in. Complete the form and save to upload the assessment task.', 'success');
}

function setSignedOutState() {
  authArea.style.display = 'flex';
  googleSignIn.style.display = 'inline-flex';
  userChip.style.display = 'none';
  adminMenu.style.display = 'none';
  saveBtn.disabled = true;
  setAlert('Not signed in. Sign in with your school Google account before saving.', 'warning');
}

async function loadCurrentUser() {
  try {
    const userRes = await fetch('/api/user', { credentials: 'same-origin' });
    if (!userRes.ok) {
      setSignedOutState();
      return;
    }

    const userData = await userRes.json();
    if (!userData?.loggedIn || !userData?.user) {
      setSignedOutState();
      return;
    }

    currentUser = userData.user;
    const rolesRes = await fetch('/api/my-roles', { credentials: 'same-origin' });
    const rolesData = rolesRes.ok ? await rolesRes.json() : { roles: [] };
    const roles = Array.isArray(rolesData.roles) ? rolesData.roles : [];

    setSignedInState(currentUser, roles);
  } catch (error) {
    console.error(error);
    setSignedOutState();
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();

  if (!currentUser) {
    setAlert('Please sign in before saving.', 'warning');
    return;
  }

  const filesInput = form.querySelector('input[name="supporting_images"]');
  if (filesInput.files.length > 5) {
    setAlert('You can upload up to 5 supporting images.', 'error');
    return;
  }

  saveBtn.disabled = true;
  setAlert('Saving assessment task...', 'info');

  try {
    const formData = new FormData(form);
    const response = await fetch('/api/upload-assessment-task', {
      method: 'POST',
      credentials: 'same-origin',
      body: formData,
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to save assessment task.');
    }

    setAlert(`Assessment task saved (ID ${data.id}).`, 'success');
    form.reset();
    standardDetails.value = '';
  } catch (error) {
    console.error(error);
    setAlert(error.message || 'Failed to save assessment task.', 'error');
  } finally {
    saveBtn.disabled = false;
  }
});

cancelBtn.addEventListener('click', () => {
  window.location.href = '/';
});

standardSelect.addEventListener('change', updateStandardDetails);
setupDropdowns();
loadStandards();
loadCurrentUser();
