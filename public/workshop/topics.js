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

function setStatus(alertId, type, message) {
  const alert = document.getElementById(alertId);
  if (!alert) return;
  alert.dataset.type = type;
  alert.textContent = message;
  alert.style.display = message ? 'block' : 'none';
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseBulletNodes(text) {
  const lines = String(text || '').split(/\r?\n/);
  const root = [];
  const stack = [{ indent: -1, nodes: root }];
  let colonHeadingNode = null;

  for (const rawLine of lines) {
    if (!rawLine.trim()) {
      // Treat blank lines as section breaks so the next bullet can restart at top level.
      stack.length = 1;
      colonHeadingNode = null;
      continue;
    }

    const match = rawLine.match(/^(\s*)(?:[-*•]|\d+[.)])?\s*(.+)$/);
    if (!match) continue;

    const indentRaw = match[1] || '';
    const content = (match[2] || '').trim();
    if (!content) continue;

    const spaces = indentRaw.replace(/\t/g, '  ').length;
    const indent = Math.floor(spaces / 2);
    const node = { text: content, children: [] };
    const isColonHeading = /:\s*$/.test(content);

    // Heuristic for pasted bullet text: if top-level lines are not indented,
    // treat lines ending with ':' as section headers and nest following peers.
    if (indent === 0) {
      if (isColonHeading) {
        root.push(node);
        colonHeadingNode = node;
        stack.length = 1;
        continue;
      }

      if (colonHeadingNode) {
        colonHeadingNode.children.push(node);
        continue;
      }
    }

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    stack[stack.length - 1].nodes.push(node);
    stack.push({ indent, nodes: node.children });
  }

  return root;
}

function renderBulletNodes(nodes) {
  if (!nodes.length) return '';
  return `<ul class="subtopic-detail-list">${nodes.map(node => `
    <li>
      <span>${esc(node.text)}</span>
      ${node.children.length ? renderBulletNodes(node.children) : ''}
    </li>
  `).join('')}</ul>`;
}

function renderSubTopicDetails(details) {
  const nodes = parseBulletNodes(details);
  if (nodes.length) return renderBulletNodes(nodes);
  return esc(details).replace(/\n/g, '<br />');
}

const topicsStore = {
  topics: [],
  subTopics: [],
};

const TOPICS_STORAGE_KEY = 'whs_topics_data_v1';

function saveTopicsStore() {
  try {
    localStorage.setItem(TOPICS_STORAGE_KEY, JSON.stringify(topicsStore));
  } catch {
    // no-op
  }
}

