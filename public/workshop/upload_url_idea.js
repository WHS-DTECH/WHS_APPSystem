document.addEventListener('DOMContentLoaded', () => {
  const dropdown = document.getElementById('adminMenu');
  if (!dropdown) return;
  const btn = dropdown.querySelector('.nav-dropdown-btn');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
    document.addEventListener('click', () => dropdown.classList.remove('open'));
  }
});

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

const form = document.getElementById('uploadUrlIdeaForm');
const saveBtn = document.getElementById('saveUrlIdeaBtn');
const cancelBtn = document.getElementById('cancelUrlIdeaBtn');
const alertBox = document.getElementById('uploadUrlAlert');

function setAlert(type, message) {
  alertBox.textContent = message;
  alertBox.dataset.type = type;
}

async function hydrateUserState() {
  try {
    const userRes = await fetch('/api/user');
    const user = await userRes.json();

    if (!user) {
      setAlert('warning', 'Not signed in. Sign in with your school Google account before saving.');
      saveBtn.disabled = true;
      return;
    }

    const signIn = document.getElementById('googleSignIn');
    const chip = document.getElementById('userChip');
    if (signIn) signIn.style.display = 'none';
    if (chip) chip.style.display = 'inline-flex';

    const initialsEl = document.getElementById('userInitials');
    if (initialsEl) initialsEl.textContent = getInitials(user.name);

    let primaryRole = 'Member';
    try {
      const rolesRes = await fetch('/api/my-roles');
      const roles = await rolesRes.json();
      primaryRole = getPrimaryRole(roles);
      if (roles.some(r => r.role === 'Admin')) {
        const adminMenu = document.getElementById('adminMenu');
        if (adminMenu) adminMenu.style.display = 'flex';
      }
    } catch {
      primaryRole = 'Member';
    }

    const badge = document.getElementById('userRoleBadge');
    if (badge) badge.textContent = primaryRole;

    setAlert('ready', 'Signed in. Your URL idea will be saved when you click Save URL Idea.');
    saveBtn.disabled = false;
  } catch {
    setAlert('error', 'Unable to check sign-in status. Refresh and try again.');
    saveBtn.disabled = true;
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const activityName = document.getElementById('urlIdeaName').value.trim();
  const urlField = form.elements.idea_url.value.trim();

  if (!activityName || !urlField) {
    setAlert('error', 'Activity name and URL are required.');
    return;
  }

  try {
    new URL(urlField);
  } catch {
    setAlert('error', 'Please enter a valid URL with http:// or https://');
    return;
  }

  saveBtn.disabled = true;
  setAlert('saving', 'Saving URL idea...');

  try {
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    const res = await fetch('/api/upload-url-idea', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to save URL idea.');

    setAlert('success', `URL idea saved. Record #${json.id}`);
    form.reset();
  } catch (err) {
    setAlert('error', err.message || 'Failed to save URL idea.');
  } finally {
    saveBtn.disabled = false;
  }
});

cancelBtn.addEventListener('click', () => {
  window.location.href = '/';
});

hydrateUserState();
