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

function setAlert(type, message) {
  const alertBox = document.getElementById('topicsUploadAlert');
  if (!alertBox) return;
  alertBox.dataset.type = type;
  alertBox.textContent = message;
}

const TOPICS_STORAGE_KEY = 'whs_topics_data_v1';
let canImportTopics = false;

function generateId() {
  return 'topic_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
}

function loadTopicsStore() {
  try {
    const raw = localStorage.getItem(TOPICS_STORAGE_KEY);
    if (!raw) {
      return { topics: [], subTopics: [] };
    }

    const parsed = JSON.parse(raw);
    return {
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      subTopics: Array.isArray(parsed.subTopics) ? parsed.subTopics : [],
    };
  } catch {
    return { topics: [], subTopics: [] };
  }
}

function saveTopicsStore(store) {
  try {
    localStorage.setItem(TOPICS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // no-op
  }
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mergeImportedTopic(parsed) {
  const store = loadTopicsStore();
  const now = new Date().toISOString();
  const topicName = String(parsed.topicName || '').trim() || 'Imported Topic';
  const yearLevel = String(parsed.yearLevel || '').trim();
  const topicDetails = String(parsed.topicDetails || '').trim();
  const importedSubTopics = Array.isArray(parsed.subTopics) ? parsed.subTopics : [];
  const existingTopic = store.topics.find(topic => {
    const sameName = String(topic.name || '').trim().toLowerCase() === topicName.toLowerCase();
    const sameYear = String(topic.yearLevel || '').trim() === yearLevel;
    return sameName && sameYear;
  });

  let topicId = existingTopic ? existingTopic.id : generateId();
  let action = existingTopic ? 'updated' : 'added';

  if (existingTopic) {
    existingTopic.name = topicName;
    existingTopic.yearLevel = yearLevel;
    existingTopic.details = topicDetails;
    existingTopic.updatedAt = now;
  } else {
    store.topics.push({
      id: topicId,
      name: topicName,
      yearLevel,
      details: topicDetails,
      createdAt: now,
    });
  }

  store.subTopics = store.subTopics.filter(subTopic => subTopic.parentId !== topicId);

  for (const subTopic of importedSubTopics) {
    const subTopicName = String(subTopic.name || '').trim();
    if (!subTopicName) continue;
    store.subTopics.push({
      id: generateId(),
      parentId: topicId,
      name: subTopicName,
      details: String(subTopic.details || '').trim(),
      createdAt: now,
    });
  }

  saveTopicsStore(store);
  return { action, topicName, yearLevel, topicId, subTopicCount: importedSubTopics.length };
}

function renderPreview(parsed, result) {
  const panel = document.getElementById('topicsPreviewPanel');
  const summary = document.getElementById('topicsImportSummary');
  const body = document.getElementById('topicsPreviewBody');
  if (!panel || !summary || !body) return;

  const subTopics = Array.isArray(parsed.subTopics) ? parsed.subTopics : [];
  summary.textContent = `${result.action === 'updated' ? 'Updated' : 'Imported'} ${subTopics.length} sub-topics for ${parsed.topicName || 'the selected topic'} in ${parsed.yearLevel || 'the selected year level'}.`;

  body.innerHTML = `
    <div class="topic-import-summary">
      <div><strong>Topic:</strong> ${esc(parsed.topicName || 'Imported Topic')}</div>
      <div><strong>Year Level:</strong> ${esc(parsed.yearLevel || 'Not set')}</div>
      <div><strong>Stored as:</strong> ${esc(result.action === 'updated' ? 'Updated existing topic' : 'New topic')}</div>
      <div><strong>Sub-topics:</strong> ${subTopics.length}</div>
    </div>
    <div class="topic-import-list">
      ${subTopics.map(subTopic => `
        <article class="topic-import-item">
          <h3>${esc(subTopic.name || 'Untitled Sub-Topic')}</h3>
          <p>${esc(subTopic.details || 'No details provided.')}</p>
        </article>
      `).join('') || '<p class="topic-import-empty">No sub-topics were found in the document.</p>'}
    </div>
  `;

  panel.style.display = 'block';
}

async function hydrateUserState() {
  try {
    const userRes = await fetch('/api/user');
    const user = await userRes.json();

    if (!user) {
      setAlert('warning', 'Sign in with your school Google account before importing a topic document.');
      canImportTopics = false;
      document.getElementById('importTopicsBtn').disabled = true;
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
      canImportTopics = roles.some(r => r.role === 'Admin' || r.role === 'Lead Teacher');
      const badge = document.getElementById('userRoleBadge');
      if (badge) badge.textContent = primaryRole;

      if (roles.some(r => r.role === 'Admin' || r.role === 'Lead Teacher')) {
        const adminMenu = document.getElementById('adminMenu');
        if (adminMenu) adminMenu.style.display = 'flex';
      }
    } catch {
      canImportTopics = false;
    }

    if (canImportTopics) {
      setAlert('ready', `Signed in as ${primaryRole}. Choose a DOCX file to import.`);
    } else {
      setAlert('warning', `Signed in as ${primaryRole}, but topic importing is limited to Admin and Lead Teacher accounts.`);
    }

    document.getElementById('importTopicsBtn').disabled = !canImportTopics;
  } catch {
    setAlert('error', 'Unable to check sign-in status. Refresh and try again.');
    canImportTopics = false;
    document.getElementById('importTopicsBtn').disabled = true;
  }
}

function validateForm() {
  const file = document.getElementById('topicsDocxFile').files[0];
  document.getElementById('importTopicsBtn').disabled = !canImportTopics || !file;
}

document.getElementById('topicsUploadForm').addEventListener('change', validateForm);

document.getElementById('topicsUploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const fileInput = document.getElementById('topicsDocxFile');
  const yearLevel = document.getElementById('topicsUploadYearLevel').value;
  const file = fileInput.files[0];
  const alertBox = document.getElementById('topicsUploadAlert');

  if (!file) {
    setAlert('error', 'Please choose a DOCX file to import.');
    return;
  }

  const data = new FormData();
  data.append('year_level', yearLevel);
  data.append('topic_docx', file);

  const importBtn = document.getElementById('importTopicsBtn');
  importBtn.disabled = true;
  setAlert('saving', 'Importing topic document...');

  try {
    const res = await fetch('/api/topics/import-docx', {
      method: 'POST',
      body: data,
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Failed to import topic document.');
    }

    const stored = mergeImportedTopic(json);
    renderPreview(json, stored);
    setAlert('success', `${stored.action === 'updated' ? 'Updated' : 'Imported'} ${json.topicName} for ${json.yearLevel}. Open Topics Manager to review the saved topics and sub-topics.`);
    const openTopicsLink = document.getElementById('openTopicsManagerLink');
    if (openTopicsLink) {
      openTopicsLink.textContent = 'Open Topics Manager';
      openTopicsLink.href = '/topics.html';
    }
    document.getElementById('topicsUploadForm').reset();
    document.getElementById('topicsUploadYearLevel').value = json.yearLevel || 'Year 13';
    validateForm();
  } catch (error) {
    setAlert('error', error.message || 'Failed to import topic document.');
  } finally {
    validateForm();
  }
});

wireDropdowns();
hydrateUserState();
validateForm();