let optionsCache = {
  users: [],
  roles: []
};

const USER_USAGE_KEY = 'adminUserRolesEmailUsage';
const MAX_MOST_USED = 8;

function getCurrentStaffEmail() {
  try {
    const raw = sessionStorage.getItem('currentStaffUser');
    const parsed = raw ? JSON.parse(raw) : null;
    return String(parsed && parsed.email_school ? parsed.email_school : '').trim().toLowerCase();
  } catch (err) {
    return '';
  }
}

function withAdminIdentityHeaders(headers = {}) {
  const merged = { ...headers };
  const staffEmail = getCurrentStaffEmail();
  const role = String(sessionStorage.getItem('navbar_user_role') || '').trim().toLowerCase();
  if (staffEmail) merged['x-user-email'] = staffEmail;
  if (role) merged['x-user-role'] = role;
  return merged;
}

window.addEventListener('DOMContentLoaded', () => {
  const userTypeSelect = document.getElementById('userTypeSelect');
  const userIdentifierLabel = document.getElementById('userIdentifierLabel');
  const userSelect = document.getElementById('userEmailSelect');
  const emailInput = document.getElementById('userEmailInput');
  const addRoleBtn = document.getElementById('addRoleBtn');
  const runAuditBtn = document.getElementById('runPublicAccessAuditBtn');

  function syncUserTypeUi() {
    const userType = getSelectedUserType();
    if (userType === 'student') {
      userIdentifierLabel.textContent = 'Student ID:';
      emailInput.placeholder = 'student id_number';
      emailInput.type = 'text';
    } else {
      userIdentifierLabel.textContent = 'User Email:';
      emailInput.placeholder = 'user@example.com';
      emailInput.type = 'email';
    }
  }

  userTypeSelect.addEventListener('change', () => {
    syncUserTypeUi();
    userSelect.value = '';
    emailInput.value = '';
    renderUserProfile(null);
    fetchOptions();
  });

  userSelect.addEventListener('change', () => {
    if (userSelect.value) {
      emailInput.value = userSelect.value;
      bumpEmailUsage(getSelectedUserType(), userSelect.value);
      fetchUserProfile(getSelectedUserType(), userSelect.value);
    } else {
      renderUserProfile(null);
    }
  });

  addRoleBtn.addEventListener('click', addRoleToUser);
  if (runAuditBtn) {
    runAuditBtn.addEventListener('click', runPublicAccessAudit);
  }

  syncUserTypeUi();
  fetchOptions();
  fetchUserRoles();
});

function getSelectedUserType() {
  const el = document.getElementById('userTypeSelect');
  return el && el.value === 'student' ? 'student' : 'staff';
}