function loadTopicsStore() {
  try {
    const raw = localStorage.getItem(TOPICS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    topicsStore.topics = Array.isArray(parsed.topics) ? parsed.topics : [];
    topicsStore.subTopics = Array.isArray(parsed.subTopics) ? parsed.subTopics : [];
  } catch {
    // no-op
  }
}

function generateId() {
  return 'topic_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function renderParentTopicOptions() {
  const select = document.getElementById('parentTopicId');
  if (!select) return;

  const currentValue = select.value;
  const options = ['<option value="">Select a topic by name</option>'];

  for (const topic of topicsStore.topics) {
    options.push(`<option value="${esc(topic.id)}">${esc(topic.name)}</option>`);
  }

  select.innerHTML = options.join('');

  if (currentValue && topicsStore.topics.some(t => t.id === currentValue)) {
    select.value = currentValue;
  }
}

function getTopicNameById(topicId) {
  const topic = topicsStore.topics.find(t => t.id === topicId);
  return topic ? topic.name : '';
}

function renderTopics() {
  const container = document.getElementById('topicsDisplay');
  if (!topicsStore.topics.length) {
    container.innerHTML = '<p style="color:#888;font-style:italic;">No topics added yet.</p>';
    return;
  }

  const html = topicsStore.topics.map(topic => `
    <div class="topics-item">
      <div class="topics-item-header">
        <strong>ID:</strong> ${esc(topic.id)}<br />
        <strong>Name:</strong> ${esc(topic.name)}<br />
        <strong>Year Level:</strong> ${esc(topic.yearLevel || 'Not set')}<br />
        <strong>Content:</strong> ${esc(topic.details)}
      </div>
      <button class="btn btn-sm btn-danger" onclick="deleteTopic('${esc(topic.id)}')">Delete</button>
    </div>
  `).join('');

  container.innerHTML = html;
}

function renderSubTopics() {
  const container = document.getElementById('subTopicsDisplay');
  if (!topicsStore.subTopics.length) {
    container.innerHTML = '<p style="color:#888;font-style:italic;">No sub-topics added yet.</p>';
    return;
  }

  const html = topicsStore.subTopics.map(st => `
    <div class="topics-item">
      <div class="topics-item-header">
        <strong>Sub-Topic ID:</strong> ${esc(st.id)}<br />
        <strong>Parent ID:</strong> ${esc(st.parentId)}<br />
        <strong>Parent Name:</strong> ${esc(getTopicNameById(st.parentId) || 'Unknown')}<br />
        <strong>Sub-Topic Name:</strong> ${esc(st.name || 'Untitled Sub-Topic')}<br />
        <strong>Details:</strong> ${renderSubTopicDetails(st.details)}
      </div>
      <button class="btn btn-sm btn-danger" onclick="deleteSubTopic('${esc(st.id)}')">Delete</button>
    </div>
  `).join('');

  container.innerHTML = html;
}

function deleteTopic(topicId) {
  topicsStore.topics = topicsStore.topics.filter(t => t.id !== topicId);
  topicsStore.subTopics = topicsStore.subTopics.filter(st => st.parentId !== topicId);
  saveTopicsStore();
  renderParentTopicOptions();
  renderTopics();
  renderSubTopics();
  setStatus('topicAlert', 'success', 'Topic deleted.');
}

function deleteSubTopic(subTopicId) {
  topicsStore.subTopics = topicsStore.subTopics.filter(st => st.id !== subTopicId);
  saveTopicsStore();
  renderSubTopics();
  setStatus('subTopicAlert', 'success', 'Sub-topic deleted.');
}

async function hydrateUserState() {
  try {
    const userRes = await fetch('/api/user');
    const user = await userRes.json();

    if (!user) return;

    const signInBtn = document.getElementById('googleSignIn');
    const chip = document.getElementById('userChip');
    if (signInBtn) signInBtn.style.display = 'none';
    if (chip) chip.style.display = 'inline-flex';

    const initialsEl = document.getElementById('userInitials');
    if (initialsEl) initialsEl.textContent = getInitials(user.name);

    try {
      const rolesRes = await fetch('/api/my-roles');
      const roles = await rolesRes.json();
      const roleEl = document.getElementById('userRoleBadge');
      if (roleEl) roleEl.textContent = getPrimaryRole(roles);

      if (roles.some(r => r.role === 'Admin' || r.role === 'Lead Teacher')) {
        const adminMenu = document.getElementById('adminMenu');
        if (adminMenu) adminMenu.style.display = 'flex';
      }
    } catch {
      // no-op
    }
  } catch {
    // no-op
  }
}

document.getElementById('topicForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('topicName').value.trim();
  const yearLevel = document.getElementById('topicYearLevel').value;
  const details = document.getElementById('topicDetails').value.trim();

  if (!name) {
    setStatus('topicAlert', 'error', 'Topic name cannot be empty.');
    return;
  }

  if (!yearLevel) {
    setStatus('topicAlert', 'error', 'Please select a year level.');
    return;
  }

  if (!details) {
    setStatus('topicAlert', 'error', 'Topic details cannot be empty.');
    return;
  }

  const topicId = generateId();
  topicsStore.topics.push({
    id: topicId,
    name,
    yearLevel,
    details,
    createdAt: new Date().toISOString(),
  });

  saveTopicsStore();
  document.getElementById('topicForm').reset();
  renderParentTopicOptions();
  renderTopics();
  setStatus('topicAlert', 'success', `Topic added with ID: ${topicId}`);
});

document.getElementById('subTopicForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const parentId = document.getElementById('parentTopicId').value;
  const name = document.getElementById('subTopicName').value.trim();
  const details = document.getElementById('subTopicDetails').value.trim();

  if (!parentId) {
    setStatus('subTopicAlert', 'error', 'Please select a parent topic.');
    return;
  }

  if (!details) {
    setStatus('subTopicAlert', 'error', 'Sub-topic details cannot be empty.');
    return;
  }

  if (!name) {
    setStatus('subTopicAlert', 'error', 'Sub-topic name cannot be empty.');
    return;
  }

  if (!topicsStore.topics.some(t => t.id === parentId)) {
    setStatus('subTopicAlert', 'error', `Parent topic ID "${parentId}" not found.`);
    return;
  }

  const subTopicId = generateId();
  topicsStore.subTopics.push({
    id: subTopicId,
    parentId,
    name,
    details,
    createdAt: new Date().toISOString(),
  });

  saveTopicsStore();
  document.getElementById('subTopicForm').reset();
  renderSubTopics();
  setStatus('subTopicAlert', 'success', `Sub-topic added with ID: ${subTopicId}`);
});

wireDropdowns();
hydrateUserState();
loadTopicsStore();
renderParentTopicOptions();
renderTopics();
renderSubTopics();
