document.addEventListener('DOMContentLoaded', function () {
  const masterNameInput = document.getElementById('masterNameInput');
  const masterCategorySelect = document.getElementById('masterCategorySelect');
  const addMasterBtn = document.getElementById('addMasterBtn');
  const memberMasterSelect = document.getElementById('memberMasterSelect');
  const memberKeywordInput = document.getElementById('memberKeywordInput');
  const addMemberBtn = document.getElementById('addMemberBtn');
  const linkMasterSelect = document.getElementById('linkMasterSelect');
  const linkCategorySelect = document.getElementById('linkCategorySelect');
  const addLinkedCategoryBtn = document.getElementById('addLinkedCategoryBtn');
  const masterStatus = document.getElementById('masterStatus');
  const mastersBody = document.getElementById('mastersBody');

  let categories = [];
  let masters = [];

  function escHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setStatus(message, type) {
    masterStatus.className = 'mk-status' + (type ? ' ' + type : '');
    masterStatus.textContent = message || '';
  }

  async function requestJson(url, options) {
    const settings = options || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, settings.headers || {});
    const res = await fetch(url, Object.assign({}, settings, { credentials: 'include', headers }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || ('Request failed (' + res.status + ')'));
    }
    return data || {};
  }

  function renderCategorySelects() {
    const options = categories.map((cat) => `<option value="${escHtml(String(cat.id))}">${escHtml(cat.name || '')}</option>`).join('');
    masterCategorySelect.innerHTML = options || '<option value="">No categories</option>';
    linkCategorySelect.innerHTML = options || '<option value="">No categories</option>';
  }

  function renderMasterPicker() {
    const options = masters.length
      ? masters.map((m) => `<option value="${escHtml(String(m.id))}">${escHtml(m.name || '')}</option>`).join('')
      : '<option value="">No masters</option>';
    memberMasterSelect.innerHTML = options;
    linkMasterSelect.innerHTML = options;
  }

  function renderMastersTable() {
    if (!masters.length) {
      mastersBody.innerHTML = '<tr><td colspan="4" class="mk-empty">No master keywords yet.</td></tr>';
      return;
    }

    mastersBody.innerHTML = masters.map((master) => {
      const memberList = Array.isArray(master.members) ? master.members : [];
      const linkedCategories = Array.isArray(master.linked_categories) ? master.linked_categories : [];
      const membersHtml = memberList.length
        ? memberList.map((member) => {
            const memberId = member && member.id != null ? String(member.id) : '';
            const memberKeyword = member && member.keyword != null ? String(member.keyword) : '';
            return '<span class="mk-tag">'
              + escHtml(memberKeyword)
              + ' <button class="mk-btn danger delete-member-btn" style="padding:0.08rem 0.28rem;font-size:0.7rem;margin-left:0.2rem;" data-member-id="' + escHtml(memberId) + '">x</button>'
              + '</span>';
          }).join('')
        : '<span class="mk-empty">No members</span>';

      const linkedHtml = linkedCategories.length
        ? linkedCategories.map((linked) => {
            const categoryId = linked && linked.id != null ? String(linked.id) : '';
            const categoryName = linked && linked.name != null ? String(linked.name) : '';
            const isPrimary = String(master.aisle_category_id) === String(categoryId);
            if (isPrimary) {
              return '<span class="mk-tag" style="border-color:#16a34a;background:#ecfdf3;color:#166534;">'
                + escHtml(categoryName)
                + ' (Primary)</span>';
            }
            return '<span class="mk-tag">'
              + escHtml(categoryName)
              + ' <button class="mk-btn danger delete-linked-category-btn" style="padding:0.08rem 0.28rem;font-size:0.7rem;margin-left:0.2rem;" data-master-id="'
              + escHtml(String(master.id))
              + '" data-category-id="'
              + escHtml(categoryId)
              + '">x</button>'
              + '</span>';
          }).join('')
        : '<span class="mk-empty">No linked categories</span>';

      return '<tr>'
        + '<td><strong>' + escHtml(master.name || '') + '</strong></td>'
        + '<td>' + escHtml(master.aisle_category || '') + '</td>'
        + '<td>' + linkedHtml + '</td>'
        + '<td>' + membersHtml + '</td>'
        + '<td>'
        + '<button class="mk-btn warn edit-master-btn" data-master-id="' + escHtml(String(master.id)) + '">Edit Master</button> '
        + '<button class="mk-btn danger delete-master-btn" data-master-id="' + escHtml(String(master.id)) + '">Delete Master</button>'
        + '</td>'
        + '</tr>';
    }).join('');
  }

  async function loadCategories() {
    const data = await requestJson('/api/aisle_category');
    categories = Array.isArray(data.categories) ? data.categories : [];
    renderCategorySelects();
  }

  async function loadMasters() {
    const data = await requestJson('/api/aisle_keywords/masters');
    masters = Array.isArray(data.masters) ? data.masters : [];
    renderMasterPicker();
    renderMastersTable();
  }

  addMasterBtn.addEventListener('click', async function () {
    const name = String(masterNameInput.value || '').trim();
    const aisleCategoryId = Number(masterCategorySelect.value || 0);
    if (!name || !aisleCategoryId) {
      setStatus('Master name and aisle category are required.', 'error');
      return;
    }

    addMasterBtn.disabled = true;
    try {
      await requestJson('/api/aisle_keywords/masters/add', {
        method: 'POST',
        body: JSON.stringify({ name, aisle_category_id: aisleCategoryId })
      });
      masterNameInput.value = '';
      await loadMasters();
      setStatus('Master keyword added.', 'ok');
    } catch (err) {
      setStatus('Error: ' + (err.message || String(err)), 'error');
    }
    addMasterBtn.disabled = false;
  });

  addMemberBtn.addEventListener('click', async function () {
    const masterId = Number(memberMasterSelect.value || 0);
    const keyword = String(memberKeywordInput.value || '').trim();
    if (!masterId || !keyword) {
      setStatus('Choose a master and enter a member keyword.', 'error');
      return;
    }

    addMemberBtn.disabled = true;
    try {
      await requestJson('/api/aisle_keywords/masters/members/add', {
        method: 'POST',
        body: JSON.stringify({ master_keyword_id: masterId, keyword })
      });
      memberKeywordInput.value = '';
      await loadMasters();
      setStatus('Member keyword added.', 'ok');
    } catch (err) {
      setStatus('Error: ' + (err.message || String(err)), 'error');
    }
    addMemberBtn.disabled = false;
  });

  addLinkedCategoryBtn.addEventListener('click', async function () {
    const masterId = Number(linkMasterSelect.value || 0);
    const aisleCategoryId = Number(linkCategorySelect.value || 0);
    if (!masterId || !aisleCategoryId) {
      setStatus('Choose a master and aisle category to link.', 'error');
      return;
    }

    addLinkedCategoryBtn.disabled = true;
    try {
      await requestJson('/api/aisle_keywords/masters/categories/add', {
        method: 'POST',
        body: JSON.stringify({ master_keyword_id: masterId, aisle_category_id: aisleCategoryId })
      });
      await loadMasters();
      setStatus('Aisle category linked to master.', 'ok');
    } catch (err) {
      setStatus('Error: ' + (err.message || String(err)), 'error');
    }
    addLinkedCategoryBtn.disabled = false;
  });

  mastersBody.addEventListener('click', async function (event) {
    const target = event.target;
    if (!target) return;

    if (target.classList.contains('delete-member-btn')) {
      const memberId = Number(target.getAttribute('data-member-id') || 0);
      if (!memberId) return;
      if (!window.confirm('Delete this member keyword from the master group?')) return;

      try {
        await requestJson('/api/aisle_keywords/masters/members/delete', {
          method: 'POST',
          body: JSON.stringify({ id: memberId })
        });
        await loadMasters();
        setStatus('Member keyword deleted from master group.', 'ok');
      } catch (err) {
        setStatus('Error: ' + (err.message || String(err)), 'error');
      }
      return;
    }

    if (target.classList.contains('delete-linked-category-btn')) {
      const masterId = Number(target.getAttribute('data-master-id') || 0);
      const categoryId = Number(target.getAttribute('data-category-id') || 0);
      if (!masterId || !categoryId) return;
      if (!window.confirm('Remove this linked aisle category from master?')) return;

      try {
        await requestJson('/api/aisle_keywords/masters/categories/delete', {
          method: 'POST',
          body: JSON.stringify({ master_keyword_id: masterId, aisle_category_id: categoryId })
        });
        await loadMasters();
        setStatus('Linked aisle category removed from master.', 'ok');
      } catch (err) {
        setStatus('Error: ' + (err.message || String(err)), 'error');
      }
      return;
    }

    if (target.classList.contains('delete-master-btn')) {
      const masterId = Number(target.getAttribute('data-master-id') || 0);
      if (!masterId) return;
      if (!window.confirm('Delete this master keyword and all its member mappings?')) return;

      try {
        await requestJson('/api/aisle_keywords/masters/delete', {
          method: 'POST',
          body: JSON.stringify({ id: masterId })
        });
        await loadMasters();
        setStatus('Master keyword deleted.', 'ok');
      } catch (err) {
        setStatus('Error: ' + (err.message || String(err)), 'error');
      }
      return;
    }

    if (target.classList.contains('edit-master-btn')) {
      const masterId = Number(target.getAttribute('data-master-id') || 0);
      const master = masters.find((m) => Number(m.id) === masterId);
      if (!master) return;

      const newName = window.prompt('Master name', String(master.name || ''));
      if (newName == null) return;
      const cleanName = String(newName).trim();
      if (!cleanName) {
        setStatus('Master name cannot be empty.', 'error');
        return;
      }

      const categoryPrompt = categories.map((cat) => cat.id + ': ' + cat.name).join('\n');
      const newCategoryRaw = window.prompt('Aisle category ID for this master:\n' + categoryPrompt, String(master.aisle_category_id || ''));
      if (newCategoryRaw == null) return;
      const newCategoryId = Number(newCategoryRaw || 0);
      if (!newCategoryId) {
        setStatus('Valid aisle category ID required.', 'error');
        return;
      }

      try {
        await requestJson('/api/aisle_keywords/masters/edit', {
          method: 'POST',
          body: JSON.stringify({ id: masterId, name: cleanName, aisle_category_id: newCategoryId })
        });
        await loadMasters();
        setStatus('Master keyword updated.', 'ok');
      } catch (err) {
        setStatus('Error: ' + (err.message || String(err)), 'error');
      }
    }
  });

  Promise.all([loadCategories(), loadMasters()])
    .then(() => setStatus('Ready.', ''))
    .catch((err) => setStatus('Error: ' + (err.message || String(err)), 'error'));
});