function runPublicAccessAudit() {
  const button = document.getElementById('runPublicAccessAuditBtn');
  const output = document.getElementById('publicAccessAuditResults');
  if (!button || !output) return;

  button.disabled = true;
  button.textContent = 'Running...';
  output.textContent = 'Running audit...';

  fetch('/api/auth/public-access-audit', {
    method: 'GET',
    headers: withAdminIdentityHeaders()
  })
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        throw new Error(data.error || 'Audit failed.');
      }

      const summary = `<div><b>Checked:</b> ${escapeHtml(String(data.totalChecked || 0))} &nbsp; <b>Flagged:</b> ${escapeHtml(String(data.flaggedCount || 0))} &nbsp; <b>Domain:</b> ${escapeHtml(data.allowedDomain || '')}</div>`;

      if (!Array.isArray(data.flagged) || data.flagged.length === 0) {
        output.innerHTML = `${summary}<div style="margin-top:0.35rem;color:#1f6a2f;">No school-domain identities are resolving to Public Access.</div>`;
        return;
      }

      const rows = data.flagged.map((entry) => {
        const sources = (entry.sources || []).join(', ');
        const details = (entry.details || []).filter(Boolean).slice(0, 3).join(' | ');
        return `
          <tr>
            <td style="padding:6px;border:1px solid #d7e0ea;">${escapeHtml(entry.email || '')}</td>
            <td style="padding:6px;border:1px solid #d7e0ea;">${escapeHtml(sources)}</td>
            <td style="padding:6px;border:1px solid #d7e0ea;">${escapeHtml(details || '-')}</td>
          </tr>
        `;
      }).join('');

      output.innerHTML = `
        ${summary}
        <div style="margin-top:0.45rem;color:#8b1f1f;"><b>Action needed:</b> these identities currently resolve to Public Access.</div>
        <div style="overflow:auto;margin-top:0.45rem;">
          <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
            <thead>
              <tr style="background:#f4f7fb;">
                <th style="text-align:left;padding:6px;border:1px solid #d7e0ea;">Identity</th>
                <th style="text-align:left;padding:6px;border:1px solid #d7e0ea;">Source</th>
                <th style="text-align:left;padding:6px;border:1px solid #d7e0ea;">CSV Detail</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    })
    .catch(err => {
      output.innerHTML = `<span style="color:#b00020;">Audit failed: ${escapeHtml(err.message)}</span>`;
    })
    .finally(() => {
      button.disabled = false;
      button.textContent = 'Run Public Access Audit';
    });
}

function showStatus(message, isError = false) {
  const msg = document.getElementById('roleStatusMsg');
  msg.textContent = message;
  msg.style.display = 'block';
  msg.style.background = isError ? '#f8d7da' : '#d4edda';
  msg.style.color = isError ? '#721c24' : '#155724';
}

function fetchOptions() {
  const userType = getSelectedUserType();
  fetch(`/api/user_roles/options?userType=${encodeURIComponent(userType)}`)
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        throw new Error(data.error || 'Failed to load options');
      }
      optionsCache = data;
      populateUserDropdown(data.users || []);
      populateRoleDropdown(data.roles || []);
    })
    .catch(err => {
      console.error('Error loading options:', err);
      showStatus(`Failed to load dropdown options: ${err.message}`, true);
    });
}

function populateUserDropdown(users = []) {
  const select = document.getElementById('userEmailSelect');
  const previousValue = select.value;
  const userType = getSelectedUserType();

  const sortedUsers = [...users].sort((a, b) =>
    String(a.label || a.value || '').localeCompare(String(b.label || b.value || ''), undefined, { sensitivity: 'base' })
  );
  const mostUsedIds = getMostUsedIdentifiers(userType, sortedUsers);
  const mostUsedSet = new Set(mostUsedIds);

  const emptyText = userType === 'student' ? '-- Select a student --' : '-- Select a user --';
  select.innerHTML = `<option value="">${emptyText}</option>`;

  if (mostUsedIds.length) {
    const mostUsedDivider = document.createElement('option');
    mostUsedDivider.disabled = true;
    mostUsedDivider.textContent = '──────── Most Used ────────';
    select.appendChild(mostUsedDivider);

    mostUsedIds.forEach(identifier => {
      const item = sortedUsers.find(u => String(u.value || '').toLowerCase() === identifier);
      if (item) appendUserOption(select, item.value, item.label || item.value);
    });

    const allDivider = document.createElement('option');
    allDivider.disabled = true;
    allDivider.textContent = userType === 'student' ? '──────── All Students ──────' : '──────── All Staff ─────────';
    select.appendChild(allDivider);
  }

  sortedUsers
    .filter(user => !mostUsedSet.has(String(user.value || '').toLowerCase()))
    .forEach(user => appendUserOption(select, user.value, user.label || user.value));

  if (previousValue) {
    const hasValue = Array.from(select.options).some(opt => opt.value === previousValue);
    if (hasValue) {
      select.value = previousValue;
    }
  }
}

function appendUserOption(select, value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.appendChild(option);
}

function getEmailUsage() {
  try {
    const raw = localStorage.getItem(USER_USAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    return {};
  }
}

function setEmailUsage(usage) {
  try {
    localStorage.setItem(USER_USAGE_KEY, JSON.stringify(usage));
  } catch (err) {
    // Ignore storage errors (private mode/quota issues).
  }
}

function bumpEmailUsage(userType, identifier) {
  const key = `${userType}:${String(identifier || '').trim().toLowerCase()}`;
  if (!key) return;
  const usage = getEmailUsage();
  usage[key] = (Number(usage[key]) || 0) + 1;
  setEmailUsage(usage);
}

function getMostUsedIdentifiers(userType, users = []) {
  const usage = getEmailUsage();
  const candidates = users
    .map(user => String(user.value || '').trim())
    .filter(Boolean)
    .map(identifier => ({
      identifier,
      key: `${userType}:${identifier.toLowerCase()}`,
      count: Number(usage[`${userType}:${identifier.toLowerCase()}`]) || 0
    }))
    .filter(item => item.count > 0)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.identifier.localeCompare(b.identifier, undefined, { sensitivity: 'base' });
    })
    .slice(0, MAX_MOST_USED);

  return candidates.map(item => item.identifier.toLowerCase());
}

function populateRoleDropdown(roles = []) {
  const select = document.getElementById('roleSelect');
  select.innerHTML = '<option value="">-- Select a role --</option>';
  roles.forEach(role => {
    const roleName = role.role_name;
    const option = document.createElement('option');
    option.value = roleName;
    option.textContent = formatRoleName(roleName);
    select.appendChild(option);
  });
}

function formatRoleName(roleName = '') {
  return roleName
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function fetchUserRoles() {
  fetch('/api/user_roles/all')
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        throw new Error(data.error || 'Failed to load user roles');
      }
      renderUserRolesTable(data.users || []);
    })
    .catch(err => {
      console.error('Error loading user roles:', err);
      showStatus(`Failed to load user role assignments: ${err.message}`, true);
    });
}

function fetchUserProfile(userType, identifier) {
  if (!identifier) {
    renderUserProfile(null);
    return;
  }

  fetch(`/api/user_roles/profile?userType=${encodeURIComponent(userType)}&identifier=${encodeURIComponent(identifier)}`)
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        throw new Error(data.error || 'Failed to load user profile');
      }
      renderUserProfile(data);
    })
    .catch(err => {
      console.error('Error loading user profile:', err);
      renderUserProfile({
        success: false,
        message: `Failed to load user profile: ${err.message}`
      });
    });
}

function renderUserProfile(profile) {
  const container = document.getElementById('userProfileContent');
  if (!profile) {
    container.innerHTML = 'Select a user to view staff profile, department, and weekly timetable.';
    return;
  }

  if (profile.success === false) {
    container.innerHTML = `<span style="color:#b00020;">${profile.message || 'Unable to load profile.'}</span>`;
    return;
  }

  if (profile.userType === 'student') {
    if (!profile.isStudent) {
      container.innerHTML = `
        <div><b>Student ID:</b> ${escapeHtml(profile.identifier || '')}</div>
        <div style="margin-top:0.4rem;color:#555;">No matching student profile found.</div>
      `;
      return;
    }

    const student = profile.student || {};
    const timetable = profile.timetable;
    let timetableHtml = '<div style="margin-top:0.5rem;color:#555;">No timetable found for this student.</div>';

    if (timetable && Array.isArray(timetable.week)) {
      const rows = timetable.week.map(dayRow => {
        const p1 = formatClasses(dayRow.periods?.P1);
        const p2 = formatClasses(dayRow.periods?.P2);
        const p3 = formatClasses(dayRow.periods?.P3);
        const p4 = formatClasses(dayRow.periods?.P4);
        const p5 = formatClasses(dayRow.periods?.P5);
        return `<tr>
          <td>${escapeHtml(dayRow.day || '')}</td>
          <td>${p1}</td>
          <td>${p2}</td>
          <td>${p3}</td>
          <td>${p4}</td>
          <td>${p5}</td>
        </tr>`;
      }).join('');

      timetableHtml = `
        <div style="margin-top:0.6rem;"><b>Weekly Timetable</b></div>
        <div style="overflow:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
            <thead>
              <tr style="background:#f1f4f8;">
                <th style="text-align:left; padding:6px; border:1px solid #d9e1ea;">Day</th>
                <th style="text-align:left; padding:6px; border:1px solid #d9e1ea;">P1</th>
                <th style="text-align:left; padding:6px; border:1px solid #d9e1ea;">P2</th>
                <th style="text-align:left; padding:6px; border:1px solid #d9e1ea;">P3</th>
                <th style="text-align:left; padding:6px; border:1px solid #d9e1ea;">P4</th>
                <th style="text-align:left; padding:6px; border:1px solid #d9e1ea;">P5</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    }

    container.innerHTML = `
      <div><b>Name:</b> ${escapeHtml(student.student_name || 'Unknown')}</div>
      <div><b>Student ID:</b> ${escapeHtml(student.id_number || profile.identifier || '')}</div>
      <div><b>Form Class:</b> ${escapeHtml(student.form_class || 'N/A')}</div>
      <div><b>Year Level:</b> ${escapeHtml(student.year_level || 'N/A')}</div>
      <div><b>Status:</b> ${escapeHtml(student.status || 'N/A')}</div>
      ${timetableHtml}
    `;
    return;
  }

  if (!profile.isStaff) {
    container.innerHTML = `
      <div><b>Email:</b> ${escapeHtml(profile.email || '')}</div>
      <div style="margin-top:0.4rem;color:#555;">No matching staff profile found.</div>
    `;
    return;
  }

  const staff = profile.staff || {};
  const dep = profile.department || {};
  const timetable = profile.timetable;

  let timetableHtml = '<div style="margin-top:0.5rem;color:#555;">No timetable found for this staff member.</div>';
  if (timetable && Array.isArray(timetable.week)) {
    const rows = timetable.week.map(dayRow => {
      const p1 = formatClasses(dayRow.periods?.P1);
      const p2 = formatClasses(dayRow.periods?.P2);
      const p3 = formatClasses(dayRow.periods?.P3);
      const p4 = formatClasses(dayRow.periods?.P4);
      const p5 = formatClasses(dayRow.periods?.P5);
      return `<tr>
        <td>${escapeHtml(dayRow.day || '')}</td>
        <td>${p1}</td>
        <td>${p2}</td>
        <td>${p3}</td>
        <td>${p4}</td>
        <td>${p5}</td>
      </tr>`;
    }).join('');

    timetableHtml = `
      <div style="margin-top:0.6rem;"><b>Weekly Timetable</b></div>
      <div style="font-size:0.9rem;color:#555; margin-bottom:0.35rem;">
        <span><b>Teacher Code:</b> ${escapeHtml(timetable.teacher_code || '')}</span>
        <span style="margin-left:1rem;"><b>Form Class:</b> ${escapeHtml(timetable.form_class || '')}</span>
      </div>
      <div style="overflow:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
          <thead>
            <tr style="background:#f1f4f8;">
              <th style="text-align:left; padding:6px; border:1px solid #d9e1ea;">Day</th>
              <th style="text-align:left; padding:6px; border:1px solid #d9e1ea;">P1</th>
              <th style="text-align:left; padding:6px; border:1px solid #d9e1ea;">P2</th>
              <th style="text-align:left; padding:6px; border:1px solid #d9e1ea;">P3</th>
              <th style="text-align:left; padding:6px; border:1px solid #d9e1ea;">P4</th>
              <th style="text-align:left; padding:6px; border:1px solid #d9e1ea;">P5</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  container.innerHTML = `
    <div><b>Name:</b> ${escapeHtml([staff.first_name, staff.last_name].filter(Boolean).join(' ')) || 'Unknown'}</div>
    <div><b>Email:</b> ${escapeHtml(staff.email_school || profile.email || '')}</div>
    <div><b>Staff Code:</b> ${escapeHtml(staff.code || 'N/A')}</div>
    <div><b>Title:</b> ${escapeHtml(staff.title || 'N/A')}</div>
    <div><b>Status:</b> ${escapeHtml(staff.status || 'N/A')}</div>
    <div style="margin-top:0.5rem;"><b>Department:</b> ${escapeHtml(dep.primary || 'N/A')}</div>
    <div><b>Department List:</b> ${escapeHtml(dep.all || 'N/A')}</div>
    ${timetableHtml}
  `;
}

function formatClasses(classes) {
  if (!Array.isArray(classes) || !classes.length) return '<span style="color:#888;">-</span>';
  return classes.map(c => escapeHtml(c)).join(', ');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderUserRolesTable(users = []) {
  const body = document.getElementById('userRolesBody');
  if (!users.length) {
    body.innerHTML = '<tr><td colspan="4" class="text-muted">No users found.</td></tr>';
    return;
  }

  body.innerHTML = users.map(u => {
    const badges = (u.roles || []).map(r => `<span class='role-badge'>${formatRoleName(r)}</span>`).join(' ');
    return `<tr>
      <td>${formatRoleName(u.user_type || 'staff')}</td>
      <td>${u.user_label || u.user_identifier || ''}</td>
      <td>${badges}</td>
      <td><button class='delete-btn' data-user-type='${u.user_type || 'staff'}' data-user-identifier='${u.user_identifier || ''}'>Remove Roles</button></td>
    </tr>`;
  }).join('');

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => removeRolesForUser(btn.dataset.userType, btn.dataset.userIdentifier));
  });
}

function addRoleToUser() {
  const emailInput = document.getElementById('userEmailInput');
  const userType = getSelectedUserType();
  const roleSelect = document.getElementById('roleSelect');
  const addRoleBtn = document.getElementById('addRoleBtn');

  const userIdentifier = (emailInput.value || '').trim();
  const roleName = (roleSelect.value || '').trim().toLowerCase();

  if (!userIdentifier) {
    showStatus(userType === 'student' ? 'Please select or enter a student ID.' : 'Please select or enter a user email.', true);
    return;
  }
  if (!roleName) {
    showStatus('Please select a role to add.', true);
    return;
  }

  addRoleBtn.disabled = true;
  addRoleBtn.textContent = 'Adding...';

  fetch('/api/user_roles/add', {
    method: 'POST',
    headers: withAdminIdentityHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ user_type: userType, user_identifier: userIdentifier, role_name: roleName })
  })
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        throw new Error(data.error || 'Failed to add role');
      }
      bumpEmailUsage(userType, userIdentifier);
      showStatus(data.message || 'Role added successfully.');
      fetchUserRoles();
      fetchOptions();
    })
    .catch(err => {
      console.error('Error adding role:', err);
      showStatus(`Failed to add role: ${err.message}`, true);
    })
    .finally(() => {
      addRoleBtn.disabled = false;
      addRoleBtn.textContent = 'Add Role';
    });
}

function removeRolesForUser(userType, userIdentifier) {
  if (!confirm(`Remove all additional roles for ${userIdentifier}?`)) {
    return;
  }

  fetch(`/api/user_roles/${encodeURIComponent(userType)}/${encodeURIComponent(userIdentifier)}`, {
    method: 'DELETE',
    headers: withAdminIdentityHeaders()
  })
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        throw new Error(data.error || 'Failed to remove roles');
      }
      showStatus(data.message || 'Roles removed successfully.');
      fetchUserRoles();
    })
    .catch(err => {
      console.error('Error removing roles:', err);
      showStatus(`Failed to remove roles: ${err.message}`, true);
    });
}
