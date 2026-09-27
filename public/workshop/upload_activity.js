// Admin dropdown toggle
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

const form = document.getElementById('uploadActivityForm');
const saveBtn = document.getElementById('saveActivityBtn');
const cancelBtn = document.getElementById('cancelUploadBtn');
const alertBox = document.getElementById('uploadAlert');

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

    setAlert('ready', 'Signed in. Your activity will be saved when you click Save Activity.');
    saveBtn.disabled = false;
  } catch {
    setAlert('error', 'Unable to check sign-in status. Refresh and try again.');
    saveBtn.disabled = true;
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const activityName = document.getElementById('activityName').value.trim();
  if (!activityName) {
    setAlert('error', 'Activity name is required.');
    return;
  }

  const imageInput = document.getElementById('outcomeImageFile');
  const file = imageInput.files[0];
  if (file && file.size > 8 * 1024 * 1024) {
    setAlert('error', 'Outcome image must be 8 MB or smaller.');
    return;
  }

  saveBtn.disabled = true;
  setAlert('saving', 'Saving activity...');

  try {
    const data = new FormData(form);
    const res = await fetch('/api/upload-activity', {
      method: 'POST',
      body: data,
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Failed to save activity.');
    }

    setAlert('success', `Activity saved successfully. Record #${json.id}`);
    form.reset();
  } catch (err) {
    setAlert('error', err.message || 'Failed to save activity.');
  } finally {
    saveBtn.disabled = false;
  }
});

cancelBtn.addEventListener('click', () => {
  window.location.href = '/';
});

hydrateUserState();
