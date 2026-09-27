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

const TOPICS_STORAGE_KEY = 'whs_topics_data_v1';

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
  return `<ul>${nodes.map(node => `
    <li>
      <span>${esc(node.text)}</span>
      ${node.children.length ? renderBulletNodes(node.children) : ''}
    </li>
  `).join('')}</ul>`;
}

function renderSubTopicPage() {
  const params = new URLSearchParams(window.location.search);
  const topicId = params.get('topicId') || '';
  const subTopicId = params.get('subTopicId') || '';

  const titleEl = document.getElementById('subTopicTitle');
  const topicNameEl = document.getElementById('parentTopicName');
  const detailsEl = document.getElementById('subTopicDetails');

  try {
    const raw = localStorage.getItem(TOPICS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const topics = Array.isArray(parsed.topics) ? parsed.topics : [];
    const subTopics = Array.isArray(parsed.subTopics) ? parsed.subTopics : [];

    const topic = topics.find(t => String(t.id) === topicId);
    const subTopic = subTopics.find(st => String(st.id) === subTopicId && String(st.parentId) === topicId);

    if (!topic || !subTopic) {
      titleEl.textContent = 'Sub-Topic Not Found';
      topicNameEl.textContent = '-';
      detailsEl.innerHTML = '<p>Could not find this sub-topic. It may have been deleted.</p>';
      return;
    }

    titleEl.textContent = subTopic.name || 'Untitled Sub-Topic';
    topicNameEl.textContent = topic.name || 'Untitled Topic';

    const nodes = parseBulletNodes(subTopic.details || '');
    if (nodes.length) {
      detailsEl.innerHTML = renderBulletNodes(nodes);
    } else {
      detailsEl.innerHTML = `<p>${esc(subTopic.details || '').replace(/\n/g, '<br />')}</p>`;
    }
  } catch {
    titleEl.textContent = 'Sub-Topic Not Found';
    topicNameEl.textContent = '-';
    detailsEl.innerHTML = '<p>Could not read saved topics data.</p>';
  }
}

wireDropdowns();
hydrateUserState();
renderSubTopicPage();
