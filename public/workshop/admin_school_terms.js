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

function setStatus(type, message) {
  const el = document.getElementById('termsStatus');
  el.className = `admin-msg ${type}`;
  el.textContent = message;
  el.style.display = message ? 'block' : 'none';
}

function applyTermStyles(container) {
  const tables = container.querySelectorAll('table');
  tables.forEach(table => table.classList.add('terms-table'));

  const links = container.querySelectorAll('a');
  links.forEach(link => {
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener');
  });
}

async function loadTerms() {
  setStatus('admin-msg', 'Loading school terms and holidays...');

  try {
    const res = await fetch('/api/admin/school-terms', { cache: 'no-store' });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to load terms data.');
    }

    const termsContent = document.getElementById('termsContent');
    termsContent.innerHTML = data.html || '<p>No terms content found.</p>';
    applyTermStyles(termsContent);

    const timestamp = new Date(data.fetchedAt);
    document.getElementById('termsMeta').textContent = `Source: ${data.sourceUrl} | Last refreshed: ${timestamp.toLocaleString()}`;
    setStatus('admin-msg-success', 'Terms and holidays loaded successfully.');
  } catch (error) {
    setStatus('admin-msg-error', error.message || 'Unable to load school terms data.');
  }
}

async function initPage() {
  wireDropdowns();

  try {
    const userRes = await fetch('/api/user');
    const user = await userRes.json();
    if (!user) {
      document.getElementById('accessDenied').style.display = 'block';
      return;
    }

    const signInBtn = document.getElementById('googleSignIn');
    const chip = document.getElementById('userChip');
    if (signInBtn) signInBtn.style.display = 'none';
    if (chip) chip.style.display = 'inline-flex';

    const initialsEl = document.getElementById('userInitials');
    if (initialsEl) initialsEl.textContent = getInitials(user.name);

    const rolesRes = await fetch('/api/my-roles');
    const roles = await rolesRes.json();
    const roleEl = document.getElementById('userRoleBadge');
    if (roleEl) roleEl.textContent = getPrimaryRole(roles);

    const canView = roles.some(r => r.role === 'Admin' || r.role === 'Lead Teacher');
    if (!canView) {
      document.getElementById('accessDenied').style.display = 'block';
      return;
    }

    const adminMenu = document.getElementById('adminMenu');
    if (adminMenu) adminMenu.style.display = 'flex';
    document.getElementById('adminContent').style.display = 'block';

    document.getElementById('refreshTermsBtn').addEventListener('click', loadTerms);
    loadTerms();
  } catch {
    document.getElementById('accessDenied').style.display = 'block';
  }
}

initPage();